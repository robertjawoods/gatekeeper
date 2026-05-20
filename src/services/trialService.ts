import { CronExpressionParser } from "cron-parser";
import type { PrismaClient, Trial } from "../generated/prisma/client.js";
import { createGuildLogger } from "./logger.js";

export async function findActiveTrial(
	prisma: PrismaClient,
	guildId: string,
	userId: string,
): Promise<Trial | null> {
	const trial = await prisma.trial.findFirst({
		where: {
			guildId,
			userId,
			active: true,
		},
	});
	createGuildLogger(guildId).info(
		{ userId, found: trial !== null },
		"findActiveTrial",
	);
	return trial;
}

export async function startTrial(
	prisma: PrismaClient,
	guildId: string,
	userId: string,
	startedById: string,
	userDisplayName: string,
	startedByDisplayName: string,
): Promise<{ created: boolean; trial?: Trial }> {
	const log = createGuildLogger(guildId);
	const existingTrial = await findActiveTrial(prisma, guildId, userId);
	if (existingTrial) {
		log.info({ userId }, "startTrial: user already has an active trial.");
		return { created: false, trial: existingTrial };
	}

	const trial = await prisma.trial.create({
		data: {
			guildId,
			userId,
			userDisplayName,
			startedById,
			startedByDisplayName,
			active: true,
			startTime: new Date(),
		},
	});

	log.info({ userId, trialId: trial.id }, "startTrial: trial created.");
	return { created: true, trial };
}

export async function resolveTrial(
	prisma: PrismaClient,
	guildId: string,
	userId: string,
	passed: boolean,
): Promise<{
	updated: boolean;
	trialId?: number;
	startTime?: Date;
	userDisplayName?: string | null;
}> {
	const log = createGuildLogger(guildId);
	const activeTrial = await findActiveTrial(prisma, guildId, userId);
	if (!activeTrial) {
		log.info({ userId }, "resolveTrial: no active trial found.");
		return { updated: false };
	}

	await prisma.trial.update({
		where: { id: activeTrial.id },
		data: {
			active: false,
			passed,
		},
	});

	log.info(
		{ userId, trialId: activeTrial.id, passed },
		"resolveTrial: trial resolved.",
	);
	return {
		updated: true,
		trialId: activeTrial.id,
		startTime: activeTrial.startTime,
		userDisplayName: activeTrial.userDisplayName,
	};
}

export function projectTrialExpectedEndDate(
	trialStartTime: Date,
	raidScheduleCron?: string | null,
	raidAttendanceReminderThreshold?: number | null,
): Date | null {
	if (
		!raidScheduleCron ||
		!raidAttendanceReminderThreshold ||
		raidAttendanceReminderThreshold < 1
	) {
		return null;
	}

	try {
		const schedule = CronExpressionParser.parse(raidScheduleCron, {
			currentDate: trialStartTime,
		});

		let projectedDate: Date | null = null;

		for (let index = 0; index < raidAttendanceReminderThreshold; index += 1) {
			projectedDate = schedule.next().toDate();
		}

		return projectedDate;
	} catch {
		return null;
	}
}

export async function listTrials(
	prisma: PrismaClient,
	guildId: string,
	active: boolean,
): Promise<Trial[]> {
	const trials = await prisma.trial.findMany({
		where: {
			guildId,
			active,
		},
		orderBy: {
			startTime: "desc",
		},
	});
	createGuildLogger(guildId).info(
		{ active, count: trials.length },
		"listTrials: fetched trials.",
	);
	return trials;
}
