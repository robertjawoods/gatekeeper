import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	CheckboxBuilder,
	type ContextMenuCommandInteraction,
	LabelBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type User,
} from "discord.js";
import { buildFeedbackModalCustomId } from "../services/feedbackService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

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

		const displayName = target.displayName ?? target.username;
		const modal = new ModalBuilder()
			.setCustomId(buildFeedbackModalCustomId(target.id))
			.setTitle(`Feedback for ${displayName}`);

		const performanceInput = new TextInputBuilder()
			.setCustomId("performance")
			.setStyle(TextInputStyle.Short)
			.setPlaceholder("Rate performance from 1 to 5")
			.setRequired(true);

		const attitudeInput = new TextInputBuilder()
			.setCustomId("attitude")
			.setStyle(TextInputStyle.Short)
			.setPlaceholder("Rate attitude from 1 to 5")
			.setRequired(true);

		const focusInput = new TextInputBuilder()
			.setCustomId("focus")
			.setStyle(TextInputStyle.Short)
			.setPlaceholder("Rate focus from 1 to 5")
			.setRequired(true);

		const lateInput = new CheckboxBuilder()
			.setCustomId("late")
			.setDefault(false);

		const commentsInput = new TextInputBuilder()
			.setCustomId("comments")
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder("Additional comments")
			.setRequired(false);

		const performanceLabel = new LabelBuilder()
			.setLabel("Performance (1-5)")
			.setTextInputComponent(performanceInput);

		const attitudeLabel = new LabelBuilder()
			.setLabel("Attitude (1-5)")
			.setTextInputComponent(attitudeInput);

		const focusLabel = new LabelBuilder()
			.setLabel("Focus (1-5)")
			.setTextInputComponent(focusInput);

		const lateLabel = new LabelBuilder()
			.setLabel("Was this trial late to raid?")
			.setCheckboxComponent(lateInput);

		const commentsLabel = new LabelBuilder()
			.setLabel("Comments")
			.setTextInputComponent(commentsInput);

		modal.addLabelComponents(
			performanceLabel,
			attitudeLabel,
			focusLabel,
			lateLabel,
			commentsLabel,
		);
		// needs components to work

		await interaction.showModal(modal);
	}
}
