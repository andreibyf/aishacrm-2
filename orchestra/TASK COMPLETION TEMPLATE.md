
The current task is now complete.

You must perform repository housekeeping.

1. UPDATE orchestra/PLAN.md

Locate the task:
<Task ID> – <Task Title>

Change its status to:
Status: Completed

If this task was a prerequisite for another, promote the next task by marking it:
Status: Active

Do not modify any other tasks or sections.

---

2. UPDATE orchestra/WAVE_LOG.md

Append a new entry using this structure:

### WAVE-<YYYYMMDD>-<TASK-ID>
Task ID: <TASK-ID>  
Title: <Task Title>  

Summary:
<Clear description of what was done and the outcome>

Root Cause:
<Only for bugfix tasks – explain why the issue occurred>

Files Affected:
- <file path>
- <file path>

Outcome:
<Select one: Diagnosis complete / Bug fixed / Tests added / Full resolution>

Notes:
<any important technical detail for future reference>

---

3. (If fully resolved) UPDATE BUGS.md

Locate:
<Task ID>

Change status to:
Status: Resolved

Add a one-line resolution summary.

---

Rules:
- Do not invent new tasks.
- Do not change priorities.
- Do not refactor or modify any code.
- Only update the control documents listed above.
