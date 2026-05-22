// lists trials, takes active as a optional argument to filter by active/inactive trials, defaults to active trials only

import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
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

/*
The list command should retrieve trial entries from the database and display them in a user-friendly format. 
It should support an optional argument to filter by active or inactive trials, defaulting to active trials only. 
The displayed information should include the user on trial, the start time, the status of the trial, and any other relevant details.
*/

export class ListCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "list",
			description: "Lists all trials",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addBooleanOption((option) =>
					option
						.setName("active")
						.setDescription("Whether to list only active trials")
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const activeOnly = interaction.options.getBoolean("active") ?? true;
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.deferReply({ flags: ["Ephemeral"] });

		let settings: Awaited<ReturnType<typeof getGuildSettings>>;
		const log = createGuildLogger(guildId);

		try {
			settings = await getGuildSettings(this.container.prisma, guildId);
		} catch (error) {
			if (error instanceof GuildSettingsMissingError) {
				await interaction.editReply({
					content:
						"Server settings have not been configured yet. Run `/settings` first.",
				});
				return;
			}

			log.error({ err: error }, "Error retrieving guild settings.");
			await interaction.editReply({
				content:
					"An error occurred while retrieving server settings. Please try again later.",
			});
			return;
		}

		try {
			const trials = await listTrials(
				this.container.prisma,
				guildId,
				activeOnly,
			);
			if (trials.length === 0) {
				log.info({ activeOnly }, "No trials found for listing.");
			} else {
				log.info({ activeOnly, count: trials.length }, "Listing trials.");
			}
			const logoUrl = this.container.client.user?.displayAvatarURL({
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
							this.container.client,
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
				this.container.client,
				settings.officerChannelId,
				{ embeds },
			);

			if (!sendResult.delivered) {
				await interaction.editReply({
					content:
						"I could not send the trial list to the officer channel. Please check channel settings and permissions.",
				});
				return;
			}

			await interaction.editReply({
				content: "Posted the trial list in the officer channel.",
			});
		} catch (error) {
			log.error({ err: error }, "Error retrieving trials.");
			await interaction.editReply({
				content:
					"An error occurred while retrieving trials. Please try again later.",
			});
		}
	}
}
