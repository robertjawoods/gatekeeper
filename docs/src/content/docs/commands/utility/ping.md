---
title: ping
description: Health check for bot latency and websocket heartbeat.
---

## Syntax

- Slash command: `/ping`

## Context Menu Availability

- Available: No
- Name: N/A

## Permissions

- Officer-only precondition.

## What it does

- Sends a temporary ping response.
- Edits response with round-trip timing and websocket heartbeat.

## Instructions

1. Run `/ping`.
2. Confirm response includes round-trip and heartbeat values.
3. Use large spikes as a signal to inspect host/network health.

## Example usage

- Slash: `/ping`

## Expected response

- Initial ephemeral ping acknowledgement.
- Edited message with round-trip duration and websocket heartbeat values.
- If message retrieval fails internally, fallback error response is shown.

## Common failures

- Failed to retrieve ping response object.
- Elevated latency due Discord API or host saturation.

## Related

- [/getting-started/first-trial/](/getting-started/first-trial/)
