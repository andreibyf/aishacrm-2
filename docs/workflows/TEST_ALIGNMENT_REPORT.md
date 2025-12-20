# Test Alignment Report Workflow

## Overview

Automated weekly test coverage analysis that generates comprehensive reports on test alignment across the AiSHA CRM codebase and creates GitHub issues to track improvements.

## Features

### Automated Analysis
- **Coverage Gaps**: Identifies source files without corresponding test files
- **Orphaned Tests**: Detects test files whose source files no longer exist
- **Outdated Tests**: Finds tests that haven't been updated in 30+ days after source changes
- **Missing Assertions**: Locates test files without `expect()` or `assert()` statements
- **Broken Dependencies**: Identifies tests with broken import statements

### Workflow Execution
- **Scheduled**: Runs every Monday at 06:00 UTC
- **Manual Trigger**: Can be triggered manually via GitHub Actions
- **PR Validation**: Automatically runs on PRs that modify test files

### Issue Management
- **Single Recurring Issue**: Creates one tracking issue that gets updated weekly
- **Severity-Based Labels**: Applies `critical`, `high`, `medium`, or `low` labels based on findings
- **Auto-Close**: Automatically closes the issue when all tests are aligned

## Usage

### Manual Execution via GitHub Actions
1. Go to the **Actions** tab in GitHub
2. Select **Test Alignment Report** workflow
3. Click **Run workflow**
4. View results in the workflow summary and generated issue

### Manual Execution via Command Line
```bash
# Generate JSON report
node scripts/test-alignment-report.cjs --format json

# Generate Markdown report
node scripts/test-alignment-report.cjs --format markdown
```

## Report Structure

### Summary Metrics
- **Coverage**: % of source files with tests (target: ≥80%)
- **Coverage Gaps**: Source files without tests
- **Orphaned Tests**: Tests without source files
- **Outdated Tests**: Tests 30+ days behind source
- **Missing Assertions**: Tests without assertions
- **Broken Dependencies**: Tests with broken imports

### Severity Levels
- **Critical**: Broken dependencies OR coverage <40%
- **High**: Total issues >20
- **Medium**: Total issues 11-20
- **Low**: Total issues 1-10

## File Locations

- **Workflow**: `.github/workflows/test-alignment-report.yml`
- **Script**: `scripts/test-alignment-report.cjs`
- **Documentation**: `docs/workflows/TEST_ALIGNMENT_REPORT.md`
