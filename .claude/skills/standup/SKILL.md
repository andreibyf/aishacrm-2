---
name: standup
description: Generate a standup/progress update for AiSHA CRM by pulling recent GitHub, Linear, and Slack activity. Use to summarize commits/PRs, ticket moves, and blockers into yesterday/today/blockers — useful as a solo-dev daily log or session journal entry.
argument-hint: "[yesterday | today | blockers]"
---

# /standup (AiSHA CRM)

> Connectors and conventions: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Pull together recent activity across the toolchain into a concise update. As a solo dev, this doubles as a daily session-journal entry.

## Sources
- **GitHub (`gh`):** commits, PRs opened/merged on `andreibyf/aishacrm-2` (`gh pr list --state merged --search "merged:>=<date>"`, `git log --since=...`).
- **Linear:** issues moved to In Progress / Done; next sprint items.
- **Slack:** decisions/threads needing follow-up.

## Output
```markdown
## Standup — <date>

### Yesterday
- [Completed — PR #/Linear ref]

### Today
- [Planned — Linear ref]

### Blockers
- [Blocker + what unblocks it]
```

## Tips
1. Run each morning; append to the session journal.
2. Reference PR numbers and Linear IDs so the log stays traceable.
3. Ask for Slack or plain-text formatting as needed.
