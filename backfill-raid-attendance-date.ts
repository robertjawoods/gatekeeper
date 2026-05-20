import { prisma } from "./src/prisma.js";

const REQUIRED_CONFIRMATION = "BACKFILL_RAID_ATTENDANCE_DATE";

type Options = {
	apply: boolean;
	confirmToken: string | null;
	batchSize: number;
	maxBatches: number | null;
	guildId: string | null;
	sleepMs: number;
	showRows: boolean;
	activeOnly: boolean;
};

function toLocalDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

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
		batchSize: 250,
		maxBatches: null,
		guildId: null,
		sleepMs: 0,
		showRows: false,
		activeOnly: false,
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

		if (arg === "--show-rows") {
			options.showRows = true;
			continue;
		}

		if (arg === "--active-only") {
			options.activeOnly = true;
			continue;
		}

		if (arg === "--help") {
			printUsage();
			process.exit(0);
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (options.batchSize < 1 || options.batchSize > 5000) {
		throw new Error("--batch-size must be between 1 and 5000.");
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
			"Usage: pnpm run ops:backfill-raid-attendance-date -- [options]",
			"",
			"Options:",
			"  --apply                                Execute writes (default is dry-run).",
			`  --confirm=${REQUIRED_CONFIRMATION}    Required with --apply.`,
			"  --batch-size=<n>                       Rows per batch (default: 250, max: 5000).",
			"  --max-batches=<n>                      Stop after n batches (default: unlimited).",
			"  --guild-id=<id>                        Optional guild scope for controlled rollout.",
			"  --sleep-ms=<n>                         Delay between batches in ms (default: 0).",
			"  --show-rows                           Display rows that would be affected and exit.",
			"  --active-only                         Limit backfill to active trials.",
			"  --help                                 Show this help.",
			"",
			"Examples:",
			"  pnpm run ops:backfill-raid-attendance-date -- --guild-id=123 --max-batches=2",
			`  pnpm run ops:backfill-raid-attendance-date -- --apply --confirm=${REQUIRED_CONFIRMATION} --batch-size=200`,
		].join("\n"),
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));

	const where = {
		raidAttendanceDate: null as null,
		...(options.guildId ? { guildId: options.guildId } : {}),
		...(options.activeOnly ? { trial: { active: true } } : {}),
	};

	const totalMissing = await prisma.feedback.count({ where });
	const mode = options.apply ? "apply" : "dry-run";

	console.log(`Starting raid attendance backfill in ${mode} mode.`);
	console.log(`Missing rows: ${totalMissing}`);
	console.log(`Batch size: ${options.batchSize}`);
	console.log(`Guild scope: ${options.guildId ?? "all guilds"}`);
	console.log(`Max batches: ${options.maxBatches ?? "unlimited"}`);

	if (totalMissing === 0) {
		console.log("No rows need backfill.");
		return;
	}

	let processedRows = 0;
	let updatedRows = 0;
	let batches = 0;

	while (options.maxBatches === null || batches < options.maxBatches) {
		const rows = await prisma.feedback.findMany({
			where,
			select: {
				id: true,
				createdAt: true,
			},
			orderBy: {
				id: "asc",
			},
			take: options.batchSize,
		});

		if (rows.length === 0) {
			break;
		}

		batches += 1;
		processedRows += rows.length;

		if (!options.apply) {
			const firstId = rows[0]?.id;
			const lastId = rows[rows.length - 1]?.id;
			console.log(
				`[dry-run] Batch ${batches}: would backfill ${rows.length} row(s) (id range ${firstId}-${lastId}).`,
			);
		} else {
			const updates = rows.map((row) =>
				prisma.feedback.updateMany({
					where: {
						id: row.id,
						raidAttendanceDate: null,
					},
					data: {
						raidAttendanceDate: toLocalDateKey(row.createdAt),
					},
				}),
			);

			const results = await prisma.$transaction(updates);
			const batchUpdated = results.reduce(
				(sum, result) => sum + result.count,
				0,
			);
			updatedRows += batchUpdated;

			console.log(
				`[apply] Batch ${batches}: processed ${rows.length} row(s), updated ${batchUpdated} row(s).`,
			);
		}

		if (options.sleepMs > 0) {
			await sleep(options.sleepMs);
		}
	}

	console.log("Backfill run complete.");
	console.log(`Batches processed: ${batches}`);
	console.log(`Rows seen: ${processedRows}`);
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
	} finally {
		await prisma.$disconnect();
	}
}

await main();
