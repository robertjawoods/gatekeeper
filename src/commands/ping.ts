import { isMessageInstance } from "@sapphire/discord.js-utilities";

import { type ApplicationCommandRegistry, Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";

export class PingCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "ping",
			description: "Replies with Pong!",
			preconditions: ['OfficerOnly'], // only available to officers
		});
	}

	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		// registry is unique to this command
		registry.registerChatInputCommand(
			(builder) => builder.setName(this.name).setDescription(this.description),
			{ idHints: ["1506975875420262421", "1507106675646271640"] },
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const callbackResponse = await interaction.reply({
			content: `Ping?`,
			withResponse: true,
			flags: MessageFlags.Ephemeral,
		});
		const msg = callbackResponse.resource?.message;

		if (msg && isMessageInstance(msg)) {
			const diff = msg.createdTimestamp - interaction.createdTimestamp;
			const ping = Math.round(this.container.client.ws.ping);
			return interaction.editReply(
				`Pong 🏓! (Round trip took: ${diff}ms. Heartbeat: ${ping}ms.)`,
			);
		}

		return interaction.editReply("Failed to retrieve ping :(");
	}
}
