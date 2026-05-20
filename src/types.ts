import type { ChatInputCommandInteraction, Interaction } from "discord.js";
import type { DiscordClient } from "./DiscordClient.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export interface AppContext {
	prisma: PrismaClient;
	client: DiscordClient;
	getCommand: (name: string) => Command | undefined;
}

export interface Command {
	data: {
		name: string;
		[key: string]: unknown;
	};
	execute(
		interaction: ChatInputCommandInteraction,
		context: AppContext,
	): Promise<void>;
}

export interface Event {
	name: string;
	once?: boolean;
	execute(interaction: Interaction, context: AppContext): Promise<void>;
}
