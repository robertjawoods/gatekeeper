import { Listener } from "@sapphire/framework";
import { ActivityType, type Client, type PresenceStatusData } from "discord.js";
import { logger } from "../services/logger.js";
import { startRaidReminderScheduler } from "../services/raidReminderScheduler.js";

function _resolveActivityType(rawType: string | undefined): ActivityType {
	const normalized = rawType?.trim().toLowerCase();

	switch (normalized) {
		case "playing":
			return ActivityType.Playing;
		case "listening":
			return ActivityType.Listening;
		case "competing":
			return ActivityType.Competing;
		default:
			return ActivityType.Watching;
	}
}

function _resolvePresenceStatus(
	rawStatus: string | undefined,
): PresenceStatusData {
	const normalized = rawStatus?.trim().toLowerCase();

	switch (normalized) {
		case "idle":
		case "dnd":
		case "invisible":
			return normalized;
		default:
			return "online";
	}
}

export class ClientReadyListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, {
			event: "ready",
			once: true,
		});
	}

	public override async run(client: Client<true>) {
		logger.info({ tag: client.user?.tag }, `Logged in as ${client.user?.tag}`);

		const presenceText = "Strength Opens the Way.";
		if (presenceText && client.user) {
			client.user.setPresence({
				activities: [
					{
						name: presenceText,
						type: ActivityType.Watching,
					},
				],
				status: "online",
			});

			logger.info(
				{
					presenceText,
					activityType: ActivityType.Watching,
					status: "online",
				},
				"Configured bot presence",
			);
		}

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
