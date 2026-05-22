import type { SapphireClient } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { TrialVoteOption } from "../generated/prisma/client.js";
import { buildTrialVotePollEmbed } from "./embedBuilders.js";
import {
	loadGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "./guildSettings.js";
import { createGuildLogger } from "./logger.js";

const VOTE_CUSTOM_ID_PREFIX = "trialvote";

type VoteChoice = "pass" | "fail" | "extend";

const voteChoiceToEnum: Record<VoteChoice, TrialVoteOption> = {
	pass: TrialVoteOption.PASS,
	fail: TrialVoteOption.FAIL,
	extend: TrialVoteOption.EXTEND,
};

export type TrialVotePollSnapshot = {
	pollId: number;
	guildId: string;
	trialId: number;
	targetId: string;
	targetDisplayName: string | null;
	open: boolean;
	totalVotes: number;
	passVotes: number;
	failVotes: number;
	extendVotes: number;
};

export type CreateTrialVotePollResult =
	| { created: true; poll: TrialVotePollSnapshot }
	| { created: false; reason: "no_active_trial" };

export type TrialVotePollLookupResult =
	| { found: true; poll: TrialVotePollSnapshot }
	| { found: false; reason: "poll_not_found" | "wrong_guild" };

export type RecordTrialVoteResult =
	| { recorded: true; poll: TrialVotePollSnapshot }
	| {
			recorded: false;
			reason:
				| "poll_not_found"
				| "wrong_guild"
				| "poll_closed"
				| "message_mismatch";
	  };

export type CloseTrialVotePollResult =
	| { closed: true; pollId: number; messageId: string | null }
	| { closed: false };

function toSnapshot(poll: {
	id: number;
	guildId: string;
	trialId: number;
	targetId: string;
	trial: { userDisplayName: string | null };
	open: boolean;
	votes: Array<{ option: TrialVoteOption }>;
}): TrialVotePollSnapshot {
	const passVotes = poll.votes.filter(
		(vote) => vote.option === TrialVoteOption.PASS,
	).length;
	const failVotes = poll.votes.filter(
		(vote) => vote.option === TrialVoteOption.FAIL,
	).length;
	const extendVotes = poll.votes.filter(
		(vote) => vote.option === TrialVoteOption.EXTEND,
	).length;

	return {
		pollId: poll.id,
		guildId: poll.guildId,
		trialId: poll.trialId,
		targetId: poll.targetId,
		targetDisplayName: poll.trial.userDisplayName,
		open: poll.open,
		totalVotes: poll.votes.length,
		passVotes,
		failVotes,
		extendVotes,
	};
}

function parseVoteChoice(rawOption: string): VoteChoice | null {
	if (rawOption === "pass" || rawOption === "fail" || rawOption === "extend") {
		return rawOption;
	}

	return null;
}

export function buildVoteCustomId(pollId: number, option: VoteChoice): string {
	return `${VOTE_CUSTOM_ID_PREFIX}:${pollId}:${option}`;
}

export function isVoteCustomId(customId: string): boolean {
	return customId.startsWith(`${VOTE_CUSTOM_ID_PREFIX}:`);
}

export function parseVoteCustomId(
	customId: string,
): { pollId: number; option: TrialVoteOption } | null {
	const [prefix, pollIdRaw, optionRaw] = customId.split(":");
	if (prefix !== VOTE_CUSTOM_ID_PREFIX || !pollIdRaw || !optionRaw) {
		return null;
	}

	const pollId = Number(pollIdRaw);
	if (!Number.isInteger(pollId) || pollId <= 0) {
		return null;
	}

	const voteChoice = parseVoteChoice(optionRaw);
	if (!voteChoice) {
		return null;
	}

	return {
		pollId,
		option: voteChoiceToEnum[voteChoice],
	};
}

export function buildTrialVoteButtons(
	pollId: number,
	disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(buildVoteCustomId(pollId, "pass"))
			.setLabel("Pass")
			.setStyle(ButtonStyle.Success)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(buildVoteCustomId(pollId, "fail"))
			.setLabel("Fail")
			.setStyle(ButtonStyle.Danger)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(buildVoteCustomId(pollId, "extend"))
			.setLabel("Extend")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
	);

	return [row];
}

export async function createTrialVotePoll(
	prisma: PrismaClient,
	guildId: string,
	targetId: string,
	createdById: string,
): Promise<CreateTrialVotePollResult> {
	const activeTrial = await prisma.trial.findFirst({
		where: {
			guildId,
			userId: targetId,
			active: true,
		},
	});

	if (!activeTrial) {
		return { created: false, reason: "no_active_trial" };
	}

	const poll = await prisma.trialVotePoll.create({
		data: {
			guildId,
			trialId: activeTrial.id,
			targetId,
			createdById,
			open: true,
		},
		include: {
			trial: {
				select: {
					userDisplayName: true,
				},
			},
			votes: {
				select: {
					option: true,
				},
			},
		},
	});

	return {
		created: true,
		poll: toSnapshot(poll),
	};
}

export async function attachTrialVotePollMessage(
	prisma: PrismaClient,
	guildId: string,
	pollId: number,
	messageId: string,
): Promise<boolean> {
	const result = await prisma.trialVotePoll.updateMany({
		where: {
			id: pollId,
			guildId,
		},
		data: {
			messageId,
		},
	});

	return result.count > 0;
}

