import type { PrismaClient } from "@prisma/client/extension";
import type { SapphireClient } from "@sapphire/framework";
import type { MessageCreateOptions } from "discord.js";
import cron from "node-cron";
import type { Settings } from "../generated/prisma/client.js";
import { logger } from "./logger.js";

export class GuildSettingsMissingError extends Error {
	constructor(guildId: string) {
		super(`Settings have not been configured for guild ${guildId}.`);
		this.name = "GuildSettingsMissingError";
	}
}

export async function findGuildSettings(
	prisma: PrismaClient,
	guildId: string,
): Promise<Settings | null> {
	return prisma.settings.findUnique({
		where: { guildId },
	});
}

export async function getGuildSettings(
	prisma: PrismaClient,
	guildId: string,
): Promise<Settings> {
	const settings = await findGuildSettings(prisma, guildId);

	if (!settings) {
		throw new GuildSettingsMissingError(guildId);
	}

	return settings;
}

export type GuildSettingsLoadResult =
	| { ok: true; settings: Settings }
	| {
			ok: false;
			reason: "missing" | "error";
			userMessage: string;
			error?: unknown;
	  };

export async function loadGuildSettings(
	prisma: PrismaClient,
	guildId: string,
): Promise<GuildSettingsLoadResult> {
	try {
		const settings = await getGuildSettings(prisma, guildId);
		return { ok: true, settings };
	} catch (error) {
		if (error instanceof GuildSettingsMissingError) {
			return {
				ok: false,
				reason: "missing",
				userMessage:
					"Server settings have not been configured yet. Run `/settings` first.",
			};
		}

		logger.error(
			{ guildId, err: error },
			"loadGuildSettings: failed to retrieve guild settings.",
		);
		return {
			ok: false,
			reason: "error",
			userMessage:
				"An error occurred while retrieving server settings. Please try again later.",
			error,
		};
	}
}

export async function saveGuildSettings(
	prisma: PrismaClient,
	settings: {
		guildId: string;
		officerChannelId: string;
		trialRoleId: string;
		raiderRoleId: string;
		raidScheduleCron?: string | null;
		raidAttendanceReminderThreshold?: number | null;
	},
): Promise<Settings> {
	const result = await prisma.settings.upsert({
		where: { guildId: settings.guildId },
		update: {
			officerChannelId: settings.officerChannelId,
			trialRoleId: settings.trialRoleId,
			raiderRoleId: settings.raiderRoleId,
			raidScheduleCron: settings.raidScheduleCron ?? null,
			raidAttendanceReminderThreshold:
				settings.raidAttendanceReminderThreshold ?? null,
		},
		create: settings,
	});
	logger.info(
		{ guildId: settings.guildId },
		"saveGuildSettings: settings saved.",
	);
	return result;
}

export type RaidReminderSettingsValidationInput = {
	raidScheduleCron?: string | null;
	raidAttendanceReminderThreshold?: number | null;
};

export type RaidReminderSettingsValidationResult =
	| {
			valid: true;
			normalizedCron: string | null;
			normalizedThreshold: number | null;
	  }
	| { valid: false; reason: string };

export function validateRaidReminderSettings(
	input: RaidReminderSettingsValidationInput,
): RaidReminderSettingsValidationResult {
	const rawCron = input.raidScheduleCron?.trim() ?? "";
	const hasCron = rawCron.length > 0;
	const threshold = input.raidAttendanceReminderThreshold ?? null;
	const hasThreshold = threshold !== null;

	if (hasCron !== hasThreshold) {
		return {
			valid: false,
			reason:
				"Set both raid schedule and attendance threshold, or leave both empty.",
		};
	}

	if (!hasCron && !hasThreshold) {
		return { valid: true, normalizedCron: null, normalizedThreshold: null };
	}

	if (!cron.validate(rawCron)) {
		logger.warn(
			{ raidScheduleCron: rawCron },
			"validateRaidReminderSettings: invalid cron expression.",
		);
		return {
			valid: false,
			reason: "Raid schedule must be a valid cron expression.",
		};
	}

	if (threshold === null) {
		return {
			valid: false,
			reason:
				"Attendance reminder threshold is required when raid schedule is set.",
		};
	}

	if (!Number.isInteger(threshold) || threshold < 1 || threshold > 50) {
		return {
			valid: false,
			reason:
				"Attendance reminder threshold must be a whole number from 1 to 50.",
		};
	}

	return {
		valid: true,
		normalizedCron: rawCron,
		normalizedThreshold: threshold,
	};
}

export type OfficerChannelMessageResult =
	| { delivered: true; messageId: string }
	| {
			delivered: false;
			reason: "channel_not_found" | "channel_not_text_based" | "send_failed";
	  };

export type OfficerChannelMessagePayload =
	| string
	| Pick<MessageCreateOptions, "content" | "embeds" | "components">;

export async function sendOfficerChannelMessage(
	client: SapphireClient,
	officerChannelId: string,
	payload: OfficerChannelMessagePayload,
): Promise<OfficerChannelMessageResult> {
	const channel = await client.channels.fetch(officerChannelId);

	if (!channel) {
		return { delivered: false, reason: "channel_not_found" };
	}

	if (!channel.isTextBased() || !("send" in channel)) {
		return { delivered: false, reason: "channel_not_text_based" };
	}

	try {
		let messageId: string;

		if (typeof payload === "string") {
			const message = await channel.send({ content: payload });
			messageId = message.id;
		} else {
			const message = await channel.send(payload);
			messageId = message.id;
		}

		return { delivered: true, messageId };
	} catch (err) {
		logger.warn(
			{ officerChannelId, err },
			"sendOfficerChannelMessage: send failed.",
		);
		return { delivered: false, reason: "send_failed" };
	}
}

export async function resolveGuildDisplayName(
	client: SapphireClient,
	guildId: string,
	userId: string,
	fallbackName: string,
): Promise<string> {
	try {
		const guild = await client.guilds.fetch(guildId);
		const member = await guild.members.fetch(userId);
		return member.displayName;
	} catch {
		return fallbackName;
	}
}
