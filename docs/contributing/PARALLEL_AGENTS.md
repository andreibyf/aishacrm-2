# Parallel Agents — Coordination Rules

> **Audience**: AI agent sessions (Claude, Codex, Copilot, etc.) and humans coordinating with them. If you're a single human pushing to a branch you own end-to-end, the file's hygiene rules still apply, but the agent-vs-agent risk surface won't apply.

## Why this doc exists

Dre runs multiple AI agents in parallel against this repo. They commit, push, branch, file Linear tickets, and update CHANGELOG concurrently. Without coordination rules they step on each other — most painfully in May 2026 when a CodeQL-remediation agent force-pushed `origin/main` and wiped four eSign PR commits while another session was actively referencing them.

The recovery worked (orphan commits stay in local object store ~14 days; cherry-pick onto a new branch restores them) but it cost the better part of a day and a confused Linear thread. This doc states the rules that would have prevented it.

---

## The rules (read every time you start a session)

### 1. Fetch before claiming anything about `origin/main`

Before you post a Linear comment, write a commit message, or branch off a SHA you believe is on main, run:

```bash
git fetch origin main
git rev-parse origin/main
```

The SHA you get is the truth **at that moment**. A sibling agent may have pushed between the time you started reading the repo and the time you write the assertion. If you're working from a memory of "main was at X earlier", verify before relying on it.

**Worked example (2026-05-12):** A Linear comment posted "commits `857251ef`, `e163d413`, `b91bc6a2`, `232766b0` are on origin/main." They were — until the CodeQL agent force-pushed `46483cf4` over them 12 minutes later. The comment became factually wrong and the eSign work had to be restored via cherry-pick.

### 2. Never force-push `main` from an agent session

`git push --force origin main` (or `+main`, or `--force-with-lease`) is **off-limits** for AI agents. Always:

1. Branch off main (`abyfield/<linear-id>-short-slug`).
2. Push the branch.
3. Open a PR.
4. Wait for review and merge.

This applies even when "your" history looks cleaner than what's on main. If you genuinely need to rewrite history, surface it to Dre — he can decide whether the rewrite is justified and whether the other in-flight agents need to be paused first.

The single exception: a force-push to **your own feature branch** that no other agent has pulled from. If in doubt, ask.

### 3. Watch for `(forced update)` in fetch output

`git fetch` will print `+ <old>...<new> main -> origin/main (forced update)` when origin/main has been rewritten. If you see that mid-session:

- **Stop.** Don't push or open a PR on top of the new state.
- Surface it to Dre.
- If your local work is on top of the old SHA, your branch is now diverged. Don't auto-rebase — the new history may have intentionally dropped commits you'd be re-introducing.

`git reflog show origin/main` shows the previous SHAs locally; orphan commits are still in the object store for ~14 days and can be recovered via cherry-pick.

### 4. Linear is the cross-agent source of truth

In-session task lists (`TaskCreate`, etc.) live and die with the session. For anything that needs to outlive the session or be visible to another agent, file a Linear card.

Move card states as work progresses:

