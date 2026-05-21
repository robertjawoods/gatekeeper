import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	ApplicationCommandRegistries,
	Events as SapphireEvents,
	SapphireClient,
	container,
} from "@sapphire/framework";
import { GatewayIntentBits } from "discord.js";
import { prisma } from "./src/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.SKIP_SCHEDULER_BOOTSTRAP = "1";

const token = process.env.DISCORD_TOKEN;

if (!token) {
	console.error("DISCORD_TOKEN environment variable is not set.");
	process.exit(1);
}

const guildId = process.env.DISCORD_GUILD_ID;

if (!guildId) {
	console.error("DISCORD_GUILD_ID environment variable is not set.");
	process.exit(1);
}

const clientId = process.env.DISCORD_CLIENT_ID;

if (!clientId) {
	console.error("DISCORD_CLIENT_ID environment variable is not set.");
	process.exit(1);
}

ApplicationCommandRegistries.setDefaultGuildIds([guildId]);

const client = new SapphireClient({
	intents: [GatewayIntentBits.Guilds],
	id: clientId,
});

container.prisma = prisma;
client.stores.get("listeners").registerPath(path.join(__dirname, "src", "events"));

client.once(
	SapphireEvents.ApplicationCommandRegistriesRegistered,
	async (registries, timeTaken) => {
		console.log(
			`Successfully registered ${registries.size} command registries for guild ${guildId} in ${Math.round(timeTaken)}ms.`,
		);
		await client.destroy();
		await prisma.$disconnect();
		process.exit(0);
	},
);

client.once(SapphireEvents.ApplicationCommandRegistriesBulkOverwriteError, async (error) => {
	console.error("Bulk overwrite command registration failed:", error);
	await client.destroy();
	await prisma.$disconnect();
	process.exit(1);
});

await client.login(token).catch(async (error) => {
	console.error("Failed to login for command deployment:", error);
	await prisma.$disconnect();
	process.exit(1);
});
