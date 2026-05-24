---
title: fail
description: Resolve an active trial as failed.
---

## Syntax

- Slash command: `/fail` target:@user
- Context menu: Fail Trial

## Context Menu Availability

- Available: Yes
- Name: Fail Trial

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Resolves trial outcome to failed.
- Returns ephemeral confirmation from workflow result.
- Keeps outcome scoped to current guild.

## Instructions

1. Confirm the member is currently in an active trial.
2. Run `/fail target:@member`.
3. Confirm active trial list no longer includes the member.
4. Follow up with officer notes if re-trial is planned.

## Example usage

- Slash: `/fail target:@TrialCandidate`
- Context menu: Right-click member -> Apps -> Fail Trial

## Expected response

- Ephemeral confirmation with failed resolution result.
- Trial is no longer active for the member in the current guild.
- Follow-up decision handling remains in officer process, not in public chat.

## Common failures

- Target not supplied.
- Command run outside guild.
- No active trial for selected member.

## Related

- [`/start`](/commands/trial-lifecycle/start/)
- [`/pass`](/commands/trial-lifecycle/pass/)
