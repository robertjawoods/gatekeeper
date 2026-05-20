import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
import {
	GuildSettingsMissingError,
	getGuildSettings,
	sendOfficerChannelMessage,
} from "../services/guildSettings.js";
import { createGuildLogger } from "../services/logger.js";
import type { AppContext } from "../types.js";

export default {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Replies with Pong!"),
	async execute(interaction: ChatInputCommandInteraction, context: AppContext) {
		const guildId = interaction.guildId;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: ["Ephemeral"],
			});
			return;
		}

		let settings: Awaited<ReturnType<typeof getGuildSettings>>;

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

			createGuildLogger(guildId).error(
				{ err: error },
				"Error retrieving guild settings.",
			);
			await interaction.reply({
				content:
					"An error occurred while retrieving server settings. Please try again later.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const sendResult = await sendOfficerChannelMessage(
			context.client,
			settings.officerChannelId,
			"Pong!",
		);

		if (!sendResult.delivered) {
			createGuildLogger(guildId).warn(
				{ reason: sendResult.reason },
				"Ping: failed to deliver to officer channel.",
			);
			await interaction.reply({
				content:
					"I could not send the ping response to the officer channel. Please check channel settings and permissions.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.reply({
			content: "Posted ping response in the officer channel.",
			flags: ["Ephemeral"],
		});
	},
};
