import { Precondition } from "@sapphire/framework";
import {
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type ContextMenuCommandInteraction,
} from "discord.js";
import { logger } from "../services/logger.js";

export class OfficerOnlyPrecondition extends Precondition {
    public constructor(
        context: Precondition.LoaderContext,
        options: Precondition.Options,
    ) {
        super(context, {
            ...options,
            name: "OfficerOnly",
        });
    }

    private static readonly DENIED_MESSAGE =
        "This command is restricted to officers only.";

    private hasOfficerPermissions(
        interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
    ): boolean {
        const cachedOwnerId = interaction.guild?.ownerId;
        if (cachedOwnerId && cachedOwnerId === interaction.user.id) {
            return true;
        }

        const permissions = interaction.memberPermissions;
        if (!permissions) {
            return false;
        }

        return permissions.has(PermissionFlagsBits.Administrator, true)
            || permissions.has(PermissionFlagsBits.ManageGuild, true)
            || permissions.has(PermissionFlagsBits.ModerateMembers, true);
    }

    private async deny(
        interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
    ) {
        logger.warn(
            {
                guildId: interaction.guildId,
                userId: interaction.user.id,
                guildOwnerId: interaction.guild?.ownerId,
                memberPermissions: interaction.memberPermissions?.bitfield.toString(),
            },
            "OfficerOnly precondition denied interaction.",
        );

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: OfficerOnlyPrecondition.DENIED_MESSAGE,
                flags: ["Ephemeral"],
            });
        }

        return this.error({
            message: "User does not have officer permissions",
        });
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        if (!this.hasOfficerPermissions(interaction)) {
            return this.deny(interaction);
        }

        return this.ok();
    }

    public override async contextMenuRun(
        interaction: ContextMenuCommandInteraction,
    ) {
        if (!this.hasOfficerPermissions(interaction)) {
            return this.deny(interaction);
        }

        return this.ok();
    }
}