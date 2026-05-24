---
title: start
description: Start a trial for a user.
---

## Syntax

- Slash command: `/start target:@user`
- Context menu: Start Trial

## Context Menu Availability

- Available: Yes
- Name: Start Trial

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Validates target and guild context.
- Starts a guild-scoped trial workflow.
- Returns ephemeral confirmation content.

## Instructions

1. Confirm `/settings` has valid trial and raider role selections.
2. Run `/start target:@candidate`.
3. Verify the bot response and role assignment.
4. Use `/list` to confirm the member appears as active.

## Example usage

- Slash: `/start target:@TrialCandidate`
- Context menu: Right-click member -> Apps -> Start Trial

## Expected response

- Ephemeral confirmation to the officer who ran the command.
- If successful, the target appears in `/list` active:true and receives trial role handling from workflow.
- If blocked (for example existing active trial), the response explains why it could not start.

## Common failures

- Target user missing: include target option.
- Non-guild use: run command in a server channel.
- Existing active trial: resolve current trial first.

## Related

- [`/feedback`](/commands/feedback/feedback/)
- [`/vote`](/commands/trial-lifecycle/vote/)
