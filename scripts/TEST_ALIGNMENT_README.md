# Test Alignment Report Script

A comprehensive Node.js script that analyzes the codebase to generate detailed test alignment reports, helping identify coverage gaps, orphaned tests, outdated tests, and other testing issues.

## Features

- **Coverage Gap Analysis** - Identifies source files without corresponding test files
- **Orphaned Test Detection** - Finds test files that reference non-existent source files
- **Outdated Test Detection** - Flags tests that haven't been updated when source files changed
- **Missing Assertion Analysis** - Scans for tests without assertions, skipped tests, and empty test blocks
- **Broken Dependency Checking** - Validates all test imports resolve correctly
- **Multiple Output Formats** - JSON, Markdown, and colored console output
- **CI Integration** - Exit codes for automated build pipelines
- **Flexible Filtering** - Filter by priority, category, or specific issue types

## Usage

### Basic Usage

```bash
# Generate console report (default)
node scripts/test-alignment-report.js

# Generate JSON report
node scripts/test-alignment-report.js --format json > test-report.json

# Generate Markdown report
node scripts/test-alignment-report.js --format markdown > TEST_ALIGNMENT.md
```

### Filtering Options

```bash
# Show only coverage gaps
node scripts/test-alignment-report.js --only-gaps

# Show only high-priority coverage gaps
node scripts/test-alignment-report.js --only-gaps --min-priority high

# Show only orphaned tests
node scripts/test-alignment-report.js --only-orphaned

# Show only outdated tests
node scripts/test-alignment-report.js --only-outdated

# Verbose output with detailed analysis
node scripts/test-alignment-report.js --verbose
```

### CI/CD Integration

```bash
# CI mode: exits with code 1 if critical issues found
node scripts/test-alignment-report.js --ci
```

Add to your CI pipeline:

```yaml
# GitHub Actions example
- name: Check Test Alignment
  run: node scripts/test-alignment-report.js --ci
```

## Output Formats

### Console Output (Default)

Colored terminal output with clear categorization:

```
══════════════════════════════════════════════════
  Test Alignment Report
══════════════════════════════════════════════════

📊 Summary:
  Coverage:           6% (121/600 files)
  Orphaned Tests:     18
  Outdated Tests:     0
  Missing Assertions: 50
  Broken Dependencies: 0

❌ Coverage Gaps (High Priority):
  • backend/lib/aiEngine/index.js (library)
  • backend/routes/webhooks.js (route)
  • src/api/backendUrl.js (api)

⚠️  Outdated Tests (>30 days behind):
  • src/__tests__/Dashboard.test.jsx (70 days behind)

🗑️  Orphaned Tests:
  • backend/__tests__/routes/old-feature.test.js (source deleted)

💡 Recommendations:
  1. Add tests for 428 high-priority files
  2. Update 12 outdated test files
  3. Remove 18 orphaned tests
```

### JSON Output

Structured data for programmatic processing:

```json
{
  "timestamp": "2025-12-20T15:28:51.543Z",
  "summary": {
    "totalSourceFiles": 600,
    "totalTestFiles": 121,
    "coveragePercentage": 6,
    "orphanedTests": 18,
    "outdatedTests": 0,
    "missingAssertions": 50,
    "brokenDependencies": 0
  },
  "coverageGaps": [
    {
      "file": "backend/lib/aiEngine/index.js",
      "path": "backend/lib/aiEngine/index.js",
      "type": "library",
      "priority": "high",
      "lastModified": "2025-12-20",
      "suggestedTestPath": "backend/lib/aiEngine/index.test.js"
    }
  ],
  "orphanedTests": [...],
  "outdatedTests": [...],
  "missingAssertions": [...],
  "brokenDependencies": [...]
}
```

### Markdown Output

Human-readable documentation:

```markdown
# Test Alignment Report

**Generated:** 2025-12-20T15:28:51.543Z

## Summary

| Metric | Value |
|--------|-------|
| Total Source Files | 600 |
| Total Test Files | 121 |
| Coverage | 6% |

## Coverage Gaps

### High Priority

- ❌ `backend/lib/aiEngine/index.js` (library) - No test file
- ❌ `backend/routes/webhooks.js` (route) - No test file

...
```

## Configuration

The script is configured via the `CONFIG` object in the source:

