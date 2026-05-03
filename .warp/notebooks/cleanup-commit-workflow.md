# Cleanup Commit Workflow

For commits that touch docs, configs, dead-code purge, or anything where the
pre-commit hook's full test suite is irrelevant. Splits the work into clean
logical commits without fighting the hook.

## 1. Verify scope

```sh
cd ${AISHA_REPO}
git status -s
```

Confirm files match the cleanup intent. If anything unexpected (random
backend code, schema files, etc.), stop and re-evaluate — pre-commit
exists for those.

## 2. Stage and commit

```sh
cd ${AISHA_REPO}
git add -A
git status -s
```

Verify staged set, then commit:

```sh
cd ${AISHA_REPO}
git commit --no-verify -m "chore: <one-line summary>

<paragraph: why these changes were grouped together>

[--no-verify: pre-commit hook fails on 101 pre-existing test failures
unrelated to this commit; tracked as task #41]"
```

## 3. Push

```sh
cd ${AISHA_REPO}
git push github main
```

Pre-push hook runs (lighter than pre-commit; skips Docker-gated tests
per task #13). If it fails, read the output — pre-push genuinely catches
breaking changes.

## 4. Watch the mirror

```sh
cd ${AISHA_REPO}
gh run list --workflow=mirror-to-gitea.yml --limit 3
```

Latest entry should be your push, status ✓ Success within ~2 min.

## 5. Confirm Coolify saw it

Open `${COOLIFY_URL}` in browser. Affected apps will show new deployment
attempts. If watch_paths matched, deployment fires automatically. If not,
no deploy is the correct outcome (compose-root-only changes don't affect
service builds).

## 6. Update CHANGELOG.md if you forgot

Per CLAUDE.md, every code/config change must update CHANGELOG.md.
If you skipped it, follow up:

```sh
cd ${AISHA_REPO}
# edit CHANGELOG.md → add entry under [Unreleased]
git add CHANGELOG.md
git commit --no-verify -m "docs(changelog): record <previous-commit-summary>"
git push github main
```
