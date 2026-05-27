# Repo File Editor Skill Example

This file was created as a safe end-to-end example for the `repo-file-editor` skill.

## Example user prompt

> In `C:\Users\andre\Documents\GitHub\aishacrm-2`, create a short developer note at `docs/developer-docs/REPO_FILE_EDITOR_SKILL_EXAMPLE.md` explaining when to use the repo-file-editor skill and its safety boundaries.

## What the skill should do

The skill is designed for small, bounded repository edits. It should:

- operate only inside the allowed repository root;
- create or edit allowed text-based file types such as `.md`, `.js`, `.ts`, `.tsx`, `.json`, `.css`, `.html`, `.yml`, `.yaml`, and `.env.example`;
- avoid deletes unless the user confirms them in the current conversation;
- avoid lockfiles, binaries, dependency folders, and generated output unless explicitly requested;
- summarize changed files and what changed after completion.

## Why this example is safe

This example creates one Markdown file under `docs/developer-docs/`, which is an allowed file type in an existing documentation area. It does not rename, move, delete, or touch generated artifacts.
