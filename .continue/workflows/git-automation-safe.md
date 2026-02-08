# Git Automation Workflow (Safe)

Use safe Git automation:
1. Run `git status`.
2. List changed files and confirm they are safe to commit.
3. Stage only the files related to this change.
4. Generate a conventional commit message.
5. Commit.
6. Push.
7. Stop if merge conflicts exist and ask for confirmation.
This prevents accidental commits of secrets or junk.
