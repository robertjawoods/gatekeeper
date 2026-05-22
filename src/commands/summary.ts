import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { postTrialSummaryWorkflow } from "../services/trialService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

export class SummaryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "summary",
			description: "Shows trial feedback summary for a member",
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
					.addUserOption((option) =>
						option
							.setName("member")
							.setDescription("The member to summarize feedback for")
							.setRequired(true),
					),
			{ idHints: ["1507106762896052334"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder
					.setName("View Trial Summary")
					.setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139591918977176",
					"1507141186635173968",
					"1507142623800983634",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const member = interaction.options.getUser("member");
		if (!member) {
			await interaction.reply({
				content: "Member is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runSummary(interaction, member);
	}

	public override async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	) {
		if (!interaction.isUserContextMenuCommand()) {
			await interaction.reply({
				content: "This command can only be used from a user context menu.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runSummary(interaction, interaction.targetUser);
	}

	private async runSummary(interaction: TrialCommandInteraction, member: User) {
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const workflowResult = await postTrialSummaryWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guildId,
			member: {
				id: member.id,
				displayName: member.displayName,
			},
		});

		await interaction.reply({
			content: workflowResult.content,
			flags: ["Ephemeral"],
		});
	}
}
