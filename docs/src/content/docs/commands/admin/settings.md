---
title: settings
description: Configure guild-specific roles, channels, and reminder behavior.
---

## Syntax

- Slash command: `/settings`

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it configures

- Officer Notification Channel
- Raider Role
- Trial Role
- Raid Schedule (Cron expression)
- Attendance Reminder Threshold

## Instructions

1. Run `/settings` as an officer.
2. Select officer channel, raider role, and trial role.
3. Enter cron schedule, for example 0 19 * * 2,4,6.
4. Enter reminder threshold, for example 4.
5. Submit and confirm saved values.

## Example usage

- Slash: `/settings`
- Then choose channel and roles in the modal selectors and inputs.

## Expected response

- Settings modal opens with defaults pre-filled from existing guild settings when available.
- After save, configuration is persisted for this guild and used by trial, vote, and reminder workflows.

## Common failures

- Invalid cron syntax.
- Role picker missing roles due hierarchy/permissions.
- Bot cannot manage selected roles.

## Troubleshooting

Use [`/roledebug`](/commands/admin/roledebug/) when role selections are not editable.
