import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { buildFeedbackSummaryEmbed } from "../services/embedBuilders.js";
import { getMemberFeedbackSummary } from "../services/feedbackService.js";
import {
	GuildSettingsMissingError,
	getGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "../services/guildSettings.js";
import { createGuildLogger } from "../services/logger.js";
import { projectTrialExpectedEndDate } from "../services/trialService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

export class SummaryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "summary",
			description: "Shows trial feedback summary for a member",
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
							.setName("member")
							.setDescription("The member to summarize feedback for")
							.setRequired(true),
					),
			{ idHints: ["1507106762896052334"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder
					.setName("View Trial Summary")
					.setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139591918977176",
					"1507141186635173968",
					"1507142623800983634",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const member = interaction.options.getUser("member");
		if (!member) {
			await interaction.reply({
				content: "Member is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runSummary(interaction, member);
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

		await this.runSummary(interaction, interaction.targetUser);
	}

	private async runSummary(interaction: TrialCommandInteraction, member: User) {
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		let settings: Awaited<ReturnType<typeof getGuildSettings>>;

		try {
			settings = await getGuildSettings(this.container.prisma, guildId);
		} catch (error) {
			if (error instanceof GuildSettingsMissingError) {
				await interaction.reply({
					content:
						"Server settings have not been configured yet. Run `/settings` first.",
					flags: ["Ephemeral"],
				});
				return;
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
			return;
		}

		try {
			const result = await getMemberFeedbackSummary(
				this.container.prisma,
				guildId,
				member.id,
			);
			const displayName =
				result.outcome === "no_feedback" && result.userDisplayName
					? result.userDisplayName
					: await resolveGuildDisplayName(
							this.container.client,
							guildId,
							member.id,
							member.displayName,
						);

			if (result.outcome === "no_active_trial") {
				createGuildLogger(guildId).info(
					{ memberId: member.id },
					"Summary requested but no active trial found.",
				);
			} else if (result.outcome === "no_feedback") {
				createGuildLogger(guildId).info(
					{ memberId: member.id, trialId: result.trialId },
					"Summary requested but no feedback yet.",
				);
			} else {
				createGuildLogger(guildId).info(
					{
						memberId: member.id,
						trialId: result.summary.trialId,
						feedbackCount: result.summary.feedbackCount,
					},
					"Summary retrieved.",
				);
			}

			const expectedCompletionDate =
				result.outcome === "no_active_trial"
					? null
					: projectTrialExpectedEndDate(
							result.outcome === "no_feedback"
								? result.trialStartTime
								: result.summary.trialStartTime,
							settings.raidScheduleCron,
							settings.raidAttendanceReminderThreshold,
						);
			const logoUrl = this.container.client.user?.displayAvatarURL({
				extension: "png",
				size: 256,
			});
			const embed = buildFeedbackSummaryEmbed(
				displayName,
				result,
				expectedCompletionDate,
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
						"I could not send the summary to the officer channel. Please check channel settings and permissions.",
					flags: ["Ephemeral"],
				});
				return;
			}

			await interaction.reply({
				content: "Posted the trial summary in the officer channel.",
				flags: ["Ephemeral"],
			});
		} catch (error) {
			createGuildLogger(guildId).error(
				{ memberId: member.id, err: error },
				"Error retrieving trial feedback summary.",
			);
			await interaction.reply({
				content:
					"An error occurred while retrieving the trial feedback summary. Please try again later.",
				flags: ["Ephemeral"],
			});
		}
	}
}
