import { Listener } from "@sapphire/framework";
import type {
	ButtonInteraction,
	Interaction,
	ModalSubmitInteraction,
} from "discord.js";
import { buildTrialVotePollEmbed } from "../services/embedBuilders.js";
import {
	createFeedback,
	parseFeedbackModalCustomId,
} from "../services/feedbackService.js";
import {
	resolveGuildDisplayName,
	saveGuildSettings,
	validateRaidReminderSettings,
} from "../services/guildSettings.js";
import { audit, logger } from "../services/logger.js";
import { refreshGuildRaidReminderSchedule } from "../services/raidReminderScheduler.js";
import {
	buildTrialVoteButtons,
	isVoteCustomId,
	parseVoteCustomId,
	recordTrialVote,
} from "../services/voteService.js";
import { findActiveTrial } from "../services/trialService.js";

async function handleSettingsModal(
	interaction: ModalSubmitInteraction,
	listener: Listener,
): Promise<void> {
	const officerChannelId = interaction.fields
		.getSelectedChannels("officerChannelId")
		?.first()?.id;
	const trialRoleId = interaction.fields
		.getSelectedRoles("trialRoleId")
		?.first()?.id;
	const raiderRoleId = interaction.fields
		.getSelectedRoles("raiderRoleId")
		?.first()?.id;
	const raidScheduleCronRaw = interaction.fields
		.getTextInputValue("raidScheduleCron")
		.trim();
	const raidThresholdRaw = interaction.fields
		.getTextInputValue("raidAttendanceReminderThreshold")
		.trim();

	if (!officerChannelId || !trialRoleId || !raiderRoleId) {
		await interaction.reply({
			content: "All fields are required",
			flags: ["Ephemeral"],
		});
		return;
	}

	if (!interaction.guildId) {
		await interaction.reply({
			content: "Guild ID is missing.",
			flags: ["Ephemeral"],
		});
		return;
	}

	const raidThreshold =
		raidThresholdRaw.length === 0 ? null : Number(raidThresholdRaw);
	const validation = validateRaidReminderSettings({
		raidScheduleCron:
			raidScheduleCronRaw.length === 0 ? null : raidScheduleCronRaw,
		raidAttendanceReminderThreshold: raidThreshold,
	});

	if (!validation.valid) {
		await interaction.reply({
			content: validation.reason,
			flags: ["Ephemeral"],
		});
		return;
	}

	await saveGuildSettings(listener.container.prisma, {
		guildId: interaction.guildId,
		officerChannelId,
		trialRoleId,
		raiderRoleId,
		raidScheduleCron: validation.normalizedCron,
		raidAttendanceReminderThreshold: validation.normalizedThreshold,
	});

	await refreshGuildRaidReminderSchedule(
		{
			prisma: listener.container.prisma,
			client: listener.container.client,
		},
		interaction.guildId,
	);

	audit(interaction.guildId, "settings.updated", interaction.user.id, {
		officerChannelId,
		trialRoleId,
		raiderRoleId,
		raidScheduleCron: validation.normalizedCron,
		raidAttendanceReminderThreshold: validation.normalizedThreshold,
	});

	await interaction.reply({
		content: "Settings updated!",
		flags: ["Ephemeral"],
	});
}

