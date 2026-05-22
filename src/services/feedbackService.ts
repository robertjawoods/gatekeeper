import type { Feedback, PrismaClient } from "../generated/prisma/client.js";
import { createGuildLogger } from "./logger.js";

const FEEDBACK_MODAL_PREFIX = "feedbackModal";

export function buildFeedbackModalCustomId(
	targetId: string,
): string {
	return `${FEEDBACK_MODAL_PREFIX}:${targetId}`;
}

export function parseFeedbackModalCustomId(customId: string): {
	targetId: string;
} | null {
	if (!customId.startsWith(`${FEEDBACK_MODAL_PREFIX}:`)) {
		return null;
	}

	const parts = customId.split(":");
	if (parts.length !== 2) {
		return null;
	}

	const targetId = parts[1];
	if (!targetId) {
		return null;
	}

	return { targetId };
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
