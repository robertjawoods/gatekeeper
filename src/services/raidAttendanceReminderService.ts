import type { AppContext } from "../types.js";
import { buildRaidAttendanceReminderEmbed } from "./embedBuilders.js";
import { listActiveTrialAttendance } from "./feedbackService.js";
import {
	findGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "./guildSettings.js";
import { audit, createGuildLogger } from "./logger.js";

function toLocalDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export type RaidAttendanceReminderRunResult = {
	guildId: string;
	skipped: boolean;
	skippedReason?: "settings_missing" | "schedule_not_configured";
	candidatesEvaluated: number;
	remindersSent: number;
	remindersSkippedAsDuplicate: number;
	deliveryFailures: number;
};

export async function runGuildRaidAttendanceReminderCycle(
	context: AppContext,
	guildId: string,
): Promise<RaidAttendanceReminderRunResult> {
	const log = createGuildLogger(guildId);
	const settings = await findGuildSettings(context.prisma, guildId);

	if (!settings) {
		log.warn(
			"runGuildRaidAttendanceReminderCycle: no settings found, skipping.",
		);
		return {
			guildId,
			skipped: true,
			skippedReason: "settings_missing",
			candidatesEvaluated: 0,
			remindersSent: 0,
			remindersSkippedAsDuplicate: 0,
			deliveryFailures: 0,
		};
	}

	if (!settings.raidScheduleCron || !settings.raidAttendanceReminderThreshold) {
		log.info(
			"runGuildRaidAttendanceReminderCycle: schedule not configured, skipping.",
		);
		return {
			guildId,
			skipped: true,
			skippedReason: "schedule_not_configured",
			candidatesEvaluated: 0,
			remindersSent: 0,
			remindersSkippedAsDuplicate: 0,
			deliveryFailures: 0,
		};
	}

	const attendance = await listActiveTrialAttendance(context.prisma, guildId);
	const threshold = settings.raidAttendanceReminderThreshold;
	const officerChannelId = settings.officerChannelId;
	const candidates = attendance.filter(
		(item) => item.raidNightsAttended >= threshold,
	);
	const today = toLocalDateKey(new Date());

	log.info(
		{ candidatesEvaluated: candidates.length, threshold, today },
		"runGuildRaidAttendanceReminderCycle: evaluating candidates.",
	);

	type CandidateOutcome =
		| { status: "sent" }
		| { status: "duplicate" }
		| { status: "delivery_failed" };

	async function processCandidate(
		candidate: (typeof candidates)[number],
	): Promise<CandidateOutcome> {
		const existingReminder =
			await context.prisma.attendanceReminderLog.findUnique({
				where: {
					guildId_trialId_userId_reminderDate: {
						guildId,
						trialId: candidate.trialId,
						userId: candidate.userId,
						reminderDate: today,
					},
				},
			});

		if (existingReminder) {
			log.info(
				{ userId: candidate.userId, trialId: candidate.trialId, today },
				"Reminder already sent today, skipping duplicate.",
			);
			return { status: "duplicate" };
		}

		const displayName = await resolveGuildDisplayName(
			context.client,
			guildId,
			candidate.userId,
			candidate.userId,
		);

		const embed = buildRaidAttendanceReminderEmbed({
			displayName,
			userId: candidate.userId,
			trialId: candidate.trialId,
			raidNightsAttended: candidate.raidNightsAttended,
			threshold,
		});

		const sendResult = await sendOfficerChannelMessage(
			context.client,
			officerChannelId,
			{
				embeds: [embed.toJSON()],
			},
		);

		if (!sendResult.delivered) {
			log.warn(
				{
					userId: candidate.userId,
					trialId: candidate.trialId,
					reason: sendResult.reason,
				},
				"Failed to deliver attendance reminder.",
			);
			return { status: "delivery_failed" };
		}

		await context.prisma.attendanceReminderLog.create({
			data: {
				guildId,
				trialId: candidate.trialId,
				userId: candidate.userId,
				reminderDate: today,
				attendanceCount: candidate.raidNightsAttended,
			},
		});

		audit(guildId, "attendance.reminder_sent", "system", {
			userId: candidate.userId,
			trialId: candidate.trialId,
			raidNightsAttended: candidate.raidNightsAttended,
		});

		return { status: "sent" };
	}

	const settled = await Promise.allSettled(
		candidates.map((c) => processCandidate(c)),
	);

	let remindersSent = 0;
	let remindersSkippedAsDuplicate = 0;
	let deliveryFailures = 0;

	for (const result of settled) {
		if (result.status === "rejected") {
			log.error(
				{ err: result.reason },
				"Candidate reminder processing threw unexpectedly.",
			);
			deliveryFailures += 1;
			continue;
		}
		if (result.value.status === "sent") remindersSent += 1;
		else if (result.value.status === "duplicate")
			remindersSkippedAsDuplicate += 1;
		else deliveryFailures += 1;
	}

	log.info(
		{ remindersSent, remindersSkippedAsDuplicate, deliveryFailures },
		"runGuildRaidAttendanceReminderCycle: cycle complete.",
	);

	return {
		guildId,
		skipped: false,
		candidatesEvaluated: candidates.length,
		remindersSent,
		remindersSkippedAsDuplicate,
		deliveryFailures,
	};
}

export async function runRaidAttendanceReminderCycleForAllGuilds(
	context: AppContext,
): Promise<RaidAttendanceReminderRunResult[]> {
	const guildSettings = await context.prisma.settings.findMany({
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
		},
	});

	const results: RaidAttendanceReminderRunResult[] = [];

	for (const setting of guildSettings) {
		try {
			const result = await runGuildRaidAttendanceReminderCycle(
				context,
				setting.guildId,
			);
			results.push(result);
		} catch (error) {
			createGuildLogger(setting.guildId).error(
				{ err: error },
				"Raid reminder cycle threw unexpectedly.",
			);
			results.push({
				guildId: setting.guildId,
				skipped: false,
				candidatesEvaluated: 0,
				remindersSent: 0,
				remindersSkippedAsDuplicate: 0,
				deliveryFailures: 1,
			});
		}
	}

	return results;
}
