import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type Guild,
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

async function getValidatedTarget(interaction: ChatInputCommandInteraction) {
	const target = interaction.options.getUser("target");
	if (!target) {
		await interaction.reply({
			content: "Target user is required.",
			flags: ["Ephemeral"],
		});
		return null;
	}

	return target;
}

async function getValidatedGuildContext(interaction: TrialCommandInteraction) {
	const guild = interaction.guild;
	const guildId = interaction.guildId;

	if (!guild || !guildId) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: ["Ephemeral"],
		});
		return null;
	}

	return { guild, guildId };
}

async function getSettingsOrReply(
	interaction: TrialCommandInteraction,
	command: Command,
	guildId: string,
) {
	try {
		return await getGuildSettings(command.container.prisma, guildId);
	} catch (error) {
		if (error instanceof GuildSettingsMissingError) {
			await interaction.reply({
				content:
					"Server settings have not been configured yet. Run `/settings` first.",
				flags: ["Ephemeral"],
			});
			return null;
		}

		createGuildLogger(guildId).error(
			{ err: error },
			"Error retrieving guild settings.",
		);
		await interaction.reply({
			content:
				"An error occurred while retrieving server settings. Please try again later.",
			flags: ["Ephemeral"],
		});
		return null;
	}
}

async function updateRolesOrReply(
	interaction: TrialCommandInteraction,
	guild: Guild,
	userId: string,
	trialRoleId: string,
	raiderRoleId: string,
) {
	try {
		const member = await guild.members.fetch(userId);
		await member.roles.remove(trialRoleId);
		await member.roles.add(raiderRoleId);
		return true;
	} catch (error) {
		createGuildLogger(guild.id).error(
			{ userId, trialRoleId, raiderRoleId, err: error },
			"Error updating member roles on pass.",
		);
		await interaction.reply({
			content:
				"Trial was passed, but I could not update the member roles. Please check my role permissions.",
			flags: ["Ephemeral"],
		});
		return false;
	}
}

// Passing a trial should update the trial entry in the database, remove the trial role, add the raider role, and reply with a confirmation message.

export class PassCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "pass",
			description: "Passes the trial",
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
							.setDescription("The user to pass the trial for")
							.setRequired(true),
					),
			{ idHints: ["1507106765685391470"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Pass Trial").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139675435827271",
					"1507141188329799793",
					"1507142711935897629",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = await getValidatedTarget(interaction);
		if (!target) {
			return;
		}

		await this.runPass(interaction, target);
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

		await this.runPass(interaction, interaction.targetUser);
	}

	private async runPass(interaction: TrialCommandInteraction, target: User) {
		const guildContext = await getValidatedGuildContext(interaction);
		if (!guildContext) {
			return;
		}

		const { guild, guildId } = guildContext;
		const log = createGuildLogger(guildId);

		const settings = await getSettingsOrReply(interaction, this, guildId);
		if (!settings) {
			return;
		}

		let resolvedTrialStartTime: Date | null = null;
		let trialDisplayName: string | null = null;

		try {
			const result = await resolveTrial(
				this.container.prisma,
				guildId,
				target.id,
				true,
			);
			if (!result.updated) {
				log.info(
					{ targetId: target.id },
					"Pass rejected: no active trial found.",
				);
				await interaction.reply({
					content: `No active trial found for ${target.tag}.`,
					flags: ["Ephemeral"],
				});
				return;
			}
			log.info(
				{ targetId: target.id, trialId: result.trialId },
				"Trial marked as passed.",
			);
			audit(guildId, "trial.passed", interaction.user.id, {
				targetId: target.id,
				trialId: result.trialId,
			});
			resolvedTrialStartTime = result.startTime ?? null;
			trialDisplayName = result.userDisplayName ?? null;

			if (result.trialId) {
				const closeResult = await closeTrialVotePoll(
					this.container.prisma,
					guildId,
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
							"Failed to disable vote poll buttons after trial passed.",
						);
					}
				}
			}
		} catch (error) {
			log.error({ targetId: target.id, err: error }, "Error passing trial.");
			await interaction.reply({
				content:
					"An error occurred while passing the trial. Please try again later.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const rolesUpdated = await updateRolesOrReply(
			interaction,
			guild,
			target.id,
			settings.trialRoleId,
			settings.raiderRoleId,
		);
		if (!rolesUpdated) {
			return;
		}

		const displayName =
			trialDisplayName ??
			(await resolveGuildDisplayName(
				this.container.client,
				guildId,
				target.id,
				target.displayName,
			));
		const officerDisplayName = await resolveGuildDisplayName(
			this.container.client,
			guildId,
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
			"passed",
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
					"Trial was passed, but I could not send the update to the officer channel. Please check channel settings and permissions.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.reply({
			content: "Posted pass update in the officer channel.",
			flags: ["Ephemeral"],
		});
	}
}
