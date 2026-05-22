import {
	Listener,
	Events as SapphireEvents,
	type UnknownContextMenuCommandPayload,
} from "@sapphire/framework";
import { logger } from "../services/logger.js";

const UNKNOWN_COMMAND_MESSAGE =
	"That context action is currently unavailable. Please redeploy commands and try again.";

export class UnknownContextMenuCommandListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: SapphireEvents.UnknownContextMenuCommand,
			once: false,
		});
	}

	public override async run(
		payload: UnknownContextMenuCommandPayload,
	): Promise<void> {
		logger.warn(
			{
				interactionId: payload.interaction.id,
				commandName: payload.interaction.commandName,
				guildId: payload.interaction.guildId,
				userId: payload.interaction.user.id,
			},
			"Unknown context menu command received.",
		);

		try {
			if (!payload.interaction.replied && !payload.interaction.deferred) {
				await payload.interaction.reply({
					content: UNKNOWN_COMMAND_MESSAGE,
					flags: ["Ephemeral"],
				});
			}
		} catch (error) {
			logger.error(
				{ err: error },
				"Failed to reply for unknown context menu command.",
			);
		}
	}
}
