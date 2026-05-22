import {
	ApplicationCommandRegistries,
	container,
	LogLevel,
	RegisterBehavior,
	SapphireClient,
} from "@sapphire/framework";
import { GatewayIntentBits } from "discord.js";
import { prisma } from "./prisma.js";
import { logger } from "./services/logger.js";

logger.info({ env: process.env.NODE_ENV ?? "development" }, "Starting bot...");

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
	RegisterBehavior.Overwrite,
);

if (process.env.DISCORD_GUILD_ID) {
	ApplicationCommandRegistries.setDefaultGuildIds([
		process.env.DISCORD_GUILD_ID,
	]);
}

const client = new SapphireClient({
	intents: [GatewayIntentBits.Guilds],
	logger: {
		level:
			LogLevel[process.env.LOG_LEVEL?.toUpperCase() as keyof typeof LogLevel] ??
			LogLevel.Info,
	},
});

container.prisma = prisma;

const token = process.env.DISCORD_TOKEN;

if (!token) {
	logger.error("DISCORD_TOKEN environment variable is not set.");
	process.exit(1);
}

await client.login(token).catch((error) => {
	logger.error({ err: error }, "Failed to login to Discord.");
	prisma.$disconnect();
	process.exit(1);
});

logger.info("Bot logged in and listening for interactions.");

// Graceful shutdown: disconnect Prisma only on process exit
process.on("SIGINT", async () => {
	logger.info("SIGINT received, shutting down gracefully.");
	await client.destroy();
	await prisma.$disconnect();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	logger.info("SIGTERM received, shutting down gracefully.");
	await client.destroy();
	await prisma.$disconnect();
	process.exit(0);
});

process.on("exit", async () => {
	await prisma.$disconnect();
});
