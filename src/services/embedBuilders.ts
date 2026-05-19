import { EmbedBuilder } from 'discord.js';
import type { MemberFeedbackSummaryResult } from './feedbackService.js';

const COLORS = {
    info: 0x2b6cb0,
    success: 0x2f855a,
    warning: 0xb7791f,
    debug: 0xc05621,
};

const MAX_TRIALS_PER_EMBED = 10;

export type TrialListItem = {
    displayName: string;
    status: 'Active' | 'Passed' | 'Failed';
    startTime: Date;
};

export type RoleDebugRoleSnapshot = {
    id: string;
    name: string;
    managed: boolean;
    position: number;
    mentionable: boolean;
    botEditable: boolean;
};

export type RoleDebugEmbedInput = {
    guildId: string;
    botHighestRolePosition: number;
    managedRoleCount: number;
    inspectedRole?: RoleDebugRoleSnapshot;
    configuredTrialRole?: RoleDebugRoleSnapshot;
    configuredTrialRoleMissingId?: string;
    configuredRaiderRole?: RoleDebugRoleSnapshot;
    configuredRaiderRoleMissingId?: string;
};

export type RaidAttendanceReminderEmbedInput = {
    displayName: string;
    userId: string;
    trialId: number;
    raidNightsAttended: number;
    threshold: number;
};

export type TrialVotePollEmbedInput = {
    targetDisplayName: string;
    targetId: string;
    trialId: number;
    pollId: number;
    open: boolean;
    passVotes: number;
    failVotes: number;
    extendVotes: number;
    totalVotes: number;
};

function applyGatekeeperLogo(embed: EmbedBuilder, logoUrl?: string): EmbedBuilder {
    if (logoUrl) {
        embed.setThumbnail(logoUrl);
    }

    return embed;
}

