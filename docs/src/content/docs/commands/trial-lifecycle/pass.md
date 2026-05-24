---
title: pass
description: Resolve an active trial as passed.
---

## Syntax

- Slash command: `/pass` target:@user
- Context menu: Pass Trial

## Context Menu Availability

- Available: Yes
- Name: Pass Trial

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Resolves trial outcome to passed.
- Applies role transition logic from trial role to raider role.
- Returns ephemeral workflow confirmation.

## Instructions

1. Confirm the member has an active trial.
2. Run `/pass target:@member`.
3. Confirm the trial is no longer active in `/list`.
4. Confirm role updates in Discord member roles.

## Example usage

- Slash: `/pass target:@TrialCandidate`
- Context menu: Right-click member -> Apps -> Pass Trial

## Expected response

- Ephemeral confirmation describing successful resolution.
- Trial is removed from active list and pass outcome is recorded for this guild.
- Role transition logic applies trial-role removal and raider-role assignment when configured.

## Common failures

- No active trial found: start trial first or use correct member.
- Role hierarchy blocks update: raise bot role above managed roles.

## Related

- [`/start`](/commands/trial-lifecycle/start/)
- [`/fail`](/commands/trial-lifecycle/fail/)
