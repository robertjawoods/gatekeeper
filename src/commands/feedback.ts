import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { buildFeedbackModal } from "../services/feedbackService.js";
import type { TrialCommandInteraction } from "../types.js";

/* 
	This form collects feedback from officers about a trial's performance 

	Performance 1-5
	Attitude 1-5
	Focus 1-5
	Late (Y/N)
	Comments (text field)

	the officer giving the feedback should be recorded

	each officer should give feedback for each trial each raid night while the trial is active, 
	and the feedback should be stored in the database and associated with the trial and the officer who gave it.

	after 4 entries, the feedback should be averaged, maybe an ai summary of the comments should be generated,
	and the trial should be marked as completed and removed from the active trials list.

	the report should be sent as a message in a moderator channel, and should have voting buttons
	for "Promote", "Extend Trial", and "Reject".
	 
*/

export class FeedbackCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "feedback",
			description:
				"Provides a feedback form for users to submit their feedback.",
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
							.setDescription("The user to provide feedback for")
							.setRequired(true),
					),
			{ idHints: ["1507106768046657608"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Add Feedback").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139682578862162",
					"1507141274413830285",
					"1507142863237025944",
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

		await this.openFeedbackModal(interaction, target);
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

		await this.openFeedbackModal(interaction, interaction.targetUser);
	}

	private async openFeedbackModal(
		interaction: TrialCommandInteraction,
		target: User,
	) {
		if (!interaction.guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const modal = buildFeedbackModal(
			target.id,
			target.displayName ?? target.username,
		);

		await interaction.showModal(modal);
	}
}
