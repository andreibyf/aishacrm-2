# Pre-flight Check (Qwen)

You are Qwen2.5-Coder-32B. Validate before edits.

Check:
- Config consistency (tsconfig, vite, vitest, playwright)
- Alias consistency (@ -> src, @backend -> backend)
- Required env usage
- Tests impacted by the change

Output:
- Issues found
- Required fixes
- "Ready to edit" when clean
