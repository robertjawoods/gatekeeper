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

// Passing a trial should update the trial entry in the database, remove the trial role, add the raider role, and reply with a confirmation message.

export class PassCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "pass",
			description: "Passes the trial",
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
							.setDescription("The user to pass the trial for")
							.setRequired(true),
					),
			{ idHints: ["1507106765685391470"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Pass Trial").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139675435827271",
					"1507141188329799793",
					"1507142711935897629",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = await getValidatedTarget(interaction);
		if (!target) {
			return;
		}

		await this.runPass(interaction, target);
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

		await this.runPass(interaction, interaction.targetUser);
	}

	private async runPass(interaction: TrialCommandInteraction, target: User) {
		const guildContext = await getValidatedGuildContext(interaction);
		if (!guildContext) {
			return;
		}

		const workflowResult = await resolveTrialWorkflow({
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
			outcome: "passed",
		});

		await interaction.reply({
			content: workflowResult.content,
			flags: ["Ephemeral"],
		});
	}
}
