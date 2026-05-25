import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { postTrialFeedbackBoardWorkflow } from "../services/multiTrialFeedbackService.js";

export class TrialsFeedbackCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "trials-feedback",
			description: "Posts buttons for feedback on each active trial",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand((builder) =>
			builder.setName(this.name).setDescription(this.description),
		 { idHints: ["1508606067167330304"] });
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

		const workflowResult = await postTrialFeedbackBoardWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guildId: interaction.guildId,
		});

		await interaction.editReply({
			content: workflowResult.content,
		});
	}
}
