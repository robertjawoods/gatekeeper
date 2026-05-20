import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
	{
		level: process.env.LOG_LEVEL ?? "info",
	},
	isDev
		? pino.transport({
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "SYS:HH:MM:ss",
					ignore: "pid,hostname",
				},
			})
		: undefined,
);

/**
 * Creates a child logger bound to a specific guild.
 * All logs emitted from the returned logger will include `guildId`.
 */
export function createGuildLogger(guildId: string) {
	return logger.child({ guildId });
}

/**
 * Logs an auditable user action. Always at info level.
 *
 * @param guildId - Guild where the action occurred
 * @param action  - Machine-readable action name, e.g. "trial.started"
 * @param actorId - Discord user ID who triggered the action
 * @param details - Any additional structured context
 */
export function audit(
	guildId: string,
	action: string,
	actorId: string,
	details?: Record<string, unknown>,
) {
	logger.info(
		{ audit: true, guildId, action, actorId, ...details },
		`[AUDIT] ${action}`,
	);
}
