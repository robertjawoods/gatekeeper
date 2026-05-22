// lists trials, takes active as a optional argument to filter by active/inactive trials, defaults to active trials only

import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { postTrialListWorkflow } from "../services/trialService.js";

/*
The list command should retrieve trial entries from the database and display them in a user-friendly format. 
It should support an optional argument to filter by active or inactive trials, defaulting to active trials only. 
The displayed information should include the user on trial, the start time, the status of the trial, and any other relevant details.
*/

export class ListCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "list",
			description: "Lists all trials",
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
						.setName("active")
						.setDescription("Whether to list only active trials")
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const activeOnly = interaction.options.getBoolean("active") ?? true;
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.deferReply({ flags: ["Ephemeral"] });

		const workflowResult = await postTrialListWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guildId,
			activeOnly,
		});

		await interaction.editReply({
			content: workflowResult.content,
		});
	}
}