- **Todo** when filed, not yet started
- **In Progress** when you start (so other agents see it's claimed)
- **In Review** when the PR is open
- **Done** when merged, with the PR URL attached

A sibling agent looking at the board should be able to see what's claimed and what's free without reading commit history.

### 5. Verify untracked files belong to your work before cleaning them up

`git status` will show untracked files from prior agent sessions. Don't delete them assuming they're cruft. Run:

```bash
git log --all --since="3 days ago" -- <file>
git stash list | grep <file>
```

Common patterns that look like cruft but aren't:

- `PR_BODY_*.md` — a sibling agent's draft PR description; check if there's an open PR that needs it
- `scripts/scratch-*.ps1` — investigation scripts in progress
- `__tests__/.../*-coverage.test.js` — sometimes filed by Codex separately from the implementation

If in doubt, leave it. The cost of leaving untracked files is zero; the cost of deleting another agent's in-progress work is non-trivial.

### 6. Pre-fetch and pin SHAs at the start of long-running work

If you're doing a multi-step task that depends on origin/main being at a specific commit (rebase, cherry-pick chain, multi-PR sequence), capture the SHA at the start:

```bash
BASE_SHA=$(git rev-parse origin/main)
echo "Working against base $BASE_SHA"
```

…and re-check at each milestone (`git fetch origin main && git rev-parse origin/main`). If it's moved, you have a decision to make, not a surprise to discover at push time.

### 7. Don't queue parallel deploys for the same staging app

VPS-1 has a 5.5-core hypervisor cap (Zap-Hosting). Two concurrent Vite builds for `staging-app-fast` tip the host into the lockup pattern — HTTP 530 from Cloudflare, manual reboot required.

Before triggering the Coolify deploy webhook, query `application_deployment_queues` and confirm any prior `in_progress` deployment for the same `application_id` is actually `cancelled` or `failed`. The Coolify UI "Stop" button can take 30-60 seconds to propagate; don't trust it as instant. See [`../architecture/DEPLOY_TOPOLOGY.md`](../architecture/DEPLOY_TOPOLOGY.md#vps-1-build-cap) for the cap detail.

### 8. Pre-push hooks: don't reflexively `--no-verify`

The repo's pre-push hook runs lint + build + Vitest. When it fails:

1. First read the actual failures. Are they in code you touched? In code in your dependency graph (vitest follows imports)?
2. If they're real regressions, fix them before pushing.
3. If they're truly orphan (environmental, test data, IPC flake), file a Linear card and link it in the commit message.
4. Only `--no-verify` after step 3, and say so explicitly in the commit message.

The historical baseline for this repo is 0 failed Vitest tests / ~11 skipped. Every failure that gets dismissed compounds into the next session's problem.

---

## Recovery: orphan commits after a force-push

If a sibling agent has force-pushed main and you had commits that were on top of the old state, they're not gone — git keeps unreachable objects in the local object store for ~14 days (the default `gc.pruneExpire`). Recovery pattern:

```bash
# 1. Find the orphans in your reflog
git reflog show origin/main

# 2. Verify the commits still exist locally
git cat-file -t <orphan-sha>   # should print "commit"
git show <orphan-sha>           # should show the diff

# 3. Branch off current main and cherry-pick them back
git fetch origin
git checkout -b abyfield/4vd-XX-restore-<topic> origin/main
git cherry-pick <orphan-sha-1> <orphan-sha-2> ...

# 4. Resolve conflicts per file with explicit rationale in the commit message
# 5. Push the branch and open a PR
git push -u origin HEAD
```

Document per-conflict decisions in the commit message. Don't squash silently — a future reader needs to see why each conflict resolved the way it did.

If the orphans are NOT in your local object store (you weren't the one with them checked out), check Dre's other workstation or any CI runner that still has the build cache. After ~14 days they're gone for good.

---

## What success looks like

- You started a task. The Linear card moved Todo → In Progress before you wrote any code.
- You opened a PR. CI ran clean OR the failures are linked to existing Linear cards.
- Another agent looking at the repo can tell what you're working on without reading commit history.
- You finished. The card moved In Review → Done with the merged PR URL attached.
- No surprise force-pushes; no untracked-file deletions; no double Coolify deploys.

---

## Related

- [`../architecture/IDENTITY_MODEL.md`](../architecture/IDENTITY_MODEL.md) — same docs-the-implicit-contract approach for the users/employees model
- [`../architecture/DEPLOY_TOPOLOGY.md`](../architecture/DEPLOY_TOPOLOGY.md) — VPS-1 cap detail and Coolify webhook quirks
- [`../developer-docs/COPILOT_PLAYBOOK.md`](../developer-docs/COPILOT_PLAYBOOK.md) — operational procedures for migrations and tests
- 4VD-55 — parent doc-rollout ticket
