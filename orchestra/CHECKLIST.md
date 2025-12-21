# AiSHA CRM – Orchestration Checklist

Use this before and after every wave, especially for bugfixes.

---

## Before Starting a Wave

1. **Confirm Goal**
   - [ ] Open `orchestra/PLAN.md`.
   - [ ] Verify the current goal `Type` (bugfix vs feature).
   - [ ] Identify the highest-priority **Active Task**.

2. **Confirm Scope**
   - [ ] Read the relevant entry in `BUGS.md`.
   - [ ] Make sure the task describes:
     - Symptoms
     - Suspected area
     - Acceptance criteria
   - [ ] If scope is vague, tighten it before proceeding.

3. **Load Constraints**
   - [ ] Read `orchestra/ARCHITECTURE.md` (or at least skim).
   - [ ] Read `orchestra/CONVENTIONS.md`.
   - [ ] Ensure mode is “bugfix-first” unless deliberately in feature mode.

4. **Prepare Environment**
   - [ ] Backend running on `http://localhost:4001`.
   - [ ] Frontend running on `http://localhost:4000`.
   - [ ] `.env` and `backend/.env` are correct for current environment.

---

## During a Wave

5. **Limit Blast Radius**
   - [ ] Changes are confined to the area(s) specified in the task.
   - [ ] No opportunistic refactors or unrelated cleanups.

6. **Add/Update Tests**
   - [ ] At least one test reproduces the bug pre-fix.
   - [ ] The same test passes post-fix.

---

## After Completing a Wave

7. **Run Validation**
   - [ ] Run lint/build (e.g. `pnpm lint`, `pnpm build`).
   - [ ] Run relevant tests (e.g. `pnpm test auth`).
   - [ ] Manually test the bug scenario in the UI.

8. **Review Diff**
   - [ ] Check number of files changed.
   - [ ] Check lines added/removed.
   - [ ] Confirm there are no large, unrelated rewrites.

9. **Update Logs**
   - [ ] Add a new entry to `WAVE_LOG.md`.
   - [ ] Update `orchestra/PLAN.md` status for the task.
   - [ ] If fully resolved, mark the bug as “Closed” in `BUGS.md`.

10. **Decide Next Step**
   - [ ] If bug is fully fixed and stable → move to next bug.
   - [ ] If partial or risky → add follow-up item in `BUGS.md` or PLAN backlog.
