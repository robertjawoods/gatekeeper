import type { Feedback, PrismaClient } from "../generated/prisma/client.js";
import {
	CheckboxBuilder,
	LabelBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { createGuildLogger } from "./logger.js";

const FEEDBACK_MODAL_PREFIX = "feedbackModal";

export type FeedbackModalContext = {
	targetId: string;
	boardChannelId?: string;
	boardMessageId?: string;
};

function truncateModalTitle(value: string, maxLength = 45): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 3)}...`;
}

export function buildFeedbackModalCustomId(
	targetId: string,
	context?: {
		boardChannelId?: string;
		boardMessageId?: string;
	},
): string {
	if (context?.boardChannelId && context.boardMessageId) {
		return `${FEEDBACK_MODAL_PREFIX}:${targetId}:${context.boardChannelId}:${context.boardMessageId}`;
	}

	return `${FEEDBACK_MODAL_PREFIX}:${targetId}`;
}

export function parseFeedbackModalCustomId(
	customId: string,
): FeedbackModalContext | null {
	if (!customId.startsWith(`${FEEDBACK_MODAL_PREFIX}:`)) {
		return null;
	}

	const parts = customId.split(":");
	if (parts.length !== 2 && parts.length !== 4) {
		return null;
	}

	const targetId = parts[1];
	if (!targetId) {
		return null;
	}

	if (parts.length === 2) {
		return { targetId };
	}

	const boardChannelId = parts[2];
	const boardMessageId = parts[3];
	if (!boardChannelId || !boardMessageId) {
		return null;
	}

	return { targetId, boardChannelId, boardMessageId };
}

export function buildFeedbackModal(
	targetId: string,
	targetDisplayName: string,
	context?: {
		boardChannelId?: string;
		boardMessageId?: string;
	},
): ModalBuilder {
	const modal = new ModalBuilder()
		.setCustomId(buildFeedbackModalCustomId(targetId, context))
		.setTitle(truncateModalTitle(`Feedback for ${targetDisplayName}`));

	const performanceInput = new TextInputBuilder()
		.setCustomId("performance")
		.setStyle(TextInputStyle.Short)
		.setPlaceholder("Rate performance from 1 to 5")
		.setRequired(true);

	const attitudeInput = new TextInputBuilder()
		.setCustomId("attitude")
		.setStyle(TextInputStyle.Short)
		.setPlaceholder("Rate attitude from 1 to 5")
		.setRequired(true);

	const focusInput = new TextInputBuilder()
		.setCustomId("focus")
		.setStyle(TextInputStyle.Short)
		.setPlaceholder("Rate focus from 1 to 5")
		.setRequired(true);

	const lateInput = new CheckboxBuilder().setCustomId("late").setDefault(false);

	const commentsInput = new TextInputBuilder()
		.setCustomId("comments")
		.setStyle(TextInputStyle.Paragraph)
		.setPlaceholder("Additional comments")
		.setRequired(false);

	const performanceLabel = new LabelBuilder()
		.setLabel("Performance (1-5)")
		.setTextInputComponent(performanceInput);

	const attitudeLabel = new LabelBuilder()
		.setLabel("Attitude (1-5)")
		.setTextInputComponent(attitudeInput);

	const focusLabel = new LabelBuilder()
		.setLabel("Focus (1-5)")
		.setTextInputComponent(focusInput);

	const lateLabel = new LabelBuilder()
		.setLabel("Was this trial late to raid?")
		.setCheckboxComponent(lateInput);

	const commentsLabel = new LabelBuilder()
		.setLabel("Comments")
		.setTextInputComponent(commentsInput);

	modal.addLabelComponents(
		performanceLabel,
		attitudeLabel,
		focusLabel,
		lateLabel,
		commentsLabel,
	);

	return modal;
}

type CreateFeedbackInput = {
	guildId: string;
	trialId: number;
	targetId: string;
	officerId: string;
	performance: number;
	attitude: number;
	focus: number;
	late: boolean;
	comments?: string | undefined;
};

type FeedbackAverages = {
	performance: number;
	attitude: number;
	focus: number;
};

export type MemberFeedbackSummary = {
	trialId: number;
	trialStartTime: Date;
	feedbackCount: number;
	averages: FeedbackAverages;
	lateCount: number;
	recentComments: string[];
};

export type MemberFeedbackSummaryResult =
	| { outcome: "no_active_trial" }
	| {
			outcome: "no_feedback";
			trialId: number;
			trialStartTime: Date;
			userDisplayName: string | null;
	  }
	| { outcome: "summary"; summary: MemberFeedbackSummary };

export type ActiveTrialAttendance = {
	trialId: number;
	userId: string;
	raidNightsAttended: number;
};

function toLocalDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function roundToSingleDecimal(value: number): number {
	return Number(value.toFixed(1));
}

function calculateAverages(feedbacks: Feedback[]): FeedbackAverages {
	const count = feedbacks.length;
	const performanceTotal = feedbacks.reduce(
		(total, feedback) => total + feedback.performance,
		0,
	);
	const attitudeTotal = feedbacks.reduce(
		(total, feedback) => total + feedback.attitude,
		0,
	);
	const focusTotal = feedbacks.reduce(
		(total, feedback) => total + feedback.focus,
		0,
	);

	return {
		performance: roundToSingleDecimal(performanceTotal / count),
		attitude: roundToSingleDecimal(attitudeTotal / count),
		focus: roundToSingleDecimal(focusTotal / count),
	};
}

export async function getMemberFeedbackSummary(
	prisma: PrismaClient,
	guildId: string,
	userId: string,
): Promise<MemberFeedbackSummaryResult> {
	const activeTrial = await prisma.trial.findFirst({
		where: {
			guildId,
			userId,
			active: true,
		},
	});

	if (!activeTrial) {
		return { outcome: "no_active_trial" };
	}

	const feedbacks = await prisma.feedback.findMany({
		where: {
			guildId,
			trialId: activeTrial.id,
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	if (feedbacks.length === 0) {
		return {
			outcome: "no_feedback",
			trialId: activeTrial.id,
			trialStartTime: activeTrial.startTime,
			userDisplayName: activeTrial.userDisplayName,
		};
	}

	const lateCount = feedbacks.filter((feedback) => feedback.late).length;
	const recentComments = feedbacks
		.map((feedback) => feedback.comments?.trim() ?? "")
		.filter((comment) => comment.length > 0)
		.slice(0, 3);

	return {
		outcome: "summary",
		summary: {
			trialId: activeTrial.id,
			trialStartTime: activeTrial.startTime,
			feedbackCount: feedbacks.length,
			averages: calculateAverages(feedbacks),
			lateCount,
			recentComments,
		},
	};
}

export async function createFeedback(
	prisma: PrismaClient,
	input: CreateFeedbackInput,
): Promise<{
	created: boolean;
	feedback?: Feedback;
	reason?: "trial_not_found" | "trial_not_active";
}> {
	const log = createGuildLogger(input.guildId);
	const trial = await prisma.trial.findFirst({
		where: {
			id: input.trialId,
			guildId: input.guildId,
			userId: input.targetId,
		},
	});

	if (!trial) {
		log.warn(
			{ trialId: input.trialId, targetId: input.targetId },
			"createFeedback: trial not found.",
		);
		return { created: false, reason: "trial_not_found" };
	}

	if (!trial.active) {
		log.warn(
			{ trialId: input.trialId, targetId: input.targetId },
			"createFeedback: trial is no longer active.",
		);
		return { created: false, reason: "trial_not_active" };
	}

	const feedback = await prisma.feedback.create({
		data: {
			guildId: input.guildId,
			trialId: input.trialId,
			officerId: input.officerId,
			performance: input.performance,
			attitude: input.attitude,
			focus: input.focus,
			late: input.late,
			comments: input.comments ?? null,
			raidAttendanceDate: toLocalDateKey(new Date()),
		},
	});

	log.info(
		{
			trialId: input.trialId,
			officerId: input.officerId,
			feedbackId: feedback.id,
		},
		"createFeedback: feedback saved.",
	);
	return { created: true, feedback };
}

export async function listActiveTrialAttendance(
	prisma: PrismaClient,
	guildId: string,
): Promise<ActiveTrialAttendance[]> {
	const activeTrials = await prisma.trial.findMany({
		where: {
			guildId,
			active: true,
		},
		select: {
			id: true,
			userId: true,
		},
	});

	if (activeTrials.length === 0) {
		return [];
	}

	const trialUserMap = new Map<number, string>();
	const activeTrialIds = activeTrials.map((trial) => {
		trialUserMap.set(trial.id, trial.userId);
		return trial.id;
	});

	const feedbackRows = await prisma.feedback.findMany({
		where: {
			guildId,
			trialId: {
				in: activeTrialIds,
			},
		},
		select: {
			trialId: true,
			raidAttendanceDate: true,
			createdAt: true,
		},
	});

	const attendanceByTrial = new Map<number, Set<string>>();

	for (const row of feedbackRows) {
		const attendanceDate =
			row.raidAttendanceDate ?? toLocalDateKey(row.createdAt);

		const dates = attendanceByTrial.get(row.trialId) ?? new Set<string>();
		dates.add(attendanceDate);
		attendanceByTrial.set(row.trialId, dates);
	}

	return activeTrials.map((trial) => ({
		trialId: trial.id,
		userId: trial.userId,
		raidNightsAttended: attendanceByTrial.get(trial.id)?.size ?? 0,
	}));
}
