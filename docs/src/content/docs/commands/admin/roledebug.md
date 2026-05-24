---
title: roledebug
description: Diagnose role visibility and manageability issues.
---

## Syntax

- Slash command: `/roledebug`
- Optional role option: role
- Optional string option: role_id

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## What it does

- Shows embed diagnostics for configured trial and raider roles.
- Inspects managed status, role position, mentionability, and bot editability.
- Supports direct role lookup by ID when role picker misses it.

## Instructions

1. Run `/roledebug` with no options to inspect configured roles.
2. Run `/roledebug` role:@role for a specific role.
3. Run `/roledebug` role_id:123... when role is not visible in picker.
4. Review embed values and adjust role hierarchy.

## Example usage

- Slash: `/roledebug`
- Slash: `/roledebug role:@Trial`
- Slash: `/roledebug role_id:123456789012345678`

## Expected response

- Ephemeral diagnostic embed showing role position and bot editability details.
- If settings roles are missing from guild, embed highlights missing configured IDs.
- If specific role is provided, embed focuses on that role snapshot.

## Common failures

- Requested role ID not found in guild.
- Bot highest role too low to manage selected role.

## Related

- [`/settings`](/commands/admin/settings/)
