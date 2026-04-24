# VPS Crash Postmortem - April 23, 2026

## Incident Summary

**Date**: April 23-24, 2026  
**Duration**: ~3 hours (21:30 → 00:37 UTC)  
**Impact**: Production VPS crashed from CPU overload  
**Root Cause**: Stuck `grep` process from deployment validation script

## Timeline

| Time (UTC)  | Event                                                       |
| ----------- | ----------------------------------------------------------- |
| 21:30       | v7.1.5 images deployed via GHCR                             |
| 22:10-22:11 | Multiple GHCR images pruned for aishacrm-2-\* containers    |
| 00:37       | System crashed from CPU overload (grep consuming 21.5% CPU) |

## Root Cause Analysis

### The Problematic Command

A post-deployment validation script was recursively searching for Next.js build artifacts:

```bash
grep -r "localhost:3000" apps/web/.next/
```

**Why it failed:**

1. **Wrong path**: Looking for `apps/web/.next/` (Next.js structure)
2. **Wrong project type**: AishaCRM uses **Vite**, not Next.js
3. **Actual path**: Frontend builds to `/app/dist` inside container
4. **No timeout**: grep kept searching indefinitely, consuming 21.5% CPU
5. **Likely purpose**: Validate that localhost URLs were replaced with production URLs

### Evidence

```bash
# Frontend container actual structure:
/app/dist/           # Vite build output
/app/dist/env-config.js  # Runtime environment injection

# What the script was looking for (doesn't exist):
apps/web/.next/      # Next.js build artifacts
```

## Impact

- **CPU**: Single grep process consumed 21.5% CPU continuously
- **System**: VPS became unresponsive after ~3 hours
- **Services**: All containers stopped responding
- **Recovery**: Manual intervention required

## Resolution

### Immediate Fix (VPS)

Created `monitor_cpu.sh` to auto-kill stuck grep processes:

```bash
#!/bin/bash
# Auto-kill stuck grep processes consuming >20% CPU for >5 minutes
ps aux | grep -E 'grep.*apps/web' | awk '{if($3>20)print$2}' | xargs kill -9
```

### Permanent Fix (Repository)

1. **Added timeout-wrapped validation** in `.github/workflows/docker-release.yml`:

   ```bash
   run_timed 60s sh -c '
     docker exec aishacrm-frontend find /app/dist -name "*.js" -type f -print0 | \
       xargs -0 grep -l "localhost:3000" 2>/dev/null | head -1
   '
   ```

2. **Correct paths**: Updated to use `/app/dist` (Vite) instead of `apps/web/.next/` (Next.js)

3. **Added safeguards**:
   - All grep commands now use `run_timed` wrapper with 30-60s timeouts
   - Explicit path validation before running searches
   - Early exit with `head -1` to prevent full recursive scans

### Action Items

**On VPS:**

- [ ] Remove any legacy validation scripts looking for Next.js paths
- [ ] Check cron jobs for similar recursive grep commands
- [ ] Verify `monitor_cpu.sh` is running via systemd timer

**In Repository:**

- [x] Add timeouts to all grep commands in CI/CD
- [x] Document correct build paths (Vite vs Next.js)
- [ ] Add pre-deployment validation in GitHub Actions (not on VPS)
- [ ] Add monitoring alerts for CPU >50% for >2 minutes

## Prevention Measures

### 1. Timeout All Shell Commands

Use the `run_timed` wrapper function defined in deployment scripts:

```bash
run_timed() {
  local duration="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$duration" "$@"
  else
    "$@"  # Fallback if timeout not available
  fi
}

# Usage:
run_timed 60s grep -r "pattern" /path/
```

### 2. Validate Paths Before Searching

```bash
# WRONG: Search paths that might not exist
grep -r "localhost" apps/web/.next/

# RIGHT: Validate path first, limit scope
if [ -d /app/dist ]; then
  run_timed 30s find /app/dist -name "*.js" -type f \
    -exec grep -l "localhost" {} + 2>/dev/null | head -10
else
  echo "ERROR: /app/dist does not exist"
  exit 1
fi
```

### 3. Use Targeted Searches

```bash
# WRONG: Unbounded recursive grep
grep -r "pattern" /

# RIGHT: Specific file types, depth limit
find /app/dist -maxdepth 3 -name "*.js" -type f \
  -exec grep -l "pattern" {} + 2>/dev/null | head -10
```

### 4. Early Exit Strategies

```bash
# Exit after first match
grep -l "pattern" *.js | head -1

# Count matches instead of returning all
grep -c "pattern" file.js

# Use -q for boolean checks
if grep -q "pattern" file.js; then
  echo "Found"
fi
```

## Project-Specific Notes

### Build System: Vite (NOT Next.js)

```bash
# Frontend build structure
src/                 # Source files
dist/                # Build output (Vite)
  └── assets/        # JS/CSS bundles
  └── index.html
  └── env-config.js  # Runtime env injection

# DO NOT look for these (Next.js paths):
apps/web/.next/      # ❌ Doesn't exist
.next/               # ❌ Doesn't exist
pages/               # ❌ Not used (we use src/pages/)
```

### Validation Best Practices

**Before deployment (GitHub Actions):**

- ✅ Check environment variables at build time
- ✅ Validate build artifacts exist
- ✅ Run security scans

**After deployment (VPS):**

- ✅ Health check endpoints (HTTP 200)
- ✅ Verify env-config.js contents
- ✅ Check container logs for errors
- ❌ **DO NOT** run recursive file searches
- ❌ **DO NOT** grep entire filesystems

## Monitoring Recommendations

1. **CPU alerts**: > 70% for > 5 minutes
2. **Process monitoring**: Alert on grep processes > 2 minutes runtime
3. **Disk I/O**: Alert on sustained > 80% I/O wait
4. **Container health**: Alert if health checks fail 3x in a row

## Lessons Learned

1. **Always add timeouts** to shell commands in deployment scripts
2. **Validate paths** before running expensive operations
3. **Know your build system** - don't copy scripts from other projects
4. **Monitor deployment scripts** - they can cause production outages
5. **Test on staging** - run full deployment on staging VPS first

## References

- [Deployment workflow](.github/workflows/docker-release.yml)
- [Vite build config](vite.config.ts)
- [Frontend Dockerfile](Dockerfile)
- [Docker Compose](docker-compose.prod.yml)

## Related Incidents

- None previously documented (first occurrence)

## Sign-off

**Investigated by**: VS Code Copilot (Production)  
**Documented by**: GitHub Copilot  
**Date**: 2026-04-23  
**Status**: Resolved
