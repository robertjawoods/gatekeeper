import type { SapphireClient } from "@sapphire/framework";
import { CronExpressionParser } from "cron-parser";
import type { Guild } from "discord.js";
import type { PrismaClient, Trial } from "../generated/prisma/client.js";
import {
	buildFeedbackSummaryEmbed,
	buildTrialListEmbeds,
	buildTrialResolvedEmbed,
	buildTrialStartedEmbed,
	type TrialListItem,
} from "./embedBuilders.js";
import { getMemberFeedbackSummary } from "./feedbackService.js";
import {
	loadGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "./guildSettings.js";
import { audit, createGuildLogger } from "./logger.js";
import { finalizeTrialVotePollArtifacts } from "./voteService.js";

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

async function addTrialRole(
	guild: Guild,
	userId: string,
	trialRoleId: string,
): Promise<void> {
	const member = await guild.members.fetch(userId);
	await member.roles.add(trialRoleId);
}

async function applyPassRoleTransition(
	guild: Guild,
	userId: string,
	trialRoleId: string,
	raiderRoleId: string,
): Promise<void> {
	const member = await guild.members.fetch(userId);
	await member.roles.remove(trialRoleId);
	await member.roles.add(raiderRoleId);
}

async function applyFailRoleTransition(
	guild: Guild,
	userId: string,
	trialRoleId: string,
): Promise<void> {
	const member = await guild.members.fetch(userId);
	await member.roles.remove(trialRoleId);
}

export type StartTrialWorkflowResult = {
	content: string;
};

export async function startTrialWorkflow(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guild: Guild;
	guildId: string;
	target: { id: string; tag: string; displayName: string };
	actor: { id: string; username: string };
}): Promise<StartTrialWorkflowResult> {
	const log = createGuildLogger(input.guildId);
	const settingsResult = await loadGuildSettings(input.prisma, input.guildId);
	if (!settingsResult.ok) {
		if (settingsResult.reason === "error") {
			log.error(
				{ err: settingsResult.error },
				"Error retrieving guild settings.",
			);
		}
		return { content: settingsResult.userMessage };
	}

	const targetDisplayNameSnapshot = await resolveGuildDisplayName(
		input.client,
		input.guildId,
		input.target.id,
		input.target.displayName,
	);
	const officerDisplayNameSnapshot = await resolveGuildDisplayName(
		input.client,
		input.guildId,
		input.actor.id,
		input.actor.username,
	);

	let createdTrialStartTime: Date | null = null;

	try {
		const result = await startTrial(
			input.prisma,
			input.guildId,
			input.target.id,
			input.actor.id,
			targetDisplayNameSnapshot,
			officerDisplayNameSnapshot,
		);

		if (!result.created) {
			log.info(
				{ targetId: input.target.id },
				"Trial start rejected: user already has an active trial.",
			);
			return {
				content: `${input.target.tag} already has an active trial in this server.`,
			};
		}

		log.info(
			{ targetId: input.target.id, trialId: result.trial?.id },
			"Trial created successfully.",
		);
		audit(input.guildId, "trial.started", input.actor.id, {
			targetId: input.target.id,
			trialId: result.trial?.id,
		});
		createdTrialStartTime = result.trial?.startTime ?? null;
	} catch (error) {
		log.error(
			{ targetId: input.target.id, err: error },
			"Error creating trial.",
		);
		return {
			content:
				"An error occurred while starting the trial. Please try again later.",
		};
	}

	try {
		await addTrialRole(
			input.guild,
			input.target.id,
			settingsResult.settings.trialRoleId,
		);
	} catch (error) {
		log.error(
			{
				targetId: input.target.id,
				trialRoleId: settingsResult.settings.trialRoleId,
				err: error,
			},
			"Error adding trial role.",
		);
		return {
			content:
				"Trial was created, but I could not add the trial role. Please check my role permissions.",
		};
	}

	const projectedEndDate = createdTrialStartTime
		? projectTrialExpectedEndDate(
				createdTrialStartTime,
				settingsResult.settings.raidScheduleCron,
				settingsResult.settings.raidAttendanceReminderThreshold,
			)
		: null;
	const logoUrl = input.client.user?.displayAvatarURL({
		extension: "png",
		size: 256,
	});
	const embed = buildTrialStartedEmbed(
		{
			memberDisplayName: targetDisplayNameSnapshot,
			memberId: input.target.id,
			officerDisplayName: officerDisplayNameSnapshot,
			officerId: input.actor.id,
			startedAt: createdTrialStartTime ?? new Date(),
			expectedCompletionDate: projectedEndDate,
		},
		logoUrl,
	);
	const sendResult = await sendOfficerChannelMessage(
		input.client,
		settingsResult.settings.officerChannelId,
		{
			embeds: [embed.toJSON()],
		},
	);

	if (!sendResult.delivered) {
		return {
			content:
				"Trial was started, but I could not send the update to the officer channel. Please check channel settings and permissions.",
		};
	}

	return { content: "Posted start update in the officer channel." };
}

