import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ChannelSelectMenuBuilder,
	type ChatInputCommandInteraction,
	LabelBuilder,
	ModalBuilder,
	RoleSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { findGuildSettings } from "../services/guildSettings.js";
import { createGuildLogger } from "../services/logger.js";

/* 
     trialRoleId String
  raiderRoleId String
  officerChannelId String
     
*/

export class SettingsCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "settings",
			description: "Allows officers to adjust settings for the trial tracker",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand(
			(builder) => builder.setName(this.name).setDescription(this.description),
			{ idHints: ["1507106679014297761"] },
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const settings = await findGuildSettings(this.container.prisma, guildId);

		createGuildLogger(guildId).info(
			{ userId: interaction.user.id },
			"Settings modal opened.",
		);

		const modal = new ModalBuilder()
			.setCustomId("settingsModal")
			.setTitle(`Settings for Gatekeeper`);

		const officerChannelInput = new ChannelSelectMenuBuilder()
			.setCustomId("officerChannelId")
			.setPlaceholder("Select the channel for officer notifications")
			.setChannelTypes([0]) // 0 is for text channels
			.setDefaultChannels(
				settings?.officerChannelId ? [settings.officerChannelId] : [],
			)
			.setMaxValues(1)
			.setRequired(true);

		const officerChannelLabel = new LabelBuilder()
			.setLabel("Officer Notification Channel")
			.setChannelSelectMenuComponent(officerChannelInput);

		const raiderRoleInput = new RoleSelectMenuBuilder()
			.setCustomId("raiderRoleId")
			.setPlaceholder("Select the raider role")
			.setDefaultRoles(settings?.raiderRoleId ? [settings.raiderRoleId] : [])
			.setMaxValues(1)
			.setRequired(true);

		const raiderRoleLabel = new LabelBuilder()
			.setLabel("Raider Role")
			.setRoleSelectMenuComponent(raiderRoleInput);

		const trialRoleInput = new RoleSelectMenuBuilder()
			.setCustomId("trialRoleId")
			.setPlaceholder("Select the trial role")
			.setDefaultRoles(settings?.trialRoleId ? [settings.trialRoleId] : [])
			.setMaxValues(1)
			.setRequired(true);

		const trialRoleLabel = new LabelBuilder()
			.setLabel("Trial Role")
			.setRoleSelectMenuComponent(trialRoleInput);

		const raidScheduleCronInput = new TextInputBuilder()
			.setCustomId("raidScheduleCron")
			.setStyle(TextInputStyle.Short)
			.setPlaceholder("Example: 0 19 * * 2,4,6")
			.setValue(settings?.raidScheduleCron ?? "")
			.setRequired(false);

		const raidScheduleCronLabel = new LabelBuilder()
			.setLabel("Raid Schedule (Cron)")
			.setTextInputComponent(raidScheduleCronInput);

		const raidThresholdInput = new TextInputBuilder()
			.setCustomId("raidAttendanceReminderThreshold")
			.setStyle(TextInputStyle.Short)
			.setPlaceholder("Example: 4")
			.setValue(settings?.raidAttendanceReminderThreshold?.toString() ?? "")
			.setRequired(false);

		const raidThresholdLabel = new LabelBuilder()
			.setLabel("Attendance Reminder Threshold")
			.setTextInputComponent(raidThresholdInput);

		modal.addLabelComponents(
			officerChannelLabel,
			raiderRoleLabel,
			trialRoleLabel,
			raidScheduleCronLabel,
			raidThresholdLabel,
		);

		await interaction.showModal(modal);
	}
}
