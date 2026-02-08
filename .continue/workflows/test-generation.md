# Test Generation Workflow (DeepSeek-Coder-V2-Lite)

Generate tests using the following workflow:
1. Identify the unit under test.
2. Identify all branches, edge cases, and failure modes.
3. Generate Vitest unit tests with mocks.
4. Generate Playwright component tests if UI-related.
5. Generate Playwright E2E tests if flow-related.
6. Use data-testid selectors.
7. Keep tests deterministic and isolated.
8. Use MSW for network mocking.
DeepSeek is extremely fast at this.
