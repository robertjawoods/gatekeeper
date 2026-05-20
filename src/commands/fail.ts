import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
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
import type { AppContext } from "../types.js";

export default {
	data: new SlashCommandBuilder()
		.setName("fail")
		.setDescription("Fails the trial")
		.addUserOption((option) =>
			option
				.setName("target")
				.setDescription("The user to fail the trial for")
				.setRequired(true),
		),
	async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
		const target = interaction.options.getUser("target");
		const guild = interaction.guild;

		if (!guild || !interaction.guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const log = createGuildLogger(interaction.guildId);

		if (!target) {
			await interaction.reply({
				content: "Target user is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		let settings: Awaited<ReturnType<typeof getGuildSettings>>;
		let resolvedTrialStartTime: Date | null = null;
		let trialDisplayName: string | null = null;

		try {
			settings = await getGuildSettings(context.prisma, interaction.guildId);
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
				context.prisma,
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
					context.prisma,
					interaction.guildId,
					result.trialId,
				);
				if (closeResult.closed && closeResult.messageId) {
					try {
						const channel = await context.client.channels.fetch(
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
				context.client,
				interaction.guildId,
				target.id,
				target.displayName,
			));
		const officerDisplayName = await resolveGuildDisplayName(
			context.client,
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
		const logoUrl = context.client.user?.displayAvatarURL({
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
			context.client,
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
	},
};
