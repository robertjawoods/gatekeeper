import {
	type ContextMenuCommandDeniedPayload,
	Listener,
	Events as SapphireEvents,
	type UserError,
} from "@sapphire/framework";
import { logger } from "../services/logger.js";

export class ContextMenuCommandDeniedListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: SapphireEvents.ContextMenuCommandDenied,
			once: false,
		});
	}

	public override run(
		error: UserError,
		payload: ContextMenuCommandDeniedPayload,
	): void {
		logger.warn(
			{
				reason: error.message,
				command: payload.command.name,
				guildId: payload.interaction.guildId,
				userId: payload.interaction.user.id,
				context: payload.context,
			},
			"Context menu command denied.",
		);
	}
}
