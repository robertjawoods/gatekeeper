---
name: update-docs-and-changelog
description: "Update project documentation and changelog after agent changes. Use when: agent adds a command, modifies a command, changes bot behavior, adds a feature, deprecates functionality, fixes a bug worth documenting, adds or changes settings. Produces: new or updated docs page(s) under docs/src/content/docs/ and a new changelog entry in docs/src/content/docs/changelog.md."
argument-hint: "Describe the change made (e.g. 'added /ban command', 'changed /start to support optional reason field')"
---

# Update Docs and Changelog

Produce or update documentation pages and append a changelog entry after any agent-driven change to this project.

## When to Use

Invoke this skill after any of the following:
- A new slash command or context menu command was added
- An existing command's behavior, options, or permissions changed
- A new bot feature or setting was introduced
- A command was removed or deprecated
- A workflow or trial lifecycle step changed

## Procedure

### 1. Identify What Changed

Review the changes made in this session:
- Which commands were added, modified, or removed?
- Which services or behaviors changed?
- Are there new options, flags, or modal fields?
- Were permissions, preconditions, or guild-scoping rules affected?

### 2. Determine Docs Page Action

Check `docs/src/content/docs/` for the relevant section:

| Change type | Target directory |
|---|---|
| New or changed slash/context menu command | `docs/src/content/docs/commands/<category>/` |
| New workflow or lifecycle step | `docs/src/content/docs/workflows/` |
| New reference concept | `docs/src/content/docs/reference/` |
| Getting started / setup change | `docs/src/content/docs/getting-started/` |

Command categories: `trial-lifecycle/`, `admin/`, `feedback/`, `utility/`

**If a page exists**: update it in-place — revise syntax, permissions, behavior description, instructions, and expected response sections as needed.

**If no page exists**: create one using the [command page template](./assets/command-page-template.md).

### 3. Update the Command Index (if applicable)

If a command was added or removed, update `docs/src/content/docs/commands/index.mdx` to reflect the current command list.

### 4. Append the Changelog Entry

Open `docs/src/content/docs/changelog.md`.

- If today's date section (`## YYYY-MM-DD`) already exists, append bullet(s) to it.
- If it does not exist, add a new `## YYYY-MM-DD` section at the **bottom** of the file.

Today's date: use the current session date (available via `The current date is ...` in context).

Bullet format:
```
- <Verb phrase describing the change. Reference the command or feature by name.>
```

Examples:
- Added `/ban` officer command to immediately fail and remove a trial member.
- Updated `/vote` to support an optional reason field in the vote modal.
- Fixed `/list` not scoping results to the current guild.

### 5. Validate

- Docs page frontmatter contains `title` and `description`.
- Changelog date header is `## YYYY-MM-DD` (ISO 8601).
- Changelog bullets are concise and in past tense.
- No broken links introduced in command index or sidebar.
