import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { TrialVoteOption } from '../generated/prisma/client.js';

const VOTE_CUSTOM_ID_PREFIX = 'trialvote';

type VoteChoice = 'pass' | 'fail' | 'extend';

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
    open: boolean;
    totalVotes: number;
    passVotes: number;
    failVotes: number;
    extendVotes: number;
};

export type CreateTrialVotePollResult =
    | { created: true; poll: TrialVotePollSnapshot }
    | { created: false; reason: 'no_active_trial' };

export type TrialVotePollLookupResult =
    | { found: true; poll: TrialVotePollSnapshot }
    | { found: false; reason: 'poll_not_found' | 'wrong_guild' };

export type RecordTrialVoteResult =
    | { recorded: true; poll: TrialVotePollSnapshot }
    | { recorded: false; reason: 'poll_not_found' | 'wrong_guild' | 'poll_closed' | 'message_mismatch' };

function toSnapshot(poll: {
    id: number;
    guildId: string;
    trialId: number;
    targetId: string;
    open: boolean;
    votes: Array<{ option: TrialVoteOption }>;
}): TrialVotePollSnapshot {
    const passVotes = poll.votes.filter(vote => vote.option === TrialVoteOption.PASS).length;
    const failVotes = poll.votes.filter(vote => vote.option === TrialVoteOption.FAIL).length;
    const extendVotes = poll.votes.filter(vote => vote.option === TrialVoteOption.EXTEND).length;

    return {
        pollId: poll.id,
        guildId: poll.guildId,
        trialId: poll.trialId,
        targetId: poll.targetId,
        open: poll.open,
        totalVotes: poll.votes.length,
        passVotes,
        failVotes,
        extendVotes,
    };
}

function parseVoteChoice(rawOption: string): VoteChoice | null {
    if (rawOption === 'pass' || rawOption === 'fail' || rawOption === 'extend') {
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

export function parseVoteCustomId(customId: string): { pollId: number; option: TrialVoteOption } | null {
    const [prefix, pollIdRaw, optionRaw] = customId.split(':');
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

export function buildTrialVoteButtons(pollId: number, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(buildVoteCustomId(pollId, 'pass'))
            .setLabel('Pass')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildVoteCustomId(pollId, 'fail'))
            .setLabel('Fail')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildVoteCustomId(pollId, 'extend'))
            .setLabel('Extend')
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
        return { created: false, reason: 'no_active_trial' };
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
            votes: {
                select: {
                    option: true,
                },
            },
        },
    });

    if (!poll) {
        return { found: false, reason: 'poll_not_found' };
    }

    if (poll.guildId !== guildId) {
        return { found: false, reason: 'wrong_guild' };
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
        return { recorded: false, reason: 'poll_not_found' };
    }

    if (existingPoll.guildId !== input.guildId) {
        return { recorded: false, reason: 'wrong_guild' };
    }

    if (!existingPoll.open) {
        return { recorded: false, reason: 'poll_closed' };
    }

    if (existingPoll.messageId && existingPoll.messageId !== input.sourceMessageId) {
        return { recorded: false, reason: 'message_mismatch' };
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
