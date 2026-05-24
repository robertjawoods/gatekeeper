import { PrismaPg } from "@prisma/adapter-pg";
import { Client, GatewayIntentBits } from "discord.js";
import { type Prisma, PrismaClient } from "../src/generated/prisma/client.js";

const REQUIRED_CONFIRMATION = "BACKFILL_TRIAL_DISPLAY_NAMES";

type Options = {
	apply: boolean;
	confirmToken: string | null;
	batchSize: number;	
	maxBatches: number | null;
	guildId: string | null;
	sleepMs: number;
	overwrite: boolean;
	databaseUrl: string | null;
};

type TrialRow = {
	id: number;
	guildId: string;
	userId: string;
	startedById: string;
	userDisplayName: string | null;
	startedByDisplayName: string | null;
};

type ResolvedName = {
	value: string;
	username: string | null;
	hasNickname: boolean;
};

function parseNumberFlag(
	rawValue: string | undefined,
	flagName: string,
): number {
	if (!rawValue) {
		throw new Error(`${flagName} requires a value.`);
	}

	const parsed = Number(rawValue);
	if (!Number.isInteger(parsed)) {
		throw new Error(`${flagName} must be a whole number.`);
	}

	return parsed;
}

function parseOptions(argv: string[]): Options {
	const options: Options = {
		apply: false,
		confirmToken: null,
		batchSize: 100,
		maxBatches: null,
		guildId: null,
		sleepMs: 0,
		overwrite: false,
		databaseUrl: null,
	};

	for (const arg of argv) {
		if (arg === "--") {
			continue;
		}

		if (arg === "--apply") {
			options.apply = true;
			continue;
		}

		if (arg.startsWith("--confirm=")) {
			options.confirmToken = arg.slice("--confirm=".length);
			continue;
		}

		if (arg.startsWith("--batch-size=")) {
			options.batchSize = parseNumberFlag(
				arg.slice("--batch-size=".length),
				"--batch-size",
			);
			continue;
		}

		if (arg.startsWith("--max-batches=")) {
			const value = parseNumberFlag(
				arg.slice("--max-batches=".length),
				"--max-batches",
			);
			options.maxBatches = value <= 0 ? null : value;
			continue;
		}

		if (arg.startsWith("--guild-id=")) {
			const guildId = arg.slice("--guild-id=".length).trim();
			if (!guildId) {
				throw new Error("--guild-id cannot be empty.");
			}
			options.guildId = guildId;
			continue;
		}

		if (arg.startsWith("--sleep-ms=")) {
			const value = parseNumberFlag(
				arg.slice("--sleep-ms=".length),
				"--sleep-ms",
			);
			if (value < 0) {
				throw new Error("--sleep-ms must be zero or positive.");
			}
			options.sleepMs = value;
			continue;
		}

		if (arg === "--overwrite") {
			options.overwrite = true;
			continue;
		}

		if (arg.startsWith("--database-url=")) {
			const databaseUrl = arg.slice("--database-url=".length).trim();
			if (!databaseUrl) {
				throw new Error("--database-url cannot be empty.");
			}
			options.databaseUrl = databaseUrl;
			continue;
		}

		if (arg === "--help") {
			printUsage();
			process.exit(0);
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (options.batchSize < 1 || options.batchSize > 1000) {
		throw new Error("--batch-size must be between 1 and 1000.");
	}

	if (options.maxBatches !== null && options.maxBatches < 1) {
		throw new Error(
			"--max-batches must be at least 1, or omitted for unlimited.",
		);
	}

	if (options.apply && options.confirmToken !== REQUIRED_CONFIRMATION) {
		throw new Error(
			`--apply requires --confirm=${REQUIRED_CONFIRMATION} to protect production data.`,
		);
	}

	return options;
}

function printUsage(): void {
	console.log(
		[
			"Usage: pnpm run ops:backfill-trial-display-names -- [options]",
			"",
			"Options:",
			"  --apply                                Execute writes (default is dry-run).",
			`  --confirm=${REQUIRED_CONFIRMATION}    Required with --apply.`,
			"  --batch-size=<n>                       Rows per batch (default: 100, max: 1000).",
			"  --max-batches=<n>                      Stop after n batches (default: unlimited).",
			"  --guild-id=<id>                        Optional guild scope for controlled rollout.",
			"  --sleep-ms=<n>                         Delay between batches in ms (default: 0).",
			"  --overwrite                            Also refresh non-null snapshot values.",
			"  --database-url=<url>                   Override DATABASE_URL for this run.",
			"  --help                                 Show this help.",
			"",
			"Examples:",
			"  pnpm run ops:backfill-trial-display-names -- --guild-id=123 --max-batches=2",
			`  pnpm run ops:backfill-trial-display-names -- --apply --confirm=${REQUIRED_CONFIRMATION}`,
			"  pnpm run ops:backfill-trial-display-names -- --database-url=postgresql://... --guild-id=123",
		].join("\n"),
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveDisplayName(
	client: Client,
	cache: Map<string, ResolvedName>,
	guildId: string,
	userId: string,
	fallbackName: string,
): Promise<ResolvedName> {
	const cacheKey = `${guildId}:${userId}`;
	const cached = cache.get(cacheKey);
	if (cached) {
		return cached;
	}

	try {
		const guild = await client.guilds.fetch({ guild: guildId, force: true });
		const member = await guild.members.fetch({ user: userId, force: true });
		const nickname = member.nickname?.trim() ?? "";
		const username = member.user.globalName ?? member.user.username;
		const resolved: ResolvedName = {
			value: nickname.length > 0 ? nickname : username,
			username,
			hasNickname: nickname.length > 0,
		};
		cache.set(cacheKey, resolved);
		return resolved;
	} catch {
		try {
			const user = await client.users.fetch(userId);
			const username = user.globalName ?? user.username;
			const resolved: ResolvedName = {
				value: username,
				username,
				hasNickname: false,
			};
			cache.set(cacheKey, resolved);
			return resolved;
		} catch {
			const resolved: ResolvedName = {
				value: fallbackName,
				username: null,
				hasNickname: false,
			};
			cache.set(cacheKey, resolved);
			return resolved;
		}
	}
}

function snapshotNeedsBackfill(
	snapshotValue: string | null,
	idValue: string,
	resolved: ResolvedName,
	overwrite: boolean,
): boolean {
	if (overwrite) {
		return true;
	}

	if (snapshotValue === null || snapshotValue === idValue) {
		return true;
	}

	return (
		resolved.hasNickname &&
		resolved.username !== null &&
		snapshotValue === resolved.username &&
		snapshotValue !== resolved.value
	);
}

function shouldIncludeTrial(row: TrialRow, overwrite: boolean): boolean {
	if (overwrite) {
		return true;
	}

	return (
		row.userDisplayName === null ||
		row.startedByDisplayName === null ||
		row.userDisplayName === row.userId ||
		row.startedByDisplayName === row.startedById
	);
}

async function run(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const token = process.env.DISCORD_TOKEN;
	const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;

	if (!token) {
		throw new Error("DISCORD_TOKEN environment variable is required.");
	}

	if (!databaseUrl) {
		throw new Error(
			"DATABASE_URL is required. Set DATABASE_URL or pass --database-url=<url>.",
		);
	}

	const adapter = new PrismaPg({ connectionString: databaseUrl });
	const prisma = new PrismaClient({ adapter });

	const where = {
		...(options.guildId ? { guildId: options.guildId } : {}),
		...(!options.overwrite
			? {
					OR: [
						{ userDisplayName: null as null },
						{ startedByDisplayName: null as null },
						{
							userDisplayName: {
								equals: prisma.trial.fields.userId,
							},
						},
						{
							startedByDisplayName: {
								equals: prisma.trial.fields.startedById,
							},
						},
					],
				}
			: {}),
	};

	const totalCandidates = await prisma.trial.count({ where });
	const mode = options.apply ? "apply" : "dry-run";

	console.log(`Starting trial display name backfill in ${mode} mode.`);
	console.log(`Candidate rows: ${totalCandidates}`);
	console.log(`Batch size: ${options.batchSize}`);
	console.log(`Guild scope: ${options.guildId ?? "all guilds"}`);
	console.log(`Max batches: ${options.maxBatches ?? "unlimited"}`);
	console.log(`Overwrite mode: ${options.overwrite ? "enabled" : "disabled"}`);

	if (totalCandidates === 0) {
		console.log("No rows need backfill.");
		return;
	}

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });
	await client.login(token);

	const nameCache = new Map<string, ResolvedName>();
	let processedRows = 0;
	let updatedRows = 0;
	let batches = 0;
	let cursor: number | null = null;

	try {
		while (options.maxBatches === null || batches < options.maxBatches) {
			const rows: TrialRow[] = await prisma.trial.findMany({
				where,
				select: {
					id: true,
					guildId: true,
					userId: true,
					startedById: true,
					userDisplayName: true,
					startedByDisplayName: true,
				},
				orderBy: {
					id: "asc",
				},
				take: options.batchSize,
				...(cursor !== null ? { skip: 1, cursor: { id: cursor } } : {}),
			});

			if (rows.length === 0) {
				break;
			}

			batches += 1;
			processedRows += rows.length;
			cursor = rows[rows.length - 1]?.id ?? null;

			const operations: Array<Prisma.PrismaPromise<{ count: number }>> = [];
			let plannedUpdates = 0;

			for (const row of rows) {
				if (!shouldIncludeTrial(row, options.overwrite)) {
					continue;
				}

				const resolvedUserDisplayName = await resolveDisplayName(
					client,
					nameCache,
					row.guildId,
					row.userId,
					row.userDisplayName ?? row.userId,
				);

				const resolvedStartedByDisplayName = await resolveDisplayName(
					client,
					nameCache,
					row.guildId,
					row.startedById,
					row.startedByDisplayName ?? row.startedById,
				);

				const nextUserDisplayName = snapshotNeedsBackfill(
					row.userDisplayName,
					row.userId,
					resolvedUserDisplayName,
					options.overwrite,
				)
					? resolvedUserDisplayName.value
					: row.userDisplayName;
				const nextStartedByDisplayName = snapshotNeedsBackfill(
					row.startedByDisplayName,
					row.startedById,
					resolvedStartedByDisplayName,
					options.overwrite,
				)
					? resolvedStartedByDisplayName.value
					: row.startedByDisplayName;

				const changed =
					nextUserDisplayName !== row.userDisplayName ||
					nextStartedByDisplayName !== row.startedByDisplayName;

				if (!changed) {
					continue;
				}

				plannedUpdates += 1;

				if (!options.apply) {
					continue;
				}

				operations.push(
					prisma.trial.updateMany({
						where: {
							id: row.id,
						},
						data: {
							userDisplayName: nextUserDisplayName,
							startedByDisplayName: nextStartedByDisplayName,
						},
					}),
				);
			}

			if (!options.apply) {
				console.log(
					`[dry-run] Batch ${batches}: scanned ${rows.length} row(s), would update ${plannedUpdates} row(s).`,
				);
			} else if (operations.length === 0) {
				console.log(
					`[apply] Batch ${batches}: scanned ${rows.length} row(s), updated 0 row(s).`,
				);
			} else {
				const results = await prisma.$transaction(operations);
				const batchUpdated = results.reduce(
					(sum, result) => sum + result.count,
					0,
				);
				updatedRows += batchUpdated;

				console.log(
					`[apply] Batch ${batches}: scanned ${rows.length} row(s), updated ${batchUpdated} row(s).`,
				);
			}

			if (options.sleepMs > 0) {
				await sleep(options.sleepMs);
			}
		}
	} finally {
		await client.destroy();
		await prisma.$disconnect();
	}

	console.log("Backfill run complete.");
	console.log(`Batches processed: ${batches}`);
	console.log(`Rows scanned: ${processedRows}`);
	console.log(`Rows updated: ${updatedRows}`);

	if (!options.apply) {
		console.log("Dry-run mode made no data changes.");
	}
}

async function main(): Promise<void> {
	try {
		await run();
	} catch (error) {
		console.error("Backfill failed:", error);
		process.exitCode = 1;
	}
}

await main();
