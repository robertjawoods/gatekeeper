import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.argv[2] ?? process.env.DISCORD_GUILD_ID;

if (!token) {
	console.error("DISCORD_TOKEN environment variable is not set.");
	process.exit(1);
}

if (!clientId) {
	console.error("DISCORD_CLIENT_ID environment variable is not set.");
	process.exit(1);
}

if (!guildId) {
	console.error(
		"Guild id is required. Pass it as the first argument or set DISCORD_GUILD_ID.",
	);
	process.exit(1);
}

const rest = new REST().setToken(token);

try {
	const me = (await rest.get(Routes.user())) as { id?: string; username?: string };
	if (!me.id) {
		console.error("Failed to resolve bot user from DISCORD_TOKEN.");
		process.exit(1);
	}

	if (me.id !== clientId) {
		console.error(
			[
				"DISCORD_TOKEN and DISCORD_CLIENT_ID do not belong to the same application.",
				`Token bot user id: ${me.id} (${me.username ?? "unknown"})`,
				`DISCORD_CLIENT_ID: ${clientId}`,
			].join("\n"),
		);
		process.exit(1);
	}

	const existing = (await rest.get(
		Routes.applicationGuildCommands(clientId, guildId),
	)) as Array<unknown>;

	console.log(`Found ${existing.length} guild command(s) in ${guildId}. Clearing...`);

	await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
		body: [],
	});

	console.log(`Guild commands cleared successfully for ${guildId}.`);
} catch (error) {
	console.error(
		`Failed to clear commands for guild ${guildId}. Ensure the bot is in that guild and the token belongs to this application:`,
		error,
	);
	process.exit(1);
}