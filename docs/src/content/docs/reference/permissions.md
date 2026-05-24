---
title: Permissions
description: Command access model used by Gatekeeper.
---

Officer-only command access is granted when a user is one of the following:

- Guild owner
- Administrator permission
- Manage Guild permission
- Moderate Members permission

Denied users receive an ephemeral restriction message.

## Additional command-level constraints

- Most commands require guild context and will reject DMs.
- /reminders defines default member permission as Manage Guild.
