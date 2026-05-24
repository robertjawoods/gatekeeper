---
title: feedback
description: Open feedback modal and submit structured trial observations.
---

## Syntax

- Slash command: `/feedback` target:@user
- Context menu: Add Feedback

## Context Menu Availability

- Available: Yes
- Name: Add Feedback

## Permissions

- Officer-only precondition.
- Runs in guilds only.

## Modal fields

- Performance (1-5)
- Attitude (1-5)
- Focus (1-5)
- Late checkbox
- Comments (optional)

## What it does

- Opens a modal targeted to the selected trial member.
- Saves a guild-scoped feedback entry tied to actor and target.
- Feeds downstream summary and vote workflows.

## Instructions

1. Run `/feedback` target:@member.
2. Complete all required score fields.
3. Add comments for context on behavior and raid readiness.
4. Submit and confirm ephemeral acknowledgement.

## Example usage

- Slash: `/feedback` target:@TrialCandidate
- Context menu: Right-click member -> Apps -> Add Feedback

## Expected response

- Feedback modal opens for the selected user.
- After submit, feedback is stored as a guild-scoped record tied to actor and target.
- You receive an acknowledgement without posting sensitive feedback publicly.

## Common failures

- Target missing.
- Command run outside server.
- Invalid score entry if non-numeric values are provided.

## Related

- [`/feedbacksummary`](/commands/feedback/summary/)
- [`/vote`](/commands/trial-lifecycle/vote/)
