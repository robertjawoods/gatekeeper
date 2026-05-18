import { SlashCommandBuilder, type APIRole, type ChatInputCommandInteraction, type Role } from 'discord.js';
import type { AppContext } from '../types.js';
import { buildRoleDebugEmbed, type RoleDebugRoleSnapshot } from '../services/embedBuilders.js';
import { findGuildSettings } from '../services/guildSettings.js';

function toRoleSnapshot(role: Role | APIRole, botHighestRolePosition: number): RoleDebugRoleSnapshot {
    const isGuildRole = 'editable' in role;
    const botCanManage = isGuildRole ? role.editable && role.position < botHighestRolePosition : false;

    return {
        id: role.id,
        name: role.name,
        managed: role.managed,
        position: role.position,
        mentionable: role.mentionable,
        botEditable: botCanManage,
    };
}

function getBotHighestRolePosition(interaction: ChatInputCommandInteraction): number {
    const botMember = interaction.guild?.members.me;
    if (!botMember) {
        return -1;
    }

    return botMember.roles.highest.position;
}

export default {
    data: new SlashCommandBuilder()
        .setName('roledebug')
        .setDescription('Diagnose role visibility/manageability issues for settings')
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Role to inspect')
                .setRequired(false),
        )
        .addStringOption(option =>
            option
                .setName('role_id')
                .setDescription('Role ID to inspect if it is missing from role picker')
                .setRequired(false),
        ),
    async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
        const guild = interaction.guild;
        const guildId = interaction.guildId;

        if (!guild || !guildId) {
            await interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true,
            });
            return;
        }

        const selectedRole = interaction.options.getRole('role');
        const roleId = interaction.options.getString('role_id')?.trim();
        const fromId = roleId ? await guild.roles.fetch(roleId) : null;
        const roleToInspect = selectedRole ?? fromId;

        const botHighestRolePosition = getBotHighestRolePosition(interaction);
        const managedRoleCount = guild.roles.cache.filter(role => role.managed).size;
        const logoUrl = context.client.user.displayAvatarURL({ extension: 'png', size: 256 });

        if (roleToInspect) {
            const embed = buildRoleDebugEmbed({
                guildId,
                botHighestRolePosition,
                managedRoleCount,
                inspectedRole: toRoleSnapshot(roleToInspect, botHighestRolePosition),
            }, logoUrl);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
            return;
        }

        const settings = await findGuildSettings(context.prisma, guildId);
        const trialRole = settings ? await guild.roles.fetch(settings.trialRoleId) : null;
        const raiderRole = settings ? await guild.roles.fetch(settings.raiderRoleId) : null;

        const embedInput: {
            guildId: string;
            botHighestRolePosition: number;
            managedRoleCount: number;
            configuredTrialRole?: RoleDebugRoleSnapshot;
            configuredTrialRoleMissingId?: string;
            configuredRaiderRole?: RoleDebugRoleSnapshot;
            configuredRaiderRoleMissingId?: string;
        } = {
            guildId,
            botHighestRolePosition,
            managedRoleCount,
        };

        if (trialRole) {
            embedInput.configuredTrialRole = toRoleSnapshot(trialRole, botHighestRolePosition);
        } else if (settings) {
            embedInput.configuredTrialRoleMissingId = settings.trialRoleId;
        }

        if (raiderRole) {
            embedInput.configuredRaiderRole = toRoleSnapshot(raiderRole, botHighestRolePosition);
        } else if (settings) {
            embedInput.configuredRaiderRoleMissingId = settings.raiderRoleId;
        }

        const embed = buildRoleDebugEmbed(embedInput, logoUrl);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    },
};