export async function getTrialVotePollSnapshot(
	prisma: PrismaClient,
	guildId: string,
	pollId: number,
): Promise<TrialVotePollLookupResult> {
	const poll = await prisma.trialVotePoll.findUnique({
		where: {
			id: pollId,
		},
		include: {
			trial: {
				select: {
					userDisplayName: true,
				},
			},
			votes: {
				select: {
					option: true,
				},
			},
		},
	});

	if (!poll) {
		return { found: false, reason: "poll_not_found" };
	}

	if (poll.guildId !== guildId) {
		return { found: false, reason: "wrong_guild" };
	}

	return {
		found: true,
		poll: toSnapshot(poll),
	};
}

export async function recordTrialVote(
	prisma: PrismaClient,
	input: {
		guildId: string;
		pollId: number;
		officerId: string;
		option: TrialVoteOption;
		sourceMessageId: string;
	},
): Promise<RecordTrialVoteResult> {
	const existingPoll = await prisma.trialVotePoll.findUnique({
		where: {
			id: input.pollId,
		},
		select: {
			id: true,
			guildId: true,
			open: true,
			messageId: true,
		},
	});

	if (!existingPoll) {
		return { recorded: false, reason: "poll_not_found" };
	}

	if (existingPoll.guildId !== input.guildId) {
		return { recorded: false, reason: "wrong_guild" };
	}

	if (!existingPoll.open) {
		return { recorded: false, reason: "poll_closed" };
	}

	if (
		existingPoll.messageId &&
		existingPoll.messageId !== input.sourceMessageId
	) {
		return { recorded: false, reason: "message_mismatch" };
	}

	const [, poll] = await prisma.$transaction([
		prisma.trialVote.upsert({
			where: {
				pollId_officerId: {
					pollId: input.pollId,
					officerId: input.officerId,
				},
			},
			update: {
				option: input.option,
			},
			create: {
				guildId: input.guildId,
				pollId: input.pollId,
				officerId: input.officerId,
				option: input.option,
			},
		}),
		prisma.trialVotePoll.findUniqueOrThrow({
			where: {
				id: input.pollId,
			},
			include: {
				trial: {
					select: {
						userDisplayName: true,
					},
				},
				votes: {
					select: {
						option: true,
					},
				},
			},
		}),
	]);

	return {
		recorded: true,
		poll: toSnapshot(poll),
	};
}

export async function closeTrialVotePoll(
	prisma: PrismaClient,
	guildId: string,
	trialId: number,
): Promise<CloseTrialVotePollResult> {
	const existing = await prisma.trialVotePoll.findFirst({
		where: { guildId, trialId, open: true },
		select: { id: true, messageId: true },
	});

	if (!existing) {
		return { closed: false };
	}

	await prisma.trialVotePoll.update({
		where: { id: existing.id },
		data: { open: false },
	});

	return { closed: true, pollId: existing.id, messageId: existing.messageId };
}

export async function finalizeTrialVotePollArtifacts(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guildId: string;
	trialId: number;
	officerChannelId: string;
	outcome: "passed" | "failed";
}): Promise<void> {
	const log = createGuildLogger(input.guildId);
	const closeResult = await closeTrialVotePoll(
		input.prisma,
		input.guildId,
		input.trialId,
	);

	if (!closeResult.closed || !closeResult.messageId) {
		return;
	}

	try {
		const channel = await input.client.channels.fetch(input.officerChannelId);
		if (!channel?.isTextBased()) {
			return;
		}

		const msg = await channel.messages.fetch(closeResult.messageId);
		await msg.edit({
			components: buildTrialVoteButtons(closeResult.pollId, true),
		});
	} catch (error) {
		log.error(
			{ err: error, trialId: input.trialId, pollId: closeResult.pollId },
			`Failed to disable vote poll buttons after trial ${input.outcome}.`,
		);
	}
}

export type StartTrialVoteWorkflowResult = {
	content: string;
};

export async function startTrialVoteWorkflow(input: {
	prisma: PrismaClient;
	client: SapphireClient;
	guildId: string;
	target: { id: string; tag: string; displayName: string };
	actorId: string;
}): Promise<StartTrialVoteWorkflowResult> {
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

	const pollResult = await createTrialVotePoll(
		input.prisma,
		input.guildId,
		input.target.id,
		input.actorId,
	);
	if (!pollResult.created) {
		return { content: `No active trial found for ${input.target.tag}.` };
	}

	const poll = pollResult.poll;
	const logoUrl = input.client.user?.displayAvatarURL({
		extension: "png",
		size: 256,
	});
	const targetDisplayName =
		poll.targetDisplayName ??
		(await resolveGuildDisplayName(
			input.client,
			input.guildId,
			input.target.id,
			input.target.displayName,
		));
	const embed = buildTrialVotePollEmbed(
		{
			targetDisplayName,
			targetId: poll.targetId,
			trialId: poll.trialId,
			pollId: poll.pollId,
			open: poll.open,
			passVotes: poll.passVotes,
			failVotes: poll.failVotes,
			extendVotes: poll.extendVotes,
			totalVotes: poll.totalVotes,
		},
		logoUrl,
	);

	const sendResult = await sendOfficerChannelMessage(
		input.client,
		settingsResult.settings.officerChannelId,
		{
			embeds: [embed],
			components: buildTrialVoteButtons(poll.pollId, !poll.open),
		},
	);

	if (!sendResult.delivered) {
		return {
			content:
				"Vote poll was created, but I could not send it to the officer channel. Please check channel settings and permissions.",
		};
	}

	const attached = await attachTrialVotePollMessage(
		input.prisma,
		input.guildId,
		poll.pollId,
		sendResult.messageId,
	);
	if (!attached) {
		log.error(
			{ pollId: poll.pollId, messageId: sendResult.messageId },
			"Failed to attach vote poll message id.",
		);
	}

	return { content: "Posted vote poll in the officer channel." };
}
