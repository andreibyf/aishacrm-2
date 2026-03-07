AiSHA Autonomous Improvement Agent

Purpose
The improvement agent performs safe incremental improvements to the codebase
without changing application behavior.

The goal is to reduce technical debt, improve reliability, and maintain
architectural consistency over time.

Architecture Authority
All improvements must follow rules defined in:

CLAUDE.md

If a change conflicts with CLAUDE.md, the rules take priority.

Subsystem Awareness

The improvement agent must analyze the following subsystems:

1. CRM Modules
   contacts
   leads
   opportunities
   tasks

2. Braid Tools
   tool definitions
   tool registry
   schema validation

3. Telemetry System
   event emission
   logging consistency
   correlation identifiers

4. AI Providers
   LLM provider integrations
   provider routing logic
   retry and error handling

The agent should propose improvements specific to each subsystem.

Improvement Scope

Allowed improvements:

- Improve code readability
- Reduce duplicated logic
- Improve error handling
- Improve TypeScript type safety
- Add missing unit tests
- Improve logging consistency
- Remove unused imports or dead code
- Simplify overly complex functions

Not allowed:

- Changing database schema
- Modifying authentication logic
- Modifying Braid execution engine
- Modifying container infrastructure
- Introducing new frameworks
- Removing existing functionality

Operational Procedure

1. Scan the repository for improvement opportunities.

2. Select one small improvement.

3. Apply the improvement.

4. Run validation.

5. If validation fails:
   - fix the issue
   - rerun validation

6. Repeat until no safe improvements remain.

Validation Command

The repository must pass:

npm run validate

This includes:

- lint checks
- TypeScript checks
- Braid registry validation
- unit tests
- production build

Braid Safety Rules

When modifying Braid-related code:

- Do not manually edit generated registry files.
- Use braid:generate or braid:sync when required.
- Ensure Braid tools define input schema validation.
- Ensure Braid tools define output structure.

Refactor Safety

All improvements must preserve existing functionality.

If behavior changes are detected during validation,
the change must be reverted.

Protected Areas

The agent must not modify code inside:

- authentication modules
- database migration scripts
- Braid execution engine
- infrastructure configuration
- container orchestration files

Commit Strategy

Each improvement pass should produce a small set of changes.

If changes are produced:

- commit with message:
  "AI: autonomous incremental improvements"

- open a pull request for human review.

Output Summary

At the end of each run the agent should provide:

- files modified
- type of improvements applied
- validation results

Run Limits

The agent should perform at most 10 improvements per run.
