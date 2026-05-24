---
title: summary
description: View trial feedback summary for a member.
---

## Syntax

- Slash command: `/summary` member:@user
- Context menu: View Trial Summary

## Context Menu Availability

- Available: Yes
- Name: View Trial Summary

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Aggregates feedback context for selected member.
- Returns an ephemeral summary message to the command user.
- Uses guild-scoped records only.

## Instructions

1. Collect multiple `/feedback` submissions across raids.
2. Run `/summary` member:@member.
3. Review score patterns and comments.
4. Run `/vote` if the member is ready for decision.

## Example usage

- Slash: `/summary` member:@TrialCandidate
- Context menu: Right-click member -> Apps -> View Trial Summary

## Expected response

- Ephemeral summary visible only to command user.
- Includes current aggregated feedback context available for that member in this guild.
- If no data exists yet, response explains that feedback is missing.

## Common failures

- Member argument missing.
- No feedback records found yet for this guild/member.

## Related

- [`/feedback`](/commands/feedback/feedback/)
- [`/vote`](/commands/trial-lifecycle/vote/)
