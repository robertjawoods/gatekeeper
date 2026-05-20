import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
	console.error("DISCORD_TOKEN environment variable is not set.");
	process.exit(1);
}

if (!clientId) {
	console.error("DISCORD_CLIENT_ID environment variable is not set.");
	process.exit(1);
}

const rest = new REST().setToken(token);

try {
	const existing = (await rest.get(
		Routes.applicationCommands(clientId),
	)) as Array<unknown>;

	console.log(`Found ${existing.length} global command(s). Clearing...`);

	await rest.put(Routes.applicationCommands(clientId), { body: [] });

	console.log("Global commands cleared successfully.");
} catch (error) {
	console.error("Failed to clear global commands:", error);
	process.exit(1);
}
