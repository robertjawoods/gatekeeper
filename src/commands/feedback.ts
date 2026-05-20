import {
	type ChatInputCommandInteraction,
	CheckboxBuilder,
	LabelBuilder,
	ModalBuilder,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { buildFeedbackModalCustomId } from "../services/feedbackService.js";
import { resolveGuildDisplayName } from "../services/guildSettings.js";
import { createGuildLogger } from "../services/logger.js";
import { findActiveTrial } from "../services/trialService.js";
import type { AppContext } from "../types.js";

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

export default {
	data: new SlashCommandBuilder()
		.setName("feedback")
		.setDescription(
			"Provides a feedback form for users to submit their feedback.",
		)
		.addUserOption((option) =>
			option
				.setName("target")
				.setDescription("The user to provide feedback for")
				.setRequired(true),
		),
	async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
		const target = interaction.options.getUser("target");

		if (!interaction.guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		if (!target) {
			await interaction.reply({
				content: "Target user is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const activeTrial = await findActiveTrial(
			context.prisma,
			interaction.guildId,
			target.id,
		);
		if (!activeTrial) {
			createGuildLogger(interaction.guildId).info(
				{ targetId: target.id },
				"Feedback rejected: no active trial found.",
			);
			await interaction.reply({
				content: `No active trial found for ${target.tag}.`,
				flags: ["Ephemeral"],
			});
			return;
		}

		createGuildLogger(interaction.guildId).info(
			{
				targetId: target.id,
				trialId: activeTrial.id,
				officerId: interaction.user.id,
			},
			"Feedback modal opened.",
		);

		const displayName =
			activeTrial.userDisplayName ??
			(await resolveGuildDisplayName(
				context.client,
				interaction.guildId,
				target.id,
				target.displayName,
			));
		const modal = new ModalBuilder()
			.setCustomId(buildFeedbackModalCustomId(activeTrial.id, target.id))
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
	},
};
