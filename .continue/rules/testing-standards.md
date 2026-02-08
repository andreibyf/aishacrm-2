---
description: Standards for Vitest unit tests and Playwright E2E/component tests.
---

# Testing Standards

When generating tests:
- Use Vitest for unit tests with describe/it syntax.
- Use Playwright for E2E and component tests.
- Mock network calls using MSW.
- Use data-testid attributes for selectors.
- Keep tests deterministic and isolated.
- Follow folder structure: tests/unit, tests/e2e, tests/components.
- Write clear test descriptions and comments for complex logic.
- Ensure proper setup and teardown for test environments.