export type ResolveTrialWorkflowResult = {
	content: string;
};

export async function resolveTrialWorkflow(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guild: Guild;
	guildId: string;
	target: { id: string; tag: string; displayName: string };
	actor: { id: string; username: string };
	outcome: "passed" | "failed";
}): Promise<ResolveTrialWorkflowResult> {
	const log = createGuildLogger(input.guildId);
	const settingsResult = await loadGuildSettings(input.prisma, input.guildId);
	if (!settingsResult.ok) {
		if (settingsResult.reason === "error") {
			log.error(
				{ err: settingsResult.error },
				"Error retrieving guild settings.",
			);
		}
		return { content: settingsResult.userMessage };
	}

	const passed = input.outcome === "passed";
	let resolvedTrialStartTime: Date | null = null;
	let trialDisplayName: string | null = null;
	let resolvedTrialId: number | null = null;

	try {
		const result = await resolveTrial(
			input.prisma,
			input.guildId,
			input.target.id,
			passed,
		);
		if (!result.updated) {
			log.info(
				{ targetId: input.target.id },
				`${input.outcome === "passed" ? "Pass" : "Fail"} rejected: no active trial found.`,
			);
			return { content: `No active trial found for ${input.target.tag}.` };
		}

		log.info(
			{ targetId: input.target.id, trialId: result.trialId },
			`Trial marked as ${input.outcome}.`,
		);
		audit(
			input.guildId,
			input.outcome === "passed" ? "trial.passed" : "trial.failed",
			input.actor.id,
			{ targetId: input.target.id, trialId: result.trialId },
		);
		resolvedTrialStartTime = result.startTime ?? null;
		trialDisplayName = result.userDisplayName ?? null;
		resolvedTrialId = result.trialId ?? null;
	} catch (error) {
		log.error(
			{ targetId: input.target.id, err: error },
			`Error ${input.outcome === "passed" ? "passing" : "failing"} trial.`,
		);
		return {
			content: `An error occurred while ${input.outcome === "passed" ? "passing" : "failing"} the trial. Please try again later.`,
		};
	}

	if (resolvedTrialId) {
		try {
			await finalizeTrialVotePollArtifacts({
				prisma: input.prisma,
				client: input.client,
				guildId: input.guildId,
				trialId: resolvedTrialId,
				officerChannelId: settingsResult.settings.officerChannelId,
				outcome: input.outcome,
			});
		} catch (error) {
			log.error(
				{ err: error, trialId: resolvedTrialId },
				"Unexpected error while finalizing vote poll artifacts.",
			);
		}
	}

	try {
		if (input.outcome === "passed") {
			await applyPassRoleTransition(
				input.guild,
				input.target.id,
				settingsResult.settings.trialRoleId,
				settingsResult.settings.raiderRoleId,
			);
		} else {
			await applyFailRoleTransition(
				input.guild,
				input.target.id,
				settingsResult.settings.trialRoleId,
			);
		}
	} catch (error) {
		if (input.outcome === "passed") {
			log.error(
				{
					userId: input.target.id,
					trialRoleId: settingsResult.settings.trialRoleId,
					raiderRoleId: settingsResult.settings.raiderRoleId,
					err: error,
				},
				"Error updating member roles on pass.",
			);
			return {
				content:
					"Trial was passed, but I could not update the member roles. Please check my role permissions.",
			};
		}

		log.error(
			{
				targetId: input.target.id,
				trialRoleId: settingsResult.settings.trialRoleId,
				err: error,
			},
			"Error removing trial role on fail.",
		);
		return {
			content:
				"Trial was failed, but I could not remove the trial role. Please check my role permissions.",
		};
	}

	const displayName =
		trialDisplayName ??
		(await resolveGuildDisplayName(
			input.client,
			input.guildId,
			input.target.id,
			input.target.displayName,
		));
	const officerDisplayName = await resolveGuildDisplayName(
		input.client,
		input.guildId,
		input.actor.id,
		input.actor.username,
	);
	const projectedEndDate = resolvedTrialStartTime
		? projectTrialExpectedEndDate(
				resolvedTrialStartTime,
				settingsResult.settings.raidScheduleCron,
				settingsResult.settings.raidAttendanceReminderThreshold,
			)
		: null;
	const logoUrl = input.client.user?.displayAvatarURL({
		extension: "png",
		size: 256,
	});
	const embed = buildTrialResolvedEmbed(
		input.outcome,
		{
			memberDisplayName: displayName,
			memberId: input.target.id,
			officerDisplayName,
			officerId: input.actor.id,
			startedAt: resolvedTrialStartTime ?? new Date(),
			expectedCompletionDate: projectedEndDate,
		},
		logoUrl,
	);
	const sendResult = await sendOfficerChannelMessage(
		input.client,
		settingsResult.settings.officerChannelId,
		{
			embeds: [embed.toJSON()],
		},
	);

	if (!sendResult.delivered) {
		return {
			content:
				input.outcome === "passed"
					? "Trial was passed, but I could not send the update to the officer channel. Please check channel settings and permissions."
					: "Trial was failed, but I could not send the update to the officer channel. Please check channel settings and permissions.",
		};
	}

	return {
		content:
			input.outcome === "passed"
				? "Posted pass update in the officer channel."
				: "Posted fail update in the officer channel.",
	};
}

