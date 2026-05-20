import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { runGuildRaidAttendanceReminderCycle } from "../services/raidAttendanceReminderService.js";
import type { AppContext } from "../types.js";

export default {
	data: new SlashCommandBuilder()
		.setName("reminders")
		.setDescription("Admin tools for raid attendance reminders")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setDMPermission(false)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("run-now")
				.setDescription(
					"Runs the raid attendance reminder cycle for this server immediately",
				),
		),
	async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
		if (!interaction.guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.deferReply({ flags: ["Ephemeral"] });

		const result = await runGuildRaidAttendanceReminderCycle(
			context,
			interaction.guildId,
		);

		if (result.skipped) {
			const content =
				result.skippedReason === "settings_missing"
					? "Server settings have not been configured yet. Run `/settings` first."
					: "Raid reminder scheduling is not configured for this server yet. Run `/settings` first.";

			await interaction.editReply({ content });
			return;
		}

		await interaction.editReply({
			content: [
				"Raid attendance reminder cycle completed.",
				`Candidates evaluated: ${result.candidatesEvaluated}`,
				`Reminders sent: ${result.remindersSent}`,
				`Duplicates skipped: ${result.remindersSkippedAsDuplicate}`,
				`Delivery failures: ${result.deliveryFailures}`,
			].join("\n"),
		});
	},
};
