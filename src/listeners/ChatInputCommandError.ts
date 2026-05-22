import {
	type ChatInputCommandErrorPayload,
	Listener,
	Events as SapphireEvents,
	UserError,
} from "@sapphire/framework";
import { logger } from "../services/logger.js";

const GENERIC_ERROR_MESSAGE =
	"Something went wrong while handling that command. Please try again.";

async function replyEphemeralFallback(
	interaction: ChatInputCommandErrorPayload["interaction"],
	content: string,
) {
	try {
		if (interaction.deferred) {
			await interaction.editReply({ content });
			return;
		}

		if (interaction.replied) {
			await interaction.followUp({
				content,
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.reply({
			content,
			flags: ["Ephemeral"],
		});
	} catch (replyError) {
		if (
			typeof replyError === "object" &&
			replyError !== null &&
			"code" in replyError &&
			(replyError as { code?: unknown }).code === 40060
		) {
			return;
		}

		logger.error(
			{ err: replyError },
			"Failed to send fallback interaction reply.",
		);
	}
}

export class ChatInputCommandErrorListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: SapphireEvents.ChatInputCommandError,
			once: false,
		});
	}

	public override async run(
		error: unknown,
		payload: ChatInputCommandErrorPayload,
	): Promise<void> {
		if (error instanceof UserError) {
			logger.warn(
				{
					reason: error.message,
					command: payload.command.name,
					interactionId: payload.interaction.id,
					guildId: payload.interaction.guildId,
					userId: payload.interaction.user.id,
				},
				"Chat input command returned a user-facing error.",
			);
			return;
		}

		logger.error(
			{
				err: error,
				command: payload.command.name,
				interactionId: payload.interaction.id,
				guildId: payload.interaction.guildId,
				userId: payload.interaction.user.id,
			},
			"Chat input command failed.",
		);

		await replyEphemeralFallback(payload.interaction, GENERIC_ERROR_MESSAGE);
	}
}