async function handleFeedbackModal(
	interaction: ModalSubmitInteraction,
	listener: Listener,
): Promise<void> {
	const feedbackContext = parseFeedbackModalCustomId(interaction.customId);
	if (!feedbackContext) {
		await interaction.reply({
			content: "Feedback context is missing. Please rerun `/feedback`.",
			flags: ["Ephemeral"],
		});
		return;
	}

	if (!interaction.guildId) {
		await interaction.reply({
			content: "Guild context is missing.",
			flags: ["Ephemeral"],
		});
		return;
	}

	await interaction.deferReply({ flags: ["Ephemeral"] });

	const performance = Number(
		interaction.fields.getTextInputValue("performance"),
	);
	const attitude = Number(interaction.fields.getTextInputValue("attitude"));
	const focus = Number(interaction.fields.getTextInputValue("focus"));
	const late = interaction.fields.getCheckbox("late");
	const comments = interaction.fields.getTextInputValue("comments").trim();

	const values = [performance, attitude, focus];
	const areScoresValid = values.every(
		(value) => Number.isInteger(value) && value >= 1 && value <= 5,
	);
	if (!areScoresValid) {
		await interaction.editReply({
			content:
				"Performance, attitude, and focus must be whole numbers from 1 to 5.",
		});
		return;
	}

	const activeTrial = await findActiveTrial(
		listener.container.prisma,
		interaction.guildId,
		feedbackContext.targetId,
	);

	if (!activeTrial) {
		await interaction.editReply({
			content: "This user no longer has an active trial. Feedback was not saved.",
		});
		return;
	}

	const result = await createFeedback(listener.container.prisma, {
		guildId: interaction.guildId,
		trialId: activeTrial.id,
		targetId: feedbackContext.targetId,
		officerId: interaction.user.id,
		performance,
		attitude,
		focus,
		late,
		comments: comments.length > 0 ? comments : undefined,
	});

	if (!result.created) {
		const content =
			result.reason === "trial_not_active"
				? "This trial is no longer active. Feedback was not saved."
				: "Trial not found for this server. Feedback was not saved.";

		logger.warn(
			{
				guildId: interaction.guildId,
				trialId: activeTrial.id,
				officerId: interaction.user.id,
				reason: result.reason,
			},
			"Feedback submission rejected.",
		);

		await interaction.editReply({ content });
		return;
	}

	audit(interaction.guildId, "feedback.submitted", interaction.user.id, {
		trialId: activeTrial.id,
		targetId: feedbackContext.targetId,
	});

	await interaction.editReply({
		content: "Feedback received and saved. Thank you!",
	});
}
async function handleVoteButton(
	interaction: ButtonInteraction,
	listener: Listener,
): Promise<boolean> {
	if (!isVoteCustomId(interaction.customId)) {
		return false;
	}

	const voteContext = parseVoteCustomId(interaction.customId);
	if (!voteContext) {
		await interaction.reply({
			content:
				"Vote context is invalid. Please create a new poll with `/vote`.",
			flags: ["Ephemeral"],
		});
		return true;
	}

	if (!interaction.guildId) {
		await interaction.reply({
			content: "Guild context is missing.",
			flags: ["Ephemeral"],
		});
		return true;
	}

	await interaction.deferReply({ flags: ["Ephemeral"] });

	const result = await recordTrialVote(listener.container.prisma, {
		guildId: interaction.guildId,
		pollId: voteContext.pollId,
		officerId: interaction.user.id,
		option: voteContext.option,
		sourceMessageId: interaction.message.id,
	});

	if (!result.recorded) {
		const content =
			result.reason === "poll_not_found"
				? "This poll no longer exists. Please create a new one with `/vote`."
				: result.reason === "wrong_guild"
					? "This poll belongs to another server and cannot be used here."
					: result.reason === "poll_closed"
						? "This poll is closed."
						: "This button no longer matches the active poll message. Please create a new poll with `/vote`.";

		await interaction.editReply({ content });
		return true;
	}

	const logoUrl = listener.container.client.user?.displayAvatarURL({
		extension: "png",
		size: 256,
	});
	const targetDisplayName =
		result.poll.targetDisplayName ??
		(await resolveGuildDisplayName(
			listener.container.client,
			interaction.guildId,
			result.poll.targetId,
			result.poll.targetId,
		));

	const embed = buildTrialVotePollEmbed(
		{
			targetDisplayName,
			targetId: result.poll.targetId,
			trialId: result.poll.trialId,
			pollId: result.poll.pollId,
			open: result.poll.open,
			passVotes: result.poll.passVotes,
			failVotes: result.poll.failVotes,
			extendVotes: result.poll.extendVotes,
			totalVotes: result.poll.totalVotes,
		},
		logoUrl,
	);

	try {
		await interaction.message.edit({
			embeds: [embed],
			components: buildTrialVoteButtons(result.poll.pollId, !result.poll.open),
		});
	} catch (error) {
		console.error("Failed to refresh vote poll message:", error);
		await interaction.editReply({
			content:
				"Your vote was recorded, but I could not refresh the poll message.",
		});
		return true;
	}

	await interaction.editReply({ content: "Your vote has been recorded." });
	return true;
}

export class InteractionCreateListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: "interactionCreate",
			once: false,
		});
	}

	public override async run(interaction: Interaction) {
		if (interaction.isButton()) {
			const handled = await handleVoteButton(interaction, this);
			if (handled) {
				return;
			}
		}

		if (interaction.isModalSubmit()) {
			if (interaction.customId === "settingsModal") {
				await handleSettingsModal(interaction, this);
				return;
			}

			await handleFeedbackModal(interaction, this);
		}
	}
}
