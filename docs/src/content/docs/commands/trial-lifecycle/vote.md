---
title: vote
description: Create a trial vote poll in the configured officer channel.
---

## Syntax

- Slash command: `/vote target:@user`
- Context menu: Start Trial Vote

## Context Menu Availability

- Available: Yes
- Name: Start Trial Vote

## Permissions

- Officer-only precondition.
- Runs in guilds only.
- Replies ephemerally to the actor after deferred processing.

## What it does

- Starts vote workflow for target member.
- Posts poll content to officer channel as configured in settings.
- Tracks vote intent for pass/fail/extend flows.

## Instructions

1. Verify `/settings` has Officer Notification Channel configured.
2. Run `/vote target:@member`.
3. Confirm poll appears in officer channel.
4. Monitor voting activity and resolve with `/pass` or `/fail` when complete.

## Example usage

- Slash: `/vote target:@TrialCandidate`
- Context menu: Right-click member -> Apps -> Start Trial Vote

## Expected response

- Immediate deferred ephemeral acknowledgement to the command user.
- Final ephemeral status update after workflow completes.
- Poll message appears in configured officer channel when setup is valid.

## Common failures

- Settings missing: configure officer channel first.
- Guild context missing: command must run in server.
- Channel posting errors: check channel permissions.

## Related

- [`/summary`](/commands/feedback/summary/)
- [`/pass`](/commands/trial-lifecycle/pass/)
- [`/fail`](/commands/trial-lifecycle/fail/)
