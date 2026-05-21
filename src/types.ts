import type { SapphireClient } from "@sapphire/framework";
import type { PrismaClient } from "./generated/prisma/client.js";

export interface AppContext {
	prisma: PrismaClient;
	client: SapphireClient;
}
