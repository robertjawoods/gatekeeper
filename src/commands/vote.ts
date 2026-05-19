import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../types.js';
import {
    GuildSettingsMissingError,
    getGuildSettings,
    resolveGuildDisplayName,
    sendOfficerChannelMessage,
} from '../services/guildSettings.js';
import { buildTrialVotePollEmbed } from '../services/embedBuilders.js';
import {
    attachTrialVotePollMessage,
    buildTrialVoteButtons,
    createTrialVotePoll,
} from '../services/voteService.js';

async function getValidatedTarget(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser('target');
    if (!target) {
        await interaction.reply({
            content: 'Target user is required.',
            ephemeral: true,
        });
        return null;
    }

    return target;
}

async function getValidatedGuildContext(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (!guild || !guildId) {
        await interaction.reply({
            content: 'This command can only be used in a server.',
            ephemeral: true,
        });
        return null;
    }

    return { guild, guildId };
}

async function getSettingsOrReply(interaction: ChatInputCommandInteraction, context: AppContext, guildId: string) {
    try {
        return await getGuildSettings(context.prisma, guildId);
    } catch (error) {
        if (error instanceof GuildSettingsMissingError) {
            await interaction.reply({
                content: 'Server settings have not been configured yet. Run `/settings` first.',
                ephemeral: true,
            });
            return null;
        }

        console.error('Error retrieving guild settings:', error);
        await interaction.reply({
            content: 'An error occurred while retrieving server settings. Please try again later.',
            ephemeral: true,
        });
        return null;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Creates a trial vote poll in the officer channel')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The user to vote on')
                .setRequired(true),
        ),
    async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
        const guildContext = await getValidatedGuildContext(interaction);
        if (!guildContext) {
            return;
        }

        const { guildId } = guildContext;
        const target = await getValidatedTarget(interaction);
        if (!target) {
            return;
        }

        const settings = await getSettingsOrReply(interaction, context, guildId);
        if (!settings) {
            return;
        }

        const pollResult = await createTrialVotePoll(context.prisma, guildId, target.id, interaction.user.id);
        if (!pollResult.created) {
            await interaction.reply({
                content: `No active trial found for ${target.tag}.`,
                ephemeral: true,
            });
            return;
        }

        const poll = pollResult.poll;
        const logoUrl = context.client.user?.displayAvatarURL({ extension: 'png', size: 256 });
        const targetDisplayName = await resolveGuildDisplayName(context.client, guildId, target.id, target.displayName);
        const embed = buildTrialVotePollEmbed({
            targetDisplayName,
            targetId: poll.targetId,
            trialId: poll.trialId,
            pollId: poll.pollId,
            open: poll.open,
            passVotes: poll.passVotes,
            failVotes: poll.failVotes,
            extendVotes: poll.extendVotes,
            totalVotes: poll.totalVotes,
        }, logoUrl);

        const sendResult = await sendOfficerChannelMessage(context.client, settings.officerChannelId, {
            embeds: [embed],
            components: buildTrialVoteButtons(poll.pollId, !poll.open),
        });

        if (!sendResult.delivered) {
            await interaction.reply({
                content: 'Vote poll was created, but I could not send it to the officer channel. Please check channel settings and permissions.',
                ephemeral: true,
            });
            return;
        }

        const attached = await attachTrialVotePollMessage(context.prisma, guildId, poll.pollId, sendResult.messageId);
        if (!attached) {
            console.error(`Failed to attach message ${sendResult.messageId} to poll ${poll.pollId} in guild ${guildId}.`);
        }

        await interaction.reply({
            content: 'Posted vote poll in the officer channel.',
            ephemeral: true,
        });
    },
};
