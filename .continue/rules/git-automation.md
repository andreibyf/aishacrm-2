---
description: Safe Git automation rules for staging, committing, and pushing.
---

# Safe Git Automation

When running git commands:
- Always run `git status` first.
- Never commit .env, .env.local, or Doppler files.
- Use conventional commits (feat, fix, refactor, test, chore).
- Summaries must be <= 72 characters.
- Confirm the list of staged files before committing.
- Use `git push` only after commit succeeds.
- If merge conflicts exist, stop and request user confirmation.
- Follow folder structure: src/, tests/, docs/, etc.
- Write clear commit messages describing the change.
- Ensure proper error handling for git commands (e.g., failed push, merge conflicts).