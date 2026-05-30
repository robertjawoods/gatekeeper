import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { pruneTrialsWorkflow } from "../services/trialService.js";

export class PruneCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "prune",
			description: "Fails active trials for members who left the server",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addBooleanOption((option) =>
					option
						.setName("dry_run")
						.setDescription(
							"Preview which trials would be pruned without making any changes",
						)
						.setRequired(false),
				),
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

		await interaction.deferReply({ flags: ["Ephemeral"] });

		const dryRun = interaction.options.getBoolean("dry_run") ?? false;

		const workflowResult = await pruneTrialsWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guild,
			guildId,
			actor: {
				id: interaction.user.id,
				username: interaction.user.username,
			},
					dryRun,
		});

		await interaction.editReply({
			content: workflowResult.content,
		});
	}
}