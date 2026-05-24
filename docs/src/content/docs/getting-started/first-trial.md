---
title: First Trial Walkthrough
description: Run a complete trial lifecycle from start to decision.
---

This walkthrough validates that your setup and command permissions are correct.

## 1. Configure baseline settings

Run `/settings` and set:

- Officer Notification Channel
- Raider Role
- Trial Role
- Raid Schedule (Cron)
- Attendance Reminder Threshold

## 2. Start a trial

Run `/start target:@member`.

Expected result:

- Trial role is added to the member.
- Active trial entry is created.
- You receive an ephemeral confirmation.

## 3. Submit feedback

Run `/feedback target:@member`.

Expected result:

- A modal opens with score fields for performance, attitude, focus, plus late checkbox and comments.
- Submission is stored as feedback for this member in this guild.

## 4. Review status

Run `/summary member:@member` and `/list active:true`.

Expected result:

- Summary returns current aggregate and comment context.
- List includes the trial as active.

## 5. Start vote and resolve

Run `/vote target:@member`, then resolve with `/pass` or `/fail` after officer decision.

Expected result:

- Vote poll is created in officer channel.
- Final resolution updates trial status and role assignment.

## If anything fails

Use `/roledebug` to diagnose role hierarchy/manageability issues.
