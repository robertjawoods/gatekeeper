import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { resolveTrialWorkflow } from "../services/trialService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

export class FailCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "fail",
			description: "Fails the trial",
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
							.setName("target")
							.setDescription("The user to fail the trial for")
							.setRequired(true),
					),
			{ idHints: ["1507106766935162921"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Fail Trial").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139676618752263",
					"1507141189860593746",
					"1507142713533923581",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = interaction.options.getUser("target");
		if (!target) {
			await interaction.reply({
				content: "Target user is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runFail(interaction, target);
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

		await this.runFail(interaction, interaction.targetUser);
	}

	private async runFail(interaction: TrialCommandInteraction, target: User) {
		const guild = interaction.guild;
		const guildId = interaction.guildId;

		if (!guild || !guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const workflowResult = await resolveTrialWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guild,
			guildId,
			target: {
				id: target.id,
				tag: target.tag,
				displayName: target.displayName,
			},
			actor: {
				id: interaction.user.id,
				username: interaction.user.username,
			},
			outcome: "failed",
		});

		await interaction.reply({
			content: workflowResult.content,
			flags: ["Ephemeral"],
		});
	}
}
