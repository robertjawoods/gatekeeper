import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type Guild,
	type User,
} from "discord.js";
import { buildTrialStartedEmbed } from "../services/embedBuilders.js";
import {
	GuildSettingsMissingError,
	getGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "../services/guildSettings.js";
import { audit, createGuildLogger } from "../services/logger.js";
import {
	projectTrialExpectedEndDate,
	startTrial,
} from "../services/trialService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

async function getValidatedTarget(interaction: ChatInputCommandInteraction) {
	const target = interaction.options.getUser("target");
	if (!target) {
		await interaction.reply({
			content: "Target user is required.",
			flags: ["Ephemeral"],
		});
		return null;
	}

	return target;
}

async function getValidatedGuildContext(interaction: TrialCommandInteraction) {
	const guild = interaction.guild;
	const guildId = interaction.guildId;

	if (!guild || !guildId) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: ["Ephemeral"],
		});
		return null;
	}

	return { guild, guildId };
}

async function getSettingsOrReply(
	interaction: TrialCommandInteraction,
	prisma: Parameters<typeof getGuildSettings>[0],
	guildId: string,
) {
	try {
		return await getGuildSettings(prisma, guildId);
	} catch (error) {
		if (error instanceof GuildSettingsMissingError) {
			await interaction.reply({
				content:
					"Server settings have not been configured yet. Run `/settings` first.",
				flags: ["Ephemeral"],
			});
			return null;
		}

		createGuildLogger(guildId).error(
			{ err: error },
			"Error retrieving guild settings.",
		);
		await interaction.reply({
			content:
				"An error occurred while retrieving server settings. Please try again later.",
			flags: ["Ephemeral"],
		});
		return null;
	}
}

async function addTrialRoleOrReply(
	interaction: TrialCommandInteraction,
	guild: Guild,
	userId: string,
	trialRoleId: string,
) {
	try {
		const member = await guild.members.fetch(userId);
		await member.roles.add(trialRoleId);
		return true;
	} catch (error) {
		createGuildLogger(guild.id).error(
			{ userId, trialRoleId, err: error },
			"Error adding trial role.",
		);
		await interaction.reply({
			content:
				"Trial was created, but I could not add the trial role. Please check my role permissions.",
			flags: ["Ephemeral"],
		});
		return false;
	}
}

// Starting a trial should create a new trial entry in the database and reply with a confirmation message.
// It should also ensure that the trial target is given the trial role
// It should check if the user already has an active trial and prevent starting a new one if they do.
// The trial entry should include the user who started the trial, the start time, and any other relevant information.

export class StartCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "start",
			description: "Starts the trial for a user.",
			preconditions: ["OfficerOnly"],
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName(this.name)
					.setDescription(this.description)
					.addUserOption((option) =>
						option
							.setName("target")
							.setDescription("The user to start the trial for")
							.setRequired(true),
					),
			{ idHints: ["1506975873704660992", "1507106674631114873"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder.setName("Start Trial").setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139584482349116",
					"1507141185871806595",
					"1507142534667960320",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = await getValidatedTarget(interaction);
		if (!target) {
			return;
		}

		await this.runStart(interaction, target);
	}

	public override async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	) {
		if (!interaction.isUserContextMenuCommand()) {
			await interaction.reply({
				content: "This command can only be used from a user context menu.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runStart(interaction, interaction.targetUser);
	}

	private async runStart(interaction: TrialCommandInteraction, target: User) {
		const client = this.container.client;
		const messageClient = client as Parameters<
			typeof sendOfficerChannelMessage
		>[0];
		const prisma = this.container.prisma;

		const guildContext = await getValidatedGuildContext(interaction);
		if (!guildContext) {
			return;
		}

		const { guild, guildId } = guildContext;
		const log = createGuildLogger(guildId);

		const settings = await getSettingsOrReply(interaction, prisma, guildId);
		if (!settings) {
			return;
		}

		const targetDisplayNameSnapshot = await resolveGuildDisplayName(
			client,
			guildId,
			target.id,
			target.displayName,
		);
		const officerDisplayNameSnapshot = await resolveGuildDisplayName(
			client,
			guildId,
			interaction.user.id,
			interaction.user.username,
		);

		let createdTrialStartTime: Date | null = null;

		try {
			const result = await startTrial(
				prisma,
				guildId,
				target.id,
				interaction.user.id,
				targetDisplayNameSnapshot,
				officerDisplayNameSnapshot,
			);

			if (!result.created) {
				log.info(
					{ targetId: target.id },
					"Trial start rejected: user already has an active trial.",
				);
				await interaction.reply({
					content: `${target.tag} already has an active trial in this server.`,
					flags: ["Ephemeral"],
				});
				return;
			}

			log.info(
				{ targetId: target.id, trialId: result.trial?.id },
				"Trial created successfully.",
			);
			audit(guildId, "trial.started", interaction.user.id, {
				targetId: target.id,
				trialId: result.trial?.id,
			});
			createdTrialStartTime = result.trial?.startTime ?? null;
		} catch (error) {
			log.error({ targetId: target.id, err: error }, "Error creating trial.");
			await interaction.reply({
				content:
					"An error occurred while starting the trial. Please try again later.",
				flags: ["Ephemeral"],
			});
			return;
		}

		const roleUpdated = await addTrialRoleOrReply(
			interaction,
			guild,
			target.id,
			settings.trialRoleId,
		);
		if (!roleUpdated) {
			return;
		}

		const displayName = targetDisplayNameSnapshot;
		const officerDisplayName = officerDisplayNameSnapshot;
		const projectedEndDate = createdTrialStartTime
			? projectTrialExpectedEndDate(
					createdTrialStartTime,
					settings.raidScheduleCron,
					settings.raidAttendanceReminderThreshold,
				)
			: null;
		const logoUrl = client.user?.displayAvatarURL({
			extension: "png",
			size: 256,
		});
		const embed = buildTrialStartedEmbed(
			{
				memberDisplayName: displayName,
				memberId: target.id,
				officerDisplayName,
				officerId: interaction.user.id,
				startedAt: createdTrialStartTime ?? new Date(),
				expectedCompletionDate: projectedEndDate,
			},
			logoUrl,
		);
		const sendResult = await sendOfficerChannelMessage(
			messageClient,
			settings.officerChannelId,
			{
				embeds: [embed.toJSON()],
			},
		);

		if (!sendResult.delivered) {
			await interaction.reply({
				content:
					"Trial was started, but I could not send the update to the officer channel. Please check channel settings and permissions.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await interaction.reply({
			content: "Posted start update in the officer channel.",
			flags: ["Ephemeral"],
		});
	}
}
