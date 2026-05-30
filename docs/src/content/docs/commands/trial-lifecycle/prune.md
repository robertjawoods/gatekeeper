---
title: prune
description: Fail active trials for members who are no longer in the guild.
---

## Syntax

- Slash command: `/prune`

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Scans every active trial in the current guild.
- Checks whether each trial member is still in the guild.
- Marks the trial as failed when the member is no longer in the guild.
- Posts one summary update in the officer channel.
- Returns an ephemeral summary to the command invoker.

## Instructions

1. Run `/prune` in the same guild where trials are managed.
2. Review the officer-channel summary counts.
3. Follow up on any reported errors before running again.

## Example usage

- Slash: `/prune`

## Expected response

- Ephemeral summary with scanned, pruned, unchanged, and error counts.
- One officer-channel summary message for the same run.

## Common failures

- Command run outside guild.
- Bot cannot post in configured officer channel.
- Temporary API/permission errors while checking member presence.

## Related

- [`/list`](/commands/utility/list/)
- [`/fail`](/commands/trial-lifecycle/fail/)
- [`/pass`](/commands/trial-lifecycle/pass/)