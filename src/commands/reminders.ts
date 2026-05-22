import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
} from "discord.js";
import { runGuildRaidAttendanceReminderCycle } from "../services/raidAttendanceReminderService.js";

export class RemindersCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "reminders",
			description: "Admin tools for raid attendance reminders",
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
					.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
					.setDMPermission(false)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("run-now")
							.setDescription(
								"Runs the raid attendance reminder cycle for this server immediately",
							),
					),
			{ idHints: ["1506975876255060102", "1507106677206548624"] },
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.deferReply({ flags: ["Ephemeral"] });

		const result = await runGuildRaidAttendanceReminderCycle(
			{ prisma: this.container.prisma, client: this.container.client },
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
	}
}
