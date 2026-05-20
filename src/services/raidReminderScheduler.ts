import cron, { type ScheduledTask } from "node-cron";
import { Prisma } from "../generated/prisma/client.js";
import type { AppContext } from "../types.js";
import { findGuildSettings } from "./guildSettings.js";
import { logger } from "./logger.js";
import { runGuildRaidAttendanceReminderCycle } from "./raidAttendanceReminderService.js";

const guildSchedules = new Map<string, ScheduledTask>();
const SCHEDULER_BOOTSTRAP_MAX_ATTEMPTS = 3;
const SCHEDULER_BOOTSTRAP_RETRY_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isTransientPrismaConnectivityError(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
		return false;
	}

	if (error.code === "ETIMEDOUT") {
		return true;
	}

	const message = String(error.message).toUpperCase();
	return message.includes("ETIMEDOUT");
}

function stopGuildSchedule(guildId: string): void {
	const task = guildSchedules.get(guildId);
	if (!task) {
		return;
	}

	task.stop();
	task.destroy();
	guildSchedules.delete(guildId);
	logger.info({ guildId }, "Raid reminder schedule stopped for guild.");
}

function registerGuildSchedule(
	context: AppContext,
	guildId: string,
	cronExpression: string,
): void {
	const task = cron.schedule(cronExpression, async () => {
		try {
			const result = await runGuildRaidAttendanceReminderCycle(
				context,
				guildId,
			);

			if (result.skipped) {
				logger.info(
					{ guildId, skippedReason: result.skippedReason },
					"Raid reminder cycle skipped.",
				);
				return;
			}

			logger.info(
				{
					guildId,
					candidatesEvaluated: result.candidatesEvaluated,
					remindersSent: result.remindersSent,
					remindersSkippedAsDuplicate: result.remindersSkippedAsDuplicate,
					deliveryFailures: result.deliveryFailures,
				},
				"Raid reminder cycle complete.",
			);
		} catch (error) {
			logger.error(
				{ err: error, guildId },
				"Raid reminder cycle execution failed.",
			);
		}
	});

	guildSchedules.set(guildId, task);
	logger.info(
		{ guildId, cronExpression },
		"Raid reminder schedule registered for guild.",
	);
}

export async function refreshGuildRaidReminderSchedule(
	context: AppContext,
	guildId: string,
): Promise<void> {
	stopGuildSchedule(guildId);

	const settings = await findGuildSettings(context.prisma, guildId);
	if (
		!settings?.raidScheduleCron ||
		!settings.raidAttendanceReminderThreshold
	) {
		logger.info(
			{ guildId },
			"refreshGuildRaidReminderSchedule: no valid schedule configured, skipping registration.",
		);
		return;
	}

	if (!cron.validate(settings.raidScheduleCron)) {
		logger.warn(
			{ guildId, raidScheduleCron: settings.raidScheduleCron },
			"refreshGuildRaidReminderSchedule: invalid cron expression, skipping registration.",
		);
		return;
	}

	registerGuildSchedule(context, guildId, settings.raidScheduleCron);
}

export async function startRaidReminderScheduler(
	context: AppContext,
): Promise<void> {
	let allSettings: Array<{ guildId: string; raidScheduleCron: string | null }> =
		[];

	for (
		let attempt = 1;
		attempt <= SCHEDULER_BOOTSTRAP_MAX_ATTEMPTS;
		attempt += 1
	) {
		try {
			allSettings = await context.prisma.settings.findMany({
				where: {
					raidScheduleCron: {
						not: null,
					},
					raidAttendanceReminderThreshold: {
						not: null,
					},
				},
				select: {
					guildId: true,
					raidScheduleCron: true,
				},
			});

			break;
		} catch (error) {
			const isTransient = isTransientPrismaConnectivityError(error);
			const isFinalAttempt = attempt === SCHEDULER_BOOTSTRAP_MAX_ATTEMPTS;

			if (!isTransient || isFinalAttempt) {
				throw error;
			}

			logger.warn(
				{
					err: error,
					attempt,
					maxAttempts: SCHEDULER_BOOTSTRAP_MAX_ATTEMPTS,
					retryDelayMs: SCHEDULER_BOOTSTRAP_RETRY_DELAY_MS,
				},
				"Transient database error while initializing raid reminder scheduler. Retrying...",
			);

			await sleep(SCHEDULER_BOOTSTRAP_RETRY_DELAY_MS);
		}
	}

	let registered = 0;
	for (const setting of allSettings) {
		if (!setting.raidScheduleCron || !cron.validate(setting.raidScheduleCron)) {
			logger.warn(
				{
					guildId: setting.guildId,
					raidScheduleCron: setting.raidScheduleCron,
				},
				"startRaidReminderScheduler: invalid or missing cron for guild, skipping.",
			);
			continue;
		}

		registerGuildSchedule(context, setting.guildId, setting.raidScheduleCron);
		registered += 1;
	}

	logger.info(
		{ registeredGuilds: registered },
		"Raid reminder scheduler initialized.",
	);
}
