# Redis Caching Audit Workflow

Perform a Redis caching audit:
1. Identify all keys used in the codebase.
2. Identify TTL usage and missing TTLs.
3. Identify inconsistent key prefixes.
4. Identify opportunities for caching expensive queries.
5. Identify stale cache risks.
6. Identify missing invalidation logic.
7. Suggest a unified caching strategy.
This keeps your caching layer clean and predictable.
