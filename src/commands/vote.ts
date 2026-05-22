import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import {
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	type ContextMenuCommandInteraction,
	type User,
} from "discord.js";
import { buildTrialVotePollEmbed } from "../services/embedBuilders.js";
import {
	GuildSettingsMissingError,
	getGuildSettings,
	resolveGuildDisplayName,
	sendOfficerChannelMessage,
} from "../services/guildSettings.js";
import {
	attachTrialVotePollMessage,
	buildTrialVoteButtons,
	createTrialVotePoll,
} from "../services/voteService.js";

type TrialCommandInteraction =
	| ChatInputCommandInteraction
	| ContextMenuCommandInteraction;

async function getValidatedGuildContext(interaction: TrialCommandInteraction) {
	const guild = interaction.guild;
	const guildId = interaction.guildId;

	if (!guild || !guildId) {
		await interaction.editReply({
			content: "This command can only be used in a server.",
		});
		return null;
	}

	return { guild, guildId };
}

async function getSettingsOrReply(
	interaction: TrialCommandInteraction,
	command: Command,
	guildId: string,
) {
	try {
		return await getGuildSettings(command.container.prisma, guildId);
	} catch (error) {
		if (error instanceof GuildSettingsMissingError) {
			await interaction.editReply({
				content:
					"Server settings have not been configured yet. Run `/settings` first.",
			});
			return null;
		}

		console.error("Error retrieving guild settings:", error);
		await interaction.editReply({
			content:
				"An error occurred while retrieving server settings. Please try again later.",
		});
		return null;
	}
}

export class VoteCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "vote",
			description: "Creates a trial vote poll in the officer channel",
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
							.setDescription("The user to vote on")
							.setRequired(true),
					),
			{ idHints: ["1507106764330631330"] },
		);

		registry.registerContextMenuCommand(
			(builder) =>
				builder
					.setName("Start Trial Vote")
					.setType(ApplicationCommandType.User),
			{
				idHints: [
					"1507139674055905341",
					"1507141187604320367",
					"1507142625571115188",
				],
			},
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const target = interaction.options.getUser("target");
		if (!target) {
			await interaction.reply({
				content: "Target user is required.",
				flags: ["Ephemeral"],
			});
			return;
		}

		await this.runVote(interaction, target);
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

		await this.runVote(interaction, interaction.targetUser);
	}

	private async runVote(interaction: TrialCommandInteraction, target: User) {
		await interaction.deferReply({ flags: ["Ephemeral"] });

		const guildContext = await getValidatedGuildContext(interaction);
		if (!guildContext) {
			return;
		}

		const { guildId } = guildContext;

		const settings = await getSettingsOrReply(interaction, this, guildId);
		if (!settings) {
			return;
		}

		const pollResult = await createTrialVotePoll(
			this.container.prisma,
			guildId,
			target.id,
			interaction.user.id,
		);
		if (!pollResult.created) {
			await interaction.editReply({
				content: `No active trial found for ${target.tag}.`,
			});
			return;
		}

		const poll = pollResult.poll;
		const logoUrl = this.container.client.user?.displayAvatarURL({
			extension: "png",
			size: 256,
		});
		const targetDisplayName =
			poll.targetDisplayName ??
			(await resolveGuildDisplayName(
				this.container.client,
				guildId,
				target.id,
				target.displayName,
			));
		const embed = buildTrialVotePollEmbed(
			{
				targetDisplayName,
				targetId: poll.targetId,
				trialId: poll.trialId,
				pollId: poll.pollId,
				open: poll.open,
				passVotes: poll.passVotes,
				failVotes: poll.failVotes,
				extendVotes: poll.extendVotes,
				totalVotes: poll.totalVotes,
			},
			logoUrl,
		);

		const sendResult = await sendOfficerChannelMessage(
			this.container.client,
			settings.officerChannelId,
			{
				embeds: [embed],
				components: buildTrialVoteButtons(poll.pollId, !poll.open),
			},
		);

		if (!sendResult.delivered) {
			await interaction.editReply({
				content:
					"Vote poll was created, but I could not send it to the officer channel. Please check channel settings and permissions.",
			});
			return;
		}

		const attached = await attachTrialVotePollMessage(
			this.container.prisma,
			guildId,
			poll.pollId,
			sendResult.messageId,
		);
		if (!attached) {
			console.error(
				`Failed to attach message ${sendResult.messageId} to poll ${poll.pollId} in guild ${guildId}.`,
			);
		}

		await interaction.editReply({
			content: "Posted vote poll in the officer channel.",
		});
	}
}