export type SummaryWorkflowResult = {
	content: string;
};

export async function postTrialSummaryWorkflow(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guildId: string;
	member: { id: string; displayName: string };
}): Promise<SummaryWorkflowResult> {
	const log = createGuildLogger(input.guildId);
	const settingsResult = await loadGuildSettings(input.prisma, input.guildId);
	if (!settingsResult.ok) {
		if (settingsResult.reason === "error") {
			log.error(
				{ err: settingsResult.error },
				"Error retrieving guild settings.",
			);
		}
		return { content: settingsResult.userMessage };
	}

	try {
		const result = await getMemberFeedbackSummary(
			input.prisma,
			input.guildId,
			input.member.id,
		);
		const displayName =
			result.outcome === "no_feedback" && result.userDisplayName
				? result.userDisplayName
				: await resolveGuildDisplayName(
						input.client,
						input.guildId,
						input.member.id,
						input.member.displayName,
					);

		if (result.outcome === "no_active_trial") {
			log.info(
				{ memberId: input.member.id },
				"Summary requested but no active trial found.",
			);
		} else if (result.outcome === "no_feedback") {
			log.info(
				{ memberId: input.member.id, trialId: result.trialId },
				"Summary requested but no feedback yet.",
			);
		} else {
			log.info(
				{
					memberId: input.member.id,
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
						settingsResult.settings.raidScheduleCron,
						settingsResult.settings.raidAttendanceReminderThreshold,
					);
		const logoUrl = input.client.user?.displayAvatarURL({
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
			input.client,
			settingsResult.settings.officerChannelId,
			{
				embeds: [embed.toJSON()],
			},
		);

		if (!sendResult.delivered) {
			return {
				content:
					"I could not send the summary to the officer channel. Please check channel settings and permissions.",
			};
		}

		return { content: "Posted the trial summary in the officer channel." };
	} catch (error) {
		log.error(
			{ memberId: input.member.id, err: error },
			"Error retrieving trial feedback summary.",
		);
		return {
			content:
				"An error occurred while retrieving the trial feedback summary. Please try again later.",
		};
	}
}

export type ListTrialsWorkflowResult = {
	content: string;
};

export async function postTrialListWorkflow(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guildId: string;
	activeOnly: boolean;
}): Promise<ListTrialsWorkflowResult> {
	const log = createGuildLogger(input.guildId);
	const settingsResult = await loadGuildSettings(input.prisma, input.guildId);
	if (!settingsResult.ok) {
		if (settingsResult.reason === "error") {
			log.error(
				{ err: settingsResult.error },
				"Error retrieving guild settings.",
			);
		}
		return { content: settingsResult.userMessage };
	}

	try {
		const trials = await listTrials(
			input.prisma,
			input.guildId,
			input.activeOnly,
		);
		if (trials.length === 0) {
			log.info(
				{ activeOnly: input.activeOnly },
				"No trials found for listing.",
			);
		} else {
			log.info(
				{ activeOnly: input.activeOnly, count: trials.length },
				"Listing trials.",
			);
		}

		const logoUrl = input.client.user?.displayAvatarURL({
			extension: "png",
			size: 256,
		});
		const items: TrialListItem[] = await Promise.all(
			trials.map(async (trial) => {
				const status = trial.active
					? "Active"
					: trial.passed
						? "Passed"
						: "Failed";
				const displayName =
					trial.userDisplayName ??
					(await resolveGuildDisplayName(
						input.client,
						input.guildId,
						trial.userId,
						trial.userId,
					));
				return {
					displayName,
					status,
					startTime: trial.startTime,
				};
			}),
		);

		const embeds = buildTrialListEmbeds(items, input.activeOnly, logoUrl).map(
			(embed) => embed.toJSON(),
		);

		const sendResult = await sendOfficerChannelMessage(
			input.client,
			settingsResult.settings.officerChannelId,
			{ embeds },
		);

		if (!sendResult.delivered) {
			return {
				content:
					"I could not send the trial list to the officer channel. Please check channel settings and permissions.",
			};
		}

		return { content: "Posted the trial list in the officer channel." };
	} catch (error) {
		log.error({ err: error }, "Error retrieving trials.");
		return {
			content:
				"An error occurred while retrieving trials. Please try again later.",
		};
	}
}
