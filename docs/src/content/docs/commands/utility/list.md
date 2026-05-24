---
title: list
description: List trials in the current guild.
---

## Syntax

- Slash command: `/list`
- Optional boolean option: active (default true)

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Returns guild-scoped trials in an ephemeral response.
- Defaults to active trials only.
- Includes trial status and related context from workflow output.

## Instructions

1. Run `/list` for active trials.
2. Run `/list active:false` to inspect inactive history.
3. Use results to decide follow-up commands.

## Example usage

- Slash: `/list`
- Slash: `/list active:false`

## Expected response

- Ephemeral list of guild-scoped trial entries.
- With `active:true` default, shows currently active members.
- With `active:false`, shows inactive/resolved entries for history review.

## Common failures

- Command used outside guild.
- No trials for selected filter.

## Related

- [`/start`](/commands/trial-lifecycle/start/)
- [`/summary`](/commands/feedback/summary/)
