# Gatekeeper

Gatekeeper is a Discord bot for running fair, consistent member trials in guilds.

It gives officer teams a clear flow from first evaluation to final decision, so trial outcomes are based on shared input instead of scattered chat history.

## What Gatekeeper helps with

- Track each trial from start to pass/fail resolution.
- Collect structured officer feedback with scores and comments.
- Generate summaries to support clear decisions.
- Run officer-channel voting for final outcomes.
- Schedule reminder workflows tied to raid attendance settings.
- Keep all data scoped per guild.

## Who it is for

- Guild leaders and officer teams managing member trials.
- Raid groups that want repeatable, transparent decisions.
- Communities that need a consistent process across multiple officers.

## Documentation

- Docs project: [docs/](docs/)
- Overview: [docs/src/content/docs/getting-started/overview.md](docs/src/content/docs/getting-started/overview.md)
- Install guide: [docs/src/content/docs/getting-started/install.mdx](docs/src/content/docs/getting-started/install.mdx)
- Command reference: [docs/src/content/docs/commands/index.mdx](docs/src/content/docs/commands/index.mdx)

## Install Gatekeeper

Use this OAuth link to add Gatekeeper to your Discord server:

- https://discord.com/api/oauth2/authorize?client_id=1504236836547989631&permissions=268520448&scope=bot%20applications.commands

## Operational commands

If you host or operate Gatekeeper yourself, these are the main commands:

- `pnpm dev` - Run the bot in watch mode with `.env.local`.
- `pnpm docs:dev` - Start the docs site.
- `pnpm docs:build` - Build docs for production.
- `pnpm deploy-commands` - Deploy Discord application commands.
- `pnpm clear-global-commands` - Remove globally deployed commands.

## Support

- Issues: https://github.com/GatekeeperInc/gatekeeper/issues