```javascript
const CONFIG = {
  sourcePatterns: [
    'src/**/*.{js,jsx,ts,tsx}',
    'backend/routes/**/*.js',
    'backend/lib/**/*.js',
  ],
  testPatterns: [
    'src/**/*.test.{js,jsx,ts,tsx}',
    'backend/__tests__/**/*.js',
    'tests/**/*.spec.{js,ts}',
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
  ],
  outdatedThresholdDays: 30,
  highPriorityPaths: [
    'backend/routes',
    'src/api',
    'backend/lib',
  ],
};
```

## Priority Levels

Files are categorized by priority:

- **High**: Files in `backend/routes`, `src/api`, `backend/lib`, `src/components`
- **Medium**: Most other source files
- **Low**: Configuration files and utilities

## Test File Mapping

The script intelligently maps source files to test files:

- `src/components/Button.jsx` → `src/components/__tests__/Button.test.jsx`
- `backend/routes/users.js` → `backend/__tests__/routes/users.route.test.js`
- `src/hooks/useAuth.js` → `src/hooks/__tests__/useAuth.test.js`

## Special Test Types

The script recognizes different test categories:

- **Integration Tests** - Tests in `backend/__tests__/integration/`
- **E2E Tests** - Tests in `tests/e2e/`
- **System Tests** - Tests in `backend/__tests__/system/`
- **Feature Tests** - Tests in `backend/__tests__/phase3/`

These are not flagged as orphaned even without direct source file mapping.

## Performance

- Scans 600+ files in < 10 seconds
- Parallel file analysis
- Smart caching for file stats
- Minimal memory footprint

## CLI Options Reference

| Option | Description | Example |
|--------|-------------|---------|
| `--format <type>` | Output format: `console`, `json`, `markdown` | `--format json` |
| `--only-gaps` | Show only coverage gaps | `--only-gaps` |
| `--only-orphaned` | Show only orphaned tests | `--only-orphaned` |
| `--only-outdated` | Show only outdated tests | `--only-outdated` |
| `--min-priority <level>` | Filter by priority: `high`, `medium`, `low` | `--min-priority high` |
| `--ci` | CI mode: exit 1 if critical issues found | `--ci` |
| `--verbose` | Show detailed analysis | `--verbose` |
| `--help` | Show help message | `--help` |

## Exit Codes

- `0` - Success (no critical issues in CI mode)
- `1` - Critical issues found (in CI mode) or error occurred

## Examples

### Generate Weekly Report

```bash
# Generate a comprehensive markdown report for team review
node scripts/test-alignment-report.js --format markdown --verbose > reports/test-alignment-$(date +%Y-%m-%d).md
```

### Focus on High Priority Gaps

```bash
# Identify critical files missing tests
node scripts/test-alignment-report.js --only-gaps --min-priority high
```

### CI Pipeline Integration

```bash
# In your CI/CD pipeline
node scripts/test-alignment-report.js --ci --format json > test-alignment.json

# The script exits with code 1 if there are:
# - High-priority files without tests
# - Broken dependencies in test files
```

### Cleanup Orphaned Tests

```bash
# Generate list of orphaned tests for cleanup
node scripts/test-alignment-report.js --only-orphaned --format json | \
  jq -r '.orphanedTests[].testFile' | \
  xargs rm
```

## Troubleshooting

### "No source files found"

Ensure you're running the script from the repository root:

```bash
cd /path/to/aishacrm-2
node scripts/test-alignment-report.js
```

### Pattern Not Matching

Check that your file patterns in `CONFIG.sourcePatterns` match your file structure. The script uses glob patterns:

- `**` matches any number of directories
- `*` matches any characters except `/`
- `{js,jsx}` matches multiple extensions

### False Positives for Orphaned Tests

Some tests (integration, E2E, system tests) don't map 1:1 to source files. The script recognizes these patterns automatically. If you have custom test patterns, update the `findSourceFile()` function.

## Contributing

To extend the script:

1. **Add new analysis types** - Create new `analyze*()` functions
2. **Support new test frameworks** - Update pattern matching in `findTestFile()`
3. **Custom priority rules** - Modify `getFilePriority()`
4. **New output formats** - Add `generate*Report()` functions

## Related Documentation

- [Required Secrets for Workflow](../docs/workflows/TEST_ALIGNMENT_SECRETS.md) - **Zero custom secrets needed!**
- [Workflow Secrets Reference](../docs/WORKFLOW_SECRETS_REFERENCE.md)
- [Secrets Analysis Summary](../docs/TEST_ALIGNMENT_SECRETS_ANALYSIS.md)
- [Testing Strategy](../docs/TESTING.md)
- [CI/CD Pipeline](../.github/workflows/)
- [Code Quality Standards](../docs/CODE_QUALITY.md)
