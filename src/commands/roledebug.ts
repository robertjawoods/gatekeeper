import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import type { APIRole, ChatInputCommandInteraction, Role } from "discord.js";
import {
	buildRoleDebugEmbed,
	type RoleDebugRoleSnapshot,
} from "../services/embedBuilders.js";
import { findGuildSettings } from "../services/guildSettings.js";
import { createGuildLogger } from "../services/logger.js";

function toRoleSnapshot(
	role: Role | APIRole,
	botHighestRolePosition: number,
): RoleDebugRoleSnapshot {
	const isGuildRole = "editable" in role;
	const botCanManage = isGuildRole
		? role.editable && role.position < botHighestRolePosition
		: false;

	return {
		id: role.id,
		name: role.name,
		managed: role.managed,
		position: role.position,
		mentionable: role.mentionable,
		botEditable: botCanManage,
	};
}

function getBotHighestRolePosition(
	interaction: ChatInputCommandInteraction,
): number {
	const botMember = interaction.guild?.members.me;
	if (!botMember) {
		return -1;
	}

	return botMember.roles.highest.position;
}

export class RoledebugCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "roledebug",
			description: "Diagnose role visibility/manageability issues for settings",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName(this.name)
					.setDescription(this.description)
					.addRoleOption((option) =>
						option
							.setName("role")
							.setDescription("Role to inspect")
							.setRequired(false),
					)
					.addStringOption((option) =>
						option
							.setName("role_id")
							.setDescription(
								"Role ID to inspect if it is missing from role picker",
							)
							.setRequired(false),
					),
			{ idHints: ["1506975871188209784", "1507106673238605936"] },
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		const guildId = interaction.guildId;

		if (!guild || !guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const selectedRole = interaction.options.getRole("role");
		const roleId = interaction.options.getString("role_id")?.trim();
		const fromId = roleId ? await guild.roles.fetch(roleId) : null;
		const roleToInspect = selectedRole ?? fromId;

		const log = createGuildLogger(guildId);
		log.info(
			{
				userId: interaction.user.id,
				inspectedRoleId: roleToInspect?.id ?? null,
			},
			"Role debug executed.",
		);

		const botHighestRolePosition = getBotHighestRolePosition(interaction);
		const managedRoleCount = guild.roles.cache.filter(
			(role) => role.managed,
		).size;
		const logoUrl = this.container.client.user?.displayAvatarURL({
			extension: "png",
			size: 256,
		});

		if (roleToInspect) {
			const embed = buildRoleDebugEmbed(
				{
					guildId,
					botHighestRolePosition,
					managedRoleCount,
					inspectedRole: toRoleSnapshot(roleToInspect, botHighestRolePosition),
				},
				logoUrl,
			);

			await interaction.reply({
				embeds: [embed],
				flags: ["Ephemeral"],
			});
			return;
		}

		const settings = await findGuildSettings(this.container.prisma, guildId);
		const trialRole = settings
			? await guild.roles.fetch(settings.trialRoleId)
			: null;
		const raiderRole = settings
			? await guild.roles.fetch(settings.raiderRoleId)
			: null;

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
			embedInput.configuredTrialRole = toRoleSnapshot(
				trialRole,
				botHighestRolePosition,
			);
		} else if (settings) {
			log.warn(
				{ trialRoleId: settings.trialRoleId },
				"Configured trial role not found in guild.",
			);
			embedInput.configuredTrialRoleMissingId = settings.trialRoleId;
		}

		if (raiderRole) {
			embedInput.configuredRaiderRole = toRoleSnapshot(
				raiderRole,
				botHighestRolePosition,
			);
		} else if (settings) {
			log.warn(
				{ raiderRoleId: settings.raiderRoleId },
				"Configured raider role not found in guild.",
			);
			embedInput.configuredRaiderRoleMissingId = settings.raiderRoleId;
		}

		const embed = buildRoleDebugEmbed(embedInput, logoUrl);

		await interaction.reply({
			embeds: [embed],
			flags: ["Ephemeral"],
		});
	}
}
