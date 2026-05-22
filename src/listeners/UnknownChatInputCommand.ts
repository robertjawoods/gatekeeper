import {
	Events as SapphireEvents,
	Listener,
	type UnknownChatInputCommandPayload,
} from "@sapphire/framework";
import { logger } from "../services/logger.js";

const UNKNOWN_COMMAND_MESSAGE =
	"That command is currently unavailable. Please redeploy commands and try again.";

export class UnknownChatInputCommandListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: SapphireEvents.UnknownChatInputCommand,
			once: false,
		});
	}

	public override async run(payload: UnknownChatInputCommandPayload): Promise<void> {
		logger.warn(
			{
				interactionId: payload.interaction.id,
				commandName: payload.interaction.commandName,
				guildId: payload.interaction.guildId,
				userId: payload.interaction.user.id,
			},
			"Unknown chat input command received.",
		);

		try {
			if (!payload.interaction.replied && !payload.interaction.deferred) {
				await payload.interaction.reply({
					content: UNKNOWN_COMMAND_MESSAGE,
					flags: ["Ephemeral"],
				});
			}
		} catch (error) {
			logger.error({ err: error }, "Failed to reply for unknown chat input command.");
		}
	}
}
