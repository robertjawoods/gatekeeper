import {
	type ChatInputCommandDeniedPayload,
	Listener,
	Events as SapphireEvents,
	type UserError,
} from "@sapphire/framework";
import { logger } from "../services/logger.js";

export class ChatInputCommandDeniedListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: SapphireEvents.ChatInputCommandDenied,
			once: false,
		});
	}

	public override run(
		error: UserError,
		payload: ChatInputCommandDeniedPayload,
	): void {
		logger.warn(
			{
				reason: error.message,
				command: payload.command.name,
				guildId: payload.interaction.guildId,
				userId: payload.interaction.user.id,
				context: payload.context,
			},
			"Chat input command denied.",
		);
	}
}
