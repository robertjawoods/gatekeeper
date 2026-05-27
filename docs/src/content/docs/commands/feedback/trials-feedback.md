---
title: trials-feedback
description: Post a feedback board with one button per active trial member.
---

## Syntax

- Slash command: `/trials-feedback`

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Finds active trials in the current guild.
- Posts a feedback board to the configured officer channel.
- Renders one button per active trial so officers can open feedback quickly.
- Returns an ephemeral status message to the command user.

## Instructions

1. Confirm `/settings` has a valid Officer Notification Channel.
2. Run `/trials-feedback`.
3. Verify the board post appears in the officer channel.
4. Use the buttons to submit feedback for each active trial.

## Example usage

- Slash: `/trials-feedback`

## Expected response

- Ephemeral confirmation that a feedback board was posted with the number of active trial buttons.
- If no active trials exist, response explains no board was posted.
- If channel configuration is invalid, response tells you to update `/settings`.

## Common failures

- Settings missing: run `/settings` first.
- Officer channel not found or not text-based.
- Command run outside a guild.

## Related

- [`/feedback`](/commands/feedback/feedback/)
- [`/summary`](/commands/feedback/summary/)
- [`/settings`](/commands/admin/settings/)
