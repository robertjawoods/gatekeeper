---
title: Reminder Operations
description: Operate raid attendance reminders safely.
---

## Setup prerequisites

- Officer channel configured in `/settings`.
- Raid schedule cron configured.
- Attendance reminder threshold configured.

## Manual operation

1. Run `/reminders run-now`.
2. Review counters in ephemeral result.
3. If skipped, check settings and rerun.

## Operational checks

- Ensure duplicate suppression is functioning as expected.
- Track delivery failures and verify channel access.
