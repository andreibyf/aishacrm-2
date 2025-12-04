#!/usr/bin/env node

/**
 * Phase 3 Verification Runner
 * 
 * Executes all Phase 3 verification tests and generates a comprehensive report.
 * 
 * Usage:
 *   node scripts/run_phase3_verification.js
 * 
 * Output:
 *   - Console summary
 *   - artifacts/phase3_verification_report.json
 *   - artifacts/phase3_verification_report.md
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKEND_DIR = join(__dirname, '..');
const ARTIFACTS_DIR = join(BACKEND_DIR, 'artifacts');

// Section metadata for reporting
const SECTIONS = {
  A: {
    name: 'Trigger Engine',
    file: '__tests__/phase3/section-a-trigger-engine.test.js',
    description: 'AI Triggers Worker with Supabase JS compliance',
  },
  B: {
    name: 'Suggestion Engine',
    file: '__tests__/phase3/section-b-suggestion-engine.test.js',
    description: 'AI Brain integration and suggestion generation',
  },
  C: {
    name: 'Suggestion Queue',
    file: '__tests__/phase3/section-c-suggestion-queue.test.js',
    description: 'Database schema and API endpoints',
  },
  D: {
    name: 'Review UI',
    file: '__tests__/phase3/section-d-review-ui.test.js',
    description: 'Frontend components for suggestion review',
  },
  E: {
    name: 'Safe Apply Engine',
    file: '__tests__/phase3/section-e-safe-apply.test.js',
    description: 'Braid mode=apply_allowed execution',
  },
  F: {
    name: 'Integrations',
    file: '__tests__/phase3/section-f-integrations.test.js',
    description: 'Workflow, Email, CallFluent, Thoughtly layers',
  },
  G: {
    name: 'Telemetry',
    file: '__tests__/phase3/section-g-telemetry.test.js',
    description: 'Observability and event logging',
  },
  H: {
    name: 'E2E Flow',
    file: '__tests__/phase3/section-h-e2e.test.js',
    description: 'End-to-end trigger → apply → telemetry',
  },
};

/**
 * Run a single test file and capture results
 */
function runTestFile(testFile) {
  return new Promise((resolve) => {
    const fullPath = join(BACKEND_DIR, testFile);
    
    if (!existsSync(fullPath)) {
      resolve({
        status: 'skipped',
        reason: 'Test file not found',
        tests: 0,
        passed: 0,
        failed: 0,
        duration: 0,
        output: '',
      });
      return;
    }

    const startTime = Date.now();
    const child = spawn('node', ['--test', fullPath], {
      cwd: BACKEND_DIR,
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 120000, // 2 minute timeout per section
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        status: 'error',
        reason: err.message,
        tests: 0,
        passed: 0,
        failed: 0,
        duration: Date.now() - startTime,
        output: stderr,
      });
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const output = stdout + stderr;

      // Parse test output for counts
      const passMatch = output.match(/# pass (\d+)/);
      const failMatch = output.match(/# fail (\d+)/);
      const testsMatch = output.match(/# tests (\d+)/);

      const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
      const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
      const tests = testsMatch ? parseInt(testsMatch[1], 10) : passed + failed;

      resolve({
        status: code === 0 ? 'pass' : 'fail',
        reason: code === 0 ? null : `Exit code: ${code}`,
        tests,
        passed,
        failed,
        duration,
        output,
      });
    });
  });
}

/**
 * Generate Markdown report from results
 */
function generateMarkdownReport(report) {
  const lines = [
    '# Phase 3 Verification Report',
    '',
    `**Generated:** ${report.timestamp}`,
    `**Overall Status:** ${report.status.toUpperCase()}`,
    `**Total Duration:** ${report.totalDuration}ms`,
    '',
    '## Summary',
    '',
    '| Section | Status | Tests | Passed | Failed | Duration |',
    '|---------|--------|-------|--------|--------|----------|',
  ];

  for (const [section, data] of Object.entries(report.sections)) {
    const statusIcon = data.status === 'pass' ? '✅' : data.status === 'fail' ? '❌' : '⏭️';
    lines.push(
      `| ${section}: ${data.name} | ${statusIcon} ${data.status} | ${data.tests} | ${data.passed} | ${data.failed} | ${data.duration}ms |`
    );
  }

  lines.push('', '## Section Details', '');

  for (const [section, data] of Object.entries(report.sections)) {
    lines.push(`### Section ${section}: ${data.name}`);
    lines.push('');
    lines.push(`**Description:** ${data.description}`);
    lines.push('');
    lines.push(`**Status:** ${data.status.toUpperCase()}`);
    
    if (data.reason) {
      lines.push(`**Reason:** ${data.reason}`);
    }
    
    lines.push('');
    lines.push('**Metrics:**');
    lines.push(`- Total Tests: ${data.tests}`);
    lines.push(`- Passed: ${data.passed}`);
    lines.push(`- Failed: ${data.failed}`);
    lines.push(`- Duration: ${data.duration}ms`);
    lines.push('');

    if (data.status === 'fail' && data.output) {
      lines.push('<details>');
      lines.push('<summary>Test Output (click to expand)</summary>');
      lines.push('');
      lines.push('```');
      // Truncate very long output
      const truncatedOutput = data.output.length > 5000 
        ? data.output.substring(0, 5000) + '\n... (truncated)'
        : data.output;
      lines.push(truncatedOutput);
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('*Report generated by Phase 3 Verification Runner*');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                 Phase 3 Verification Runner                    ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Ensure artifacts directory exists
  if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const report = {
    phase: 3,
    timestamp: new Date().toISOString(),
    status: 'pass',
    totalDuration: 0,
    sections: {},
  };

  const startTime = Date.now();

  // Run each section
  for (const [section, config] of Object.entries(SECTIONS)) {
    console.log(`Running Section ${section}: ${config.name}...`);
    
    const result = await runTestFile(config.file);
    
    report.sections[section] = {
      name: config.name,
      description: config.description,
      ...result,
    };

    // Update overall status
    if (result.status !== 'pass' && result.status !== 'skipped') {
      report.status = 'fail';
    }

    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
    console.log(`  ${icon} ${result.status.toUpperCase()} - ${result.passed}/${result.tests} passed (${result.duration}ms)`);
  }

  report.totalDuration = Date.now() - startTime;

  // Write JSON report
  const jsonPath = join(ARTIFACTS_DIR, 'phase3_verification_report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log('');
  console.log(`JSON report saved to: ${jsonPath}`);

  // Write Markdown report
  const mdPath = join(ARTIFACTS_DIR, 'phase3_verification_report.md');
  writeFileSync(mdPath, generateMarkdownReport(report));
  console.log(`Markdown report saved to: ${mdPath}`);

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY                                ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const data of Object.values(report.sections)) {
    totalTests += data.tests;
    totalPassed += data.passed;
    totalFailed += data.failed;
  }

  console.log(`Overall Status: ${report.status.toUpperCase()}`);
  console.log(`Total Tests:    ${totalTests}`);
  console.log(`Passed:         ${totalPassed}`);
  console.log(`Failed:         ${totalFailed}`);
  console.log(`Duration:       ${report.totalDuration}ms`);
  console.log('');

  // Exit with appropriate code
  process.exit(report.status === 'pass' ? 0 : 1);
}

main().catch((err) => {
  console.error('Verification runner error:', err);
  process.exit(1);
});
