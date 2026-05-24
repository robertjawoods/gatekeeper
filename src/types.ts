import type { SapphireClient } from "@sapphire/framework";
import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export interface AppContext {
	prisma: PrismaClient;
	client: SapphireClient;
}

export type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;
