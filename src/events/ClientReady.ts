import type { Client } from "discord.js";
import { Listener } from "@sapphire/framework";
import { logger } from "../services/logger.js";
import { startRaidReminderScheduler } from "../services/raidReminderScheduler.js";

export class ClientReadyListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: "ready",
			once: true,
		});
	}

	public override async run(client: Client<true>) {
		logger.info({ tag: client.user?.tag }, `Logged in as ${client.user?.tag}`);

		if (process.env.SKIP_SCHEDULER_BOOTSTRAP === "1") {
			logger.info("Skipping raid reminder scheduler bootstrap for this run.");
			return;
		}

		try {
			await startRaidReminderScheduler({
				prisma: this.container.prisma,
				client: this.container.client,
			});
		} catch (error) {
			logger.error(
				{ err: error },
				"Failed to initialize raid reminder scheduler.",
			);
		}
	}
}
