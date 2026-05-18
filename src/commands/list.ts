// lists trials, takes active as a optional argument to filter by active/inactive trials, defaults to active trials only

import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../types.js';
import { GuildSettingsMissingError, getGuildSettings, resolveGuildDisplayName, sendOfficerChannelMessage } from '../services/guildSettings.js';
import { buildTrialListEmbeds, type TrialListItem } from '../services/embedBuilders.js';
import { listTrials } from '../services/trialService.js';

/*
The list command should retrieve trial entries from the database and display them in a user-friendly format. 
It should support an optional argument to filter by active or inactive trials, defaulting to active trials only. 
The displayed information should include the user on trial, the start time, the status of the trial, and any other relevant details.
*/

export default {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('Lists all trials')
        .addBooleanOption(option =>
            option.setName('active')
                .setDescription('Whether to list only active trials')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
        const activeOnly = interaction.options.getBoolean('active') ?? true;
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

        try {
            const trials = await listTrials(context.prisma, guildId, activeOnly);
            const logoUrl = context.client.user?.displayAvatarURL({ extension: 'png', size: 256 });
            const items: TrialListItem[] = await Promise.all(trials.map(async trial => {
                const status = trial.active ? 'Active' : trial.passed ? 'Passed' : 'Failed';
                const displayName = await resolveGuildDisplayName(context.client, guildId, trial.userId, trial.userId);
                return {
                    displayName,
                    status,
                    startTime: trial.startTime,
                };
            }));

            const embeds = buildTrialListEmbeds(items, activeOnly, logoUrl).map(embed => embed.toJSON());

            const sendResult = await sendOfficerChannelMessage(context.client, settings.officerChannelId, { embeds });

            if (!sendResult.delivered) {
                await interaction.reply({
                    content: 'I could not send the trial list to the officer channel. Please check channel settings and permissions.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.reply({
                content: 'Posted the trial list in the officer channel.',
                ephemeral: true,
            });
        } catch (error) {
            console.error('Error retrieving trials:', error);
            await interaction.reply({
                content: 'An error occurred while retrieving trials. Please try again later.',
                ephemeral: true,
            });
        }
    },
};