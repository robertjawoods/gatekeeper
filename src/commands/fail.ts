import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { buildTrialResolvedEmbed } from "../services/embedBuilders.js";
import {
	GuildSettingsMissingError,
	getGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "../services/guildSettings.js";
import { audit, createGuildLogger } from "../services/logger.js";
import {
	projectTrialExpectedEndDate,
	resolveTrial,
} from "../services/trialService.js";
import {
	buildTrialVoteButtons,
	closeTrialVotePoll,
} from "../services/voteService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

export class FailCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "fail",
			description: "Fails the trial",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName(this.name)
					.setDescription(this.description)
					.addUserOption((option) =>
						option
							.setName("target")
							.setDescription("The user to fail the trial for")
							.setRequired(true),
					),
			{ idHints: ["1507106766935162921"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Fail Trial").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139676618752263",
					"1507141189860593746",
					"1507142713533923581",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = interaction.options.getUser("target");
		if (!target) {
			await interaction.reply({
				content: "Target user is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runFail(interaction, target);
	}

	public override async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	) {
		if (!interaction.isUserContextMenuCommand()) {
			await interaction.reply({
				content: "This command can only be used from a user context menu.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runFail(interaction, interaction.targetUser);
	}

	private async runFail(interaction: TrialCommandInteraction, target: User) {
		const guild = interaction.guild;

		if (!guild || !interaction.guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const log = createGuildLogger(interaction.guildId);

		let settings: Awaited<ReturnType<typeof getGuildSettings>>;
		let resolvedTrialStartTime: Date | null = null;
		let trialDisplayName: string | null = null;

		try {
			settings = await getGuildSettings(
				this.container.prisma,
				interaction.guildId,
			);
		} catch (error) {
			if (error instanceof GuildSettingsMissingError) {
				await interaction.reply({
					content:
						"Server settings have not been configured yet. Run `/settings` first.",
					flags: ["Ephemeral"],
				});
				return;
			}

			log.error({ err: error }, "Error retrieving guild settings.");
			await interaction.reply({
				content:
					"An error occurred while retrieving server settings. Please try again later.",
				flags: ["Ephemeral"],
			});
			return;
		}

		try {
			const result = await resolveTrial(
				this.container.prisma,
				interaction.guildId,
				target.id,
				false,
			);
			if (!result.updated) {
				log.info(
					{ targetId: target.id },
					"Fail rejected: no active trial found.",
				);
				await interaction.reply({
					content: `No active trial found for ${target.tag}.`,
					flags: ["Ephemeral"],
				});
				return;
			}
			log.info(
				{ targetId: target.id, trialId: result.trialId },
				"Trial marked as failed.",
			);
			audit(interaction.guildId, "trial.failed", interaction.user.id, {
				targetId: target.id,
				trialId: result.trialId,
			});
			resolvedTrialStartTime = result.startTime ?? null;
			trialDisplayName = result.userDisplayName ?? null;

			if (result.trialId) {
				const closeResult = await closeTrialVotePoll(
					this.container.prisma,
					interaction.guildId,
					result.trialId,
				);
				if (closeResult.closed && closeResult.messageId) {
					try {
						const channel = await this.container.client.channels.fetch(
							settings.officerChannelId,
						);
						if (channel?.isTextBased()) {
							const msg = await channel.messages.fetch(closeResult.messageId);
							await msg.edit({
								components: buildTrialVoteButtons(closeResult.pollId, true),
							});
						}
					} catch (error) {
						log.error(
							{ err: error },
							"Failed to disable vote poll buttons after trial failed.",
						);
					}
				}
			}
		} catch (error) {
			log.error({ targetId: target.id, err: error }, "Error failing trial.");
			await interaction.reply({
				content:
					"An error occurred while failing the trial. Please try again later.",
				flags: ["Ephemeral"],
			});
			return;
		}

		try {
			const member = await guild.members.fetch(target.id);
			await member.roles.remove(settings.trialRoleId);
		} catch (error) {
			log.error(
				{ targetId: target.id, trialRoleId: settings.trialRoleId, err: error },
				"Error removing trial role on fail.",
			);
			await interaction.reply({
				content:
					"Trial was failed, but I could not remove the trial role. Please check my role permissions.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const displayName =
			trialDisplayName ??
			(await resolveGuildDisplayName(
				this.container.client,
				interaction.guildId,
				target.id,
				target.displayName,
			));
		const officerDisplayName = await resolveGuildDisplayName(
			this.container.client,
			interaction.guildId,
			interaction.user.id,
			interaction.user.username,
		);
		const projectedEndDate = resolvedTrialStartTime
			? projectTrialExpectedEndDate(
					resolvedTrialStartTime,
					settings.raidScheduleCron,
					settings.raidAttendanceReminderThreshold,
				)
			: null;
		const logoUrl = this.container.client.user?.displayAvatarURL({
			extension: "png",
			size: 256,
		});
		const embed = buildTrialResolvedEmbed(
			"failed",
			{
				memberDisplayName: displayName,
				memberId: target.id,
				officerDisplayName,
				officerId: interaction.user.id,
				startedAt: resolvedTrialStartTime ?? new Date(),
				expectedCompletionDate: projectedEndDate,
			},
			logoUrl,
		);
		const sendResult = await sendOfficerChannelMessage(
			this.container.client,
			settings.officerChannelId,
			{
				embeds: [embed.toJSON()],
			},
		);

		if (!sendResult.delivered) {
			await interaction.reply({
				content:
					"Trial was failed, but I could not send the update to the officer channel. Please check channel settings and permissions.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.reply({
			content: "Posted fail update in the officer channel.",
			flags: ["Ephemeral"],
		});
	}
}
