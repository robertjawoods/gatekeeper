import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, type ClientOptions } from "discord.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { logger } from "./services/logger.js";
import type { AppContext, Command, Event } from "./types.js";

export class DiscordClient extends Client {
	commands: Map<string, Command>;
	private context: AppContext;

	constructor(options: ClientOptions, prisma: PrismaClient) {
		super(options);
		this.commands = new Map<string, Command>();
		this.context = {
			prisma,
			client: this,
			getCommand: (name: string) => this.commands.get(name),
		};
	}

	async loadCommands() {
		const commandsPath = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"commands",
		);
		const commandFiles = await fs.promises.readdir(commandsPath);
		const filteredFiles = commandFiles.filter(
			(file) => file.endsWith(".ts") || file.endsWith(".js"),
		);

		for (const file of filteredFiles) {
			const filePath = path.join(commandsPath, file);
			try {
				const commandModule = await import(pathToFileURL(filePath).href);
				const command: Command = commandModule.default ?? commandModule;

				if (command.data?.name && typeof command.execute === "function") {
					this.commands.set(command.data.name, command);
					logger.info(
						{ command: command.data.name },
						`Loaded command: ${command.data.name}`,
					);
				} else {
					logger.warn({ file }, `Skipping invalid command file: ${file}`);
				}
			} catch (error) {
				logger.error({ file, err: error }, `Error loading command ${file}`);
			}
		}
	}

	async loadEvents() {
		const eventsPath = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"events",
		);
		const eventFiles = await fs.promises.readdir(eventsPath);
		const filteredFiles = eventFiles.filter(
			(file) => file.endsWith(".ts") || file.endsWith(".js"),
		);

		for (const file of filteredFiles) {
			const filePath = path.join(eventsPath, file);
			try {
				const eventModule = await import(pathToFileURL(filePath).href);
				const event: Event = eventModule.default ?? eventModule;

				if (event.name && typeof event.execute === "function") {
					if (event.once) {
						this.once(event.name, (...args) =>
							event.execute(args[0], this.context),
						);
					} else {
						this.on(event.name, (...args) =>
							event.execute(args[0], this.context),
						);
					}
					logger.info({ event: event.name }, `Loaded event: ${event.name}`);
				} else {
					logger.warn({ file }, `Skipping invalid event file: ${file}`);
				}
			} catch (error) {
				logger.error({ file, err: error }, `Error loading event ${file}`);
			}
		}
	}

	getContext(): AppContext {
		return this.context;
	}
}
