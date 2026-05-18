import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../types.js';
import { GuildSettingsMissingError, getGuildSettings, resolveGuildDisplayName, sendOfficerChannelMessage } from '../services/guildSettings.js';
import { buildFeedbackSummaryEmbed } from '../services/embedBuilders.js';
import { getMemberFeedbackSummary } from '../services/feedbackService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('summary')
        .setDescription('Shows trial feedback summary for a member')
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The member to summarize feedback for')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
        const guildId = interaction.guildId;

        if (!guildId) {
            await interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true,
            });
            return;
        }

        let settings;

        try {
            settings = await getGuildSettings(context.prisma, guildId);
        } catch (error) {
            if (error instanceof GuildSettingsMissingError) {
                await interaction.reply({
                    content: 'Server settings have not been configured yet. Run `/settings` first.',
                    ephemeral: true,
                });
                return;
            }

            console.error('Error retrieving guild settings:', error);
            await interaction.reply({
                content: 'An error occurred while retrieving server settings. Please try again later.',
                ephemeral: true,
            });
            return;
        }

        const member = interaction.options.getUser('member');
        if (!member) {
            await interaction.reply({
                content: 'Member is required.',
                ephemeral: true,
            });
            return;
        }

        try {
            const displayName = await resolveGuildDisplayName(context.client, guildId, member.id, member.displayName);
            const result = await getMemberFeedbackSummary(context.prisma, guildId, member.id);
            const logoUrl = context.client.user.displayAvatarURL({ extension: 'png', size: 256 });
            const embed = buildFeedbackSummaryEmbed(displayName, result, logoUrl);

            const sendResult = await sendOfficerChannelMessage(context.client, settings.officerChannelId, {
                embeds: [embed.toJSON()],
            });

            if (!sendResult.delivered) {
                await interaction.reply({
                    content: 'I could not send the summary to the officer channel. Please check channel settings and permissions.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.reply({
                content: 'Posted the trial summary in the officer channel.',
                ephemeral: true,
            });
        } catch (error) {
            console.error('Error retrieving trial feedback summary:', error);
            await interaction.reply({
                content: 'An error occurred while retrieving the trial feedback summary. Please try again later.',
                ephemeral: true,
            });
        }
    },
};
