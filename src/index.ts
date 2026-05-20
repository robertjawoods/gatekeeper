import { GatewayIntentBits } from "discord.js";
import { DiscordClient } from "./DiscordClient.js";
import { prisma } from "./prisma.js";
import { logger } from "./services/logger.js";

logger.info({ env: process.env.NODE_ENV ?? "development" }, "Starting bot...");

const client: DiscordClient = new DiscordClient(
	{ intents: [GatewayIntentBits.Guilds] },
	prisma,
);

await client.loadCommands();
await client.loadEvents();

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
