# Debugging Workflow (Qwen2.5-Coder-32B)

Debug this issue using the following workflow:
1. Identify the exact failing behavior.
2. Trace the data flow from UI -> API -> DB -> cache.
3. Identify the minimal root cause.
4. Propose a minimal diff fix.
5. Generate the patch using Continue's edit tools.
6. Generate a regression test (Vitest or Playwright).
7. Suggest any related improvements.
This gives you surgical, minimal-diff fixes.
