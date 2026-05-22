import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { startTrialWorkflow } from "../services/trialService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

async function getValidatedTarget(interaction: ChatInputCommandInteraction) {
	const target = interaction.options.getUser("target");
	if (!target) {
		await interaction.reply({
			content: "Target user is required.",
			flags: ["Ephemeral"],
		});
		return null;
	}

	return target;
}

async function getValidatedGuildContext(interaction: TrialCommandInteraction) {
	const guild = interaction.guild;
	const guildId = interaction.guildId;

	if (!guild || !guildId) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: ["Ephemeral"],
		});
		return null;
	}

	return { guild, guildId };
}

// Starting a trial should create a new trial entry in the database and reply with a confirmation message.
// It should also ensure that the trial target is given the trial role
// It should check if the user already has an active trial and prevent starting a new one if they do.
// The trial entry should include the user who started the trial, the start time, and any other relevant information.

export class StartCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "start",
			description: "Starts the trial for a user.",
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
							.setDescription("The user to start the trial for")
							.setRequired(true),
					),
			{ idHints: ["1506975873704660992", "1507106674631114873"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Start Trial").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139584482349116",
					"1507141185871806595",
					"1507142534667960320",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = await getValidatedTarget(interaction);
		if (!target) {
			return;
		}

		await this.runStart(interaction, target);
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

		await this.runStart(interaction, interaction.targetUser);
	}

	private async runStart(interaction: TrialCommandInteraction, target: User) {
		const guildContext = await getValidatedGuildContext(interaction);
		if (!guildContext) {
			return;
		}

		const workflowResult = await startTrialWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guild: guildContext.guild,
			guildId: guildContext.guildId,
			target: {
				id: target.id,
				tag: target.tag,
				displayName: target.displayName,
			},
			actor: {
				id: interaction.user.id,
				username: interaction.user.username,
			},
		});

		await interaction.reply({
			content: workflowResult.content,
			flags: ["Ephemeral"],
		});
	}
}