function chunkItems<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function formatDiscordTimestamp(date: Date): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function formatRoleSnapshot(snapshot: RoleDebugRoleSnapshot): string {
    return [
        `Name: ${snapshot.name}`,
        `ID: ${snapshot.id}`,
        `Managed: ${snapshot.managed ? 'Yes' : 'No'}`,
        `Position: ${snapshot.position}`,
        `Mentionable: ${snapshot.mentionable ? 'Yes' : 'No'}`,
        `Bot editable: ${snapshot.botEditable ? 'Yes' : 'No'}`,
    ].join('\n');
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function buildTrialListEmbeds(items: TrialListItem[], activeOnly: boolean, logoUrl?: string): EmbedBuilder[] {
    if (items.length === 0) {
        return [applyGatekeeperLogo(
            new EmbedBuilder()
                .setColor(COLORS.info)
                .setTitle(activeOnly ? 'Active Trials' : 'All Trials')
                .setDescription('No trials found for this server.')
                .setTimestamp(new Date()),
            logoUrl,
        )];
    }

    const chunks = chunkItems(items, MAX_TRIALS_PER_EMBED);

    return chunks.map((chunk, chunkIndex) => {
        const embed = new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle(activeOnly ? 'Active Trials' : 'All Trials')
            .setFooter({ text: `Page ${chunkIndex + 1}/${chunks.length} • ${items.length} total` })
            .setTimestamp(new Date());

        chunk.forEach((item, itemIndex) => {
            const globalIndex = chunkIndex * MAX_TRIALS_PER_EMBED + itemIndex + 1;
            embed.addFields({
                name: `${globalIndex}. ${item.displayName}`,
                value: `Status: **${item.status}**\nStarted: ${formatDiscordTimestamp(item.startTime)}`,
                inline: false,
            });
        });

        return applyGatekeeperLogo(embed, logoUrl);
    });
}

export function buildFeedbackSummaryEmbed(
    displayName: string,
    result: MemberFeedbackSummaryResult,
    logoUrl?: string,
): EmbedBuilder {
    if (result.outcome === 'no_active_trial') {
        return applyGatekeeperLogo(
            new EmbedBuilder()
                .setColor(COLORS.warning)
                .setTitle('Trial Feedback Summary')
                .setDescription(`No active trial found for **${displayName}**.`)
                .setTimestamp(new Date()),
            logoUrl,
        );
    }

    if (result.outcome === 'no_feedback') {
        return applyGatekeeperLogo(
            new EmbedBuilder()
                .setColor(COLORS.warning)
                .setTitle('Trial Feedback Summary')
                .setDescription(`An active trial exists for **${displayName}**, but no feedback has been submitted yet.`)
                .setFooter({ text: `Trial ID: ${result.trialId}` })
                .setTimestamp(new Date()),
            logoUrl,
        );
    }

    const comments = result.summary.recentComments.length === 0
        ? 'No recent comments submitted.'
        : result.summary.recentComments
            .map((comment, index) => `${index + 1}. ${truncate(comment, 280)}`)
            .join('\n');

    return applyGatekeeperLogo(
        new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('Trial Feedback Summary')
            .setDescription(`Member: **${displayName}**`)
            .addFields(
                { name: 'Feedback Entries', value: String(result.summary.feedbackCount), inline: true },
                { name: 'Late Marks', value: String(result.summary.lateCount), inline: true },
                { name: 'Performance', value: `${result.summary.averages.performance}/5`, inline: true },
                { name: 'Attitude', value: `${result.summary.averages.attitude}/5`, inline: true },
                { name: 'Focus', value: `${result.summary.averages.focus}/5`, inline: true },
                { name: 'Recent Comments', value: comments, inline: false },
            )
            .setFooter({ text: `Trial ID: ${result.summary.trialId}` })
            .setTimestamp(new Date()),
        logoUrl,
    );
}

export function buildRoleDebugEmbed(input: RoleDebugEmbedInput, logoUrl?: string): EmbedBuilder {
    const embed = applyGatekeeperLogo(new EmbedBuilder()
        .setColor(COLORS.debug)
        .setTitle('Role Debug')
        .addFields(
            { name: 'Guild ID', value: input.guildId, inline: false },
            { name: 'Bot Highest Role Position', value: String(input.botHighestRolePosition), inline: true },
            { name: 'Managed Roles In Guild', value: String(input.managedRoleCount), inline: true },
        )
        .setTimestamp(new Date()), logoUrl);

    if (input.inspectedRole) {
        embed.addFields({
            name: 'Inspected Role',
            value: formatRoleSnapshot(input.inspectedRole),
            inline: false,
        });
        return embed;
    }

    if (input.configuredTrialRole) {
        embed.addFields({
            name: 'Configured Trial Role',
            value: formatRoleSnapshot(input.configuredTrialRole),
            inline: false,
        });
    } else if (input.configuredTrialRoleMissingId) {
        embed.addFields({
            name: 'Configured Trial Role',
            value: `Missing role ID: ${input.configuredTrialRoleMissingId}`,
            inline: false,
        });
    } else {
        embed.addFields({
            name: 'Configured Trial Role',
            value: 'No trial role configured.',
            inline: false,
        });
    }

    if (input.configuredRaiderRole) {
        embed.addFields({
            name: 'Configured Raider Role',
            value: formatRoleSnapshot(input.configuredRaiderRole),
            inline: false,
        });
    } else if (input.configuredRaiderRoleMissingId) {
        embed.addFields({
            name: 'Configured Raider Role',
            value: `Missing role ID: ${input.configuredRaiderRoleMissingId}`,
            inline: false,
        });
    } else {
        embed.addFields({
            name: 'Configured Raider Role',
            value: 'No raider role configured.',
            inline: false,
        });
    }

    return embed;
}

export function buildRaidAttendanceReminderEmbed(
    input: RaidAttendanceReminderEmbedInput,
    logoUrl?: string,
): EmbedBuilder {
    return applyGatekeeperLogo(
        new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle('Trial Attendance Reminder')
            .setDescription(`<@${input.userId}> has reached the raid attendance threshold.`)
            .addFields(
                { name: 'Member', value: input.displayName, inline: true },
                { name: 'Raid Nights Attended', value: String(input.raidNightsAttended), inline: true },
                { name: 'Threshold', value: String(input.threshold), inline: true },
                { name: 'Trial ID', value: String(input.trialId), inline: false },
            )
            .setTimestamp(new Date()),
        logoUrl,
    );
}

export function buildTrialVotePollEmbed(input: TrialVotePollEmbedInput, logoUrl?: string): EmbedBuilder {
    return applyGatekeeperLogo(
        new EmbedBuilder()
            .setColor(input.open ? COLORS.info : COLORS.warning)
            .setTitle('Trial Vote Poll')
            .setDescription(`Vote for **${input.targetDisplayName}** (<@${input.targetId}>).`)
            .addFields(
                { name: 'Trial ID', value: String(input.trialId), inline: true },
                { name: 'Poll ID', value: String(input.pollId), inline: true },
                { name: 'Status', value: input.open ? 'Open' : 'Closed', inline: true },
                { name: 'Pass', value: String(input.passVotes), inline: true },
                { name: 'Fail', value: String(input.failVotes), inline: true },
                { name: 'Extend', value: String(input.extendVotes), inline: true },
                { name: 'Total Votes', value: String(input.totalVotes), inline: false },
            )
            .setFooter({ text: 'Use the buttons below to cast or update your vote.' })
            .setTimestamp(new Date()),
        logoUrl,
    );
}
