---
description: Standards for Redis memory and cache usage.
---

# Redis Standards

When generating Redis code:
- Use two Redis instances: memory (6379) and cache (6380).
- Use JSON or msgpack for structured values.
- Always set TTL for cache keys.
- Use prefixing: app:cache:* and app:memory:*.
- Avoid blocking commands.
- Use pipelines for multi-key operations.
- Handle Redis errors gracefully.
- Follow folder structure: src/redis, src/services/redis.
- Write clear comments for complex logic.
- Ensure proper connection management (retries, timeouts).