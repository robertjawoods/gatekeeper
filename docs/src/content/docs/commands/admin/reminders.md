---
title: reminders
description: Admin operations for raid attendance reminders.
---

## Syntax

- Slash command: `/reminders run-now`

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.
- Default member permission includes Manage Guild.
- Runs in guilds only.

## What it does

- Executes reminder cycle immediately for current guild.
- Reports candidates evaluated, reminders sent, duplicates skipped, and delivery failures.

## Instructions

1. Ensure `/settings` has raid schedule and threshold configured.
2. Run `/reminders run-now`.
3. Read ephemeral result counters.
4. Adjust settings if reminders are skipped unexpectedly.

## Example usage

- Slash: `/reminders run-now`

## Expected response

- Ephemeral summary with counters:
- Candidates evaluated
- Reminders sent
- Duplicates skipped
- Delivery failures
- If skipped due missing setup, response explicitly tells you to run `/settings` first.

## Common failures

- settings_missing: run `/settings` first.
- scheduling_missing: add raid schedule and threshold.
- delivery failures: verify channel and permission configuration.

## Related

- [`/settings`](/commands/admin/settings/)
- [Reminder Operations](/workflows/reminder-operations/)
