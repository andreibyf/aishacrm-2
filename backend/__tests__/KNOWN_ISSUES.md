# Known Test Issues

## users.listing-retrieval.test.js - Hangs at Section 2.2

**Status**: KNOWN ISSUE (as of 2026-02-06)  
**Impact**: Blocks full regression test suite  
**Workaround**: Run tests excluding users tests

### Symptoms

Test execution hangs indefinitely after completing "Section 2.2: User Listing & Retrieval Endpoints":

```
ok 172 - users.js - Section 2.2: User Listing & Retrieval Endpoints
  ---
  duration_ms: 5439.37786
  type: 'suite'
  ...
[HANGS HERE - never completes]
```

### Attempted Solutions

1. ❌ Unix `timeout` command - doesn't work on Windows host
2. ❌ Node.js `--test-timeout` flag - timeout not triggering
3. ❌ Multiple timeout values (30s, 60s, 120s) - still hangs

### Root Cause

Unknown - requires deeper investigation. Likely:
- Unclosed database connection
- Hanging HTTP request
- Event loop not emptying
- Async operation without proper cleanup

### Workaround

Skip users tests when running regression suite:

```bash
# Run all tests EXCEPT users-related files
docker exec aishacrm-backend sh -c "
  find __tests__ -name '*.test.js' ! -name 'users*' -type f | \
  xargs node --test --test-timeout=60000 --test-reporter tap
"
```

### Next Steps

1. Isolate the exact test causing the hang
2. Add connection cleanup/teardown
3. Check for event emitters not being removed
4. Verify all async operations have timeout guards
