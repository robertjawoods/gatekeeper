// lists trials, takes active as a optional argument to filter by active/inactive trials, defaults to active trials only

import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
import {
	buildTrialListEmbeds,
	type TrialListItem,
} from "../services/embedBuilders.js";
import {
	GuildSettingsMissingError,
	getGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "../services/guildSettings.js";
import { createGuildLogger } from "../services/logger.js";
import { listTrials } from "../services/trialService.js";
import type { AppContext } from "../types.js";

/*
The list command should retrieve trial entries from the database and display them in a user-friendly format. 
It should support an optional argument to filter by active or inactive trials, defaulting to active trials only. 
The displayed information should include the user on trial, the start time, the status of the trial, and any other relevant details.
*/

export default {
	data: new SlashCommandBuilder()
		.setName("list")
		.setDescription("Lists all trials")
		.addBooleanOption((option) =>
			option
				.setName("active")
				.setDescription("Whether to list only active trials")
				.setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
		const activeOnly = interaction.options.getBoolean("active") ?? true;
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		let settings: Awaited<ReturnType<typeof getGuildSettings>>;
		const log = createGuildLogger(guildId);

		try {
			settings = await getGuildSettings(context.prisma, guildId);
		} catch (error) {
			if (error instanceof GuildSettingsMissingError) {
				await interaction.reply({
					content:
						"Server settings have not been configured yet. Run `/settings` first.",
					flags: ["Ephemeral"],
				});
				return;
			}

			log.error({ err: error }, "Error retrieving guild settings.");
			await interaction.reply({
				content:
					"An error occurred while retrieving server settings. Please try again later.",
				flags: ["Ephemeral"],
			});
			return;
		}

		try {
			const trials = await listTrials(context.prisma, guildId, activeOnly);
			if (trials.length === 0) {
				log.info({ activeOnly }, "No trials found for listing.");
			} else {
				log.info({ activeOnly, count: trials.length }, "Listing trials.");
			}
			const logoUrl = context.client.user?.displayAvatarURL({
				extension: "png",
				size: 256,
			});
			const items: TrialListItem[] = await Promise.all(
				trials.map(async (trial) => {
					const status = trial.active
						? "Active"
						: trial.passed
							? "Passed"
							: "Failed";
					const displayName =
						trial.userDisplayName ??
						(await resolveGuildDisplayName(
							context.client,
							guildId,
							trial.userId,
							trial.userId,
						));
					return {
						displayName,
						status,
						startTime: trial.startTime,
					};
				}),
			);

			const embeds = buildTrialListEmbeds(items, activeOnly, logoUrl).map(
				(embed) => embed.toJSON(),
			);

			const sendResult = await sendOfficerChannelMessage(
				context.client,
				settings.officerChannelId,
				{ embeds },
			);

			if (!sendResult.delivered) {
				await interaction.reply({
					content:
						"I could not send the trial list to the officer channel. Please check channel settings and permissions.",
					flags: ["Ephemeral"],
				});
				return;
			}

			await interaction.reply({
				content: "Posted the trial list in the officer channel.",
				flags: ["Ephemeral"],
			});
		} catch (error) {
			log.error({ err: error }, "Error retrieving trials.");
			await interaction.reply({
				content:
					"An error occurred while retrieving trials. Please try again later.",
				flags: ["Ephemeral"],
			});
		}
	},
};
