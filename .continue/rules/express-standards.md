---
description: Standards for Node 22 + Express backend development.
---

# Express Standards

When generating backend code:
- Use Node 22 features (top-level await, native fetch, structuredClone).
- Use Express Router for modular endpoints.
- Validate input using Zod.
- Use async/await everywhere.
- Never block the event loop.
- Use environment variables via Doppler.
- Follow folder structure: src/server, src/routes, src/controllers, src/services.
- Write clear comments for complex logic.
- Ensure proper error handling with try/catch and Express error middleware. 