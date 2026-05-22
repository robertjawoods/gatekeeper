import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { startTrialVoteWorkflow } from "../services/voteService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

async function getValidatedGuildContext(interaction: TrialCommandInteraction) {
	const guild = interaction.guild;
	const guildId = interaction.guildId;

	if (!guild || !guildId) {
		await interaction.editReply({
			content: "This command can only be used in a server.",
		});
		return null;
	}

	return { guild, guildId };
}

export class VoteCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "vote",
			description: "Creates a trial vote poll in the officer channel",
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
							.setDescription("The user to vote on")
							.setRequired(true),
					),
			{ idHints: ["1507106764330631330"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder
					.setName("Start Trial Vote")
					.setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139674055905341",
					"1507141187604320367",
					"1507142625571115188",
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

		await this.runVote(interaction, target);
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

		await this.runVote(interaction, interaction.targetUser);
	}

	private async runVote(interaction: TrialCommandInteraction, target: User) {
		await interaction.deferReply({ flags: ["Ephemeral"] });

		const guildContext = await getValidatedGuildContext(interaction);
		if (!guildContext) {
			return;
		}

		const { guildId } = guildContext;

		const workflowResult = await startTrialVoteWorkflow({
			prisma: this.container.prisma,
			client: this.container.client,
			guildId,
			target: {
				id: target.id,
				tag: target.tag,
				displayName: target.displayName,
			},
			actorId: interaction.user.id,
		});

		await interaction.editReply({
			content: workflowResult.content,
		});
	}
}
