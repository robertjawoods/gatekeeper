import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REST, Routes } from "discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const commandsPath = path.join(__dirname, "src", "commands");
const commandFiles = (await fs.readdir(commandsPath)).filter(
	(file) => file.endsWith(".ts") || file.endsWith(".js"),
);

const commands = [];

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const commandModule = await import(pathToFileURL(filePath).href);

	const command = commandModule.default ?? commandModule;
	if ("data" in command && "execute" in command) {
		commands.push(command.data.toJSON());
	} else {
		console.warn(
			`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
		);
	}
}

const rest = new REST().setToken(token);

try {
	console.log(
		`Started refreshing ${commands.length} guild application (/) commands for guild ${guildId}.`,
	);
	const data = (await rest.put(
		Routes.applicationGuildCommands(clientId, guildId),
		{ body: commands },
	)) as Array<unknown>;
	console.log(
		`Successfully reloaded ${data.length} guild application (/) commands.`,
	);
} catch (error) {
	console.error(error);
}
