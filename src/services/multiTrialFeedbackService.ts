import type { SapphireClient } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { buildTrialFeedbackBoardEmbed } from "./embedBuilders.js";
import { loadGuildSettings, sendOfficerChannelMessage } from "./guildSettings.js";
import { createGuildLogger } from "./logger.js";

const TRIAL_FEEDBACK_BUTTON_PREFIX = "trialfb";
const MAX_BUTTONS_PER_ROW = 5;
const MAX_BUTTONS_TOTAL = 25;
const MAX_BUTTON_LABEL_LENGTH = 80;
const TRIAL_FEEDBACK_BUTTON_STYLES = [
	ButtonStyle.Primary,
	ButtonStyle.Success,
	ButtonStyle.Secondary,
	ButtonStyle.Danger,
] as const;

export type TrialFeedbackButtonContext = {
	trialId: number;
};

type TrialFeedbackBoardEntry = {
	trialId: number;
	trialUserId: string;
	displayName: string;
	feedbackCount: number;
	startTime: Date;
};

export type PostTrialFeedbackBoardWorkflowResult = {
	content: string;
};

function truncateLabel(value: string): string {
	if (value.length <= MAX_BUTTON_LABEL_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_BUTTON_LABEL_LENGTH - 3)}...`;
}

function chunkButtons(
	buttons: ButtonBuilder[],
	size: number,
): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];

	for (let index = 0; index < buttons.length; index += size) {
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				buttons.slice(index, index + size),
			),
		);
	}

	return rows;
}

export function buildTrialFeedbackButtonCustomId(trialId: number): string {
	return `${TRIAL_FEEDBACK_BUTTON_PREFIX}:${trialId}`;
}

export function parseTrialFeedbackButtonCustomId(
	customId: string,
): TrialFeedbackButtonContext | null {
	const [prefix, trialIdRaw] = customId.split(":");
	if (prefix !== TRIAL_FEEDBACK_BUTTON_PREFIX || !trialIdRaw) {
		return null;
	}

	const trialId = Number(trialIdRaw);
	if (!Number.isInteger(trialId) || trialId <= 0) {
		return null;
	}

	return { trialId };
}

async function getActiveTrialFeedbackEntries(
	prisma: PrismaClient,
	guildId: string,
	feedbackSince?: Date,
): Promise<TrialFeedbackBoardEntry[]> {
	const activeTrials = await prisma.trial.findMany({
		where: {
			guildId,
			active: true,
		},
		orderBy: {
			startTime: "desc",
		},
		select: {
			id: true,
			userId: true,
			userDisplayName: true,
			startTime: true,
		},
	});

	if (activeTrials.length === 0) {
		return [];
	}

	if (!feedbackSince) {
		return activeTrials.map((trial) => ({
			trialId: trial.id,
			trialUserId: trial.userId,
			displayName: trial.userDisplayName ?? trial.userId,
			feedbackCount: 0,
			startTime: trial.startTime,
		}));
	}

	const trialIds = activeTrials.map((trial) => trial.id);
	const feedbackCounts = await prisma.feedback.groupBy({
		by: ["trialId"],
		where: {
			guildId,
			createdAt: {
				gte: feedbackSince,
			},
			trialId: {
				in: trialIds,
			},
		},
		_count: {
			_all: true,
		},
	});

	const countByTrialId = new Map<number, number>(
		feedbackCounts.map((row) => [row.trialId, row._count._all]),
	);

	return activeTrials.map((trial) => ({
		trialId: trial.id,
		trialUserId: trial.userId,
		displayName: trial.userDisplayName ?? trial.userId,
		feedbackCount: countByTrialId.get(trial.id) ?? 0,
		startTime: trial.startTime,
	}));
}

export async function findActiveTrialById(
	prisma: PrismaClient,
	guildId: string,
	trialId: number,
): Promise<{ id: number; userId: string; displayName: string } | null> {
	const trial = await prisma.trial.findFirst({
		where: {
			id: trialId,
			guildId,
			active: true,
		},
		select: {
			id: true,
			userId: true,
			userDisplayName: true,
		},
	});

	if (!trial) {
		return null;
	}

	return {
		id: trial.id,
		userId: trial.userId,
		displayName: trial.userDisplayName ?? trial.userId,
	};
}

function buildTrialFeedbackBoardPayload(
	entries: TrialFeedbackBoardEntry[],
	logoUrl?: string,
): {
	embeds: ReturnType<typeof buildTrialFeedbackBoardEmbed>[];
	components: ActionRowBuilder<ButtonBuilder>[];
} {
	const visibleEntries = entries.slice(0, MAX_BUTTONS_TOTAL);
	const hiddenTrialCount = Math.max(entries.length - visibleEntries.length, 0);

	const buttons = visibleEntries.map((entry, index) => {
		const style =
			TRIAL_FEEDBACK_BUTTON_STYLES[
				index % TRIAL_FEEDBACK_BUTTON_STYLES.length
			] ?? ButtonStyle.Primary;

		return new ButtonBuilder()
			.setCustomId(buildTrialFeedbackButtonCustomId(entry.trialId))
			.setLabel(truncateLabel(entry.displayName))
			.setStyle(style);
	});

	return {
		embeds: [
			buildTrialFeedbackBoardEmbed(
				{
					entries: visibleEntries.map((entry) => ({
						trialId: entry.trialId,
						displayName: entry.displayName,
						feedbackCount: entry.feedbackCount,
						startTime: entry.startTime,
					})),
					hiddenTrialCount,
				},
				logoUrl,
			),
		],
		components: chunkButtons(buttons, MAX_BUTTONS_PER_ROW),
	};
}

export async function postTrialFeedbackBoardWorkflow(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guildId: string;
}): Promise<PostTrialFeedbackBoardWorkflowResult> {
	const log = createGuildLogger(input.guildId);
	const settingsResult = await loadGuildSettings(input.prisma, input.guildId);
	if (!settingsResult.ok) {
		if (settingsResult.reason === "error") {
			log.error(
				{ err: settingsResult.error },
				"Error retrieving guild settings for trial feedback board.",
			);
		}
		return { content: settingsResult.userMessage };
	}

	const entries = await getActiveTrialFeedbackEntries(input.prisma, input.guildId);
	if (entries.length === 0) {
		return {
			content:
				"No active trials were found for this server, so no feedback board was posted.",
		};
	}

	const logoUrl = input.client.user?.displayAvatarURL({
		extension: "png",
		size: 256,
	});

	const postResult = await sendOfficerChannelMessage(
		input.client,
		settingsResult.settings.officerChannelId,
		buildTrialFeedbackBoardPayload(entries, logoUrl),
	);

	if (!postResult.delivered) {
		const content =
			postResult.reason === "channel_not_found"
				? "Officer channel not found. Please re-run `/settings` and try again."
				: postResult.reason === "channel_not_text_based"
					? "Officer channel is not text-based. Please update `/settings`."
					: "Failed to send the trial feedback board. Please try again.";
		return { content };
	}

	return {
		content: `Posted a trial feedback board with ${entries.length} active trial button(s).`,
	};
}

export async function refreshTrialFeedbackBoardMessage(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guildId: string;
	channelId: string;
	messageId: string;
}): Promise<{ refreshed: boolean }> {
	const log = createGuildLogger(input.guildId);
	const channel = await input.client.channels.fetch(input.channelId).catch(() => null);

	if (!channel || !channel.isTextBased() || !("messages" in channel)) {
		return { refreshed: false };
	}

	const message = await channel.messages.fetch(input.messageId).catch(() => null);
	if (!message) {
		return { refreshed: false };
	}

	const entries = await getActiveTrialFeedbackEntries(
		input.prisma,
		input.guildId,
		message.createdAt,
	);
	const logoUrl = input.client.user?.displayAvatarURL({
		extension: "png",
		size: 256,
	});

	try {
		if (entries.length === 0) {
			await message.edit({
				embeds: [buildTrialFeedbackBoardEmbed({ entries: [], hiddenTrialCount: 0 }, logoUrl)],
				components: [],
			});
			return { refreshed: true };
		}

		await message.edit(buildTrialFeedbackBoardPayload(entries, logoUrl));
		return { refreshed: true };
	} catch (error) {
		log.warn(
			{ err: error, channelId: input.channelId, messageId: input.messageId },
			"Failed to refresh trial feedback board message.",
		);
		return { refreshed: false };
	}
}
