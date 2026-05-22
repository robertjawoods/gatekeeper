import type { PrismaClient } from "./generated/prisma/client.js";

declare module "@sapphire/framework" {
	interface Container {
		prisma: PrismaClient;
	}

	interface Preconditions {
		OfficerOnly: never;
	}
}
