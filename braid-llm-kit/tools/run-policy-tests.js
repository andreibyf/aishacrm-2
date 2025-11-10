#!/usr/bin/env node
/* eslint-env node */
import fs from 'fs';
import { spawnSync } from 'child_process';

// Simple harness: iterate tests/*.test.json; if policy present, run braid-check with policy and assert expected codes
// Exits nonzero on mismatch; prints summary JSON.

import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const kitRoot = path.join(__dirname, '..');
const testDir = path.join(kitRoot, 'tests/');
const files = fs.readdirSync(testDir).filter(f=>f.endsWith('.test.json'));
const results = [];
let failed = 0;

for (const f of files) {
  const full = testDir + f;
  const spec = JSON.parse(fs.readFileSync(full,'utf8'));
  let policyPath = null;
  if (spec.policy) {
    if (typeof spec.policy === 'string') {
      policyPath = spec.policy;
    } else {
      const policyTmp = JSON.stringify(spec.policy);
      const dir = fs.mkdtempSync('policy-');
      const pFile = dir + '/p.json';
      fs.writeFileSync(pFile, policyTmp, 'utf8');
      policyPath = pFile;
    }
  }
  const args = ['tools/braid-check', spec.file];
  if (policyPath) args.push('--policy', policyPath);
  const run = spawnSync('node', args, { encoding: 'utf8', cwd: kitRoot });
  const diagLines = run.stdout.trim().split(/\n+/).filter(Boolean).map(l=>{ try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const expectedCodes = new Set((spec.expect.errors||[]).map(e=>e.code));
  const actualCodes = new Set(diagLines.map(d=>d.code));
  let pass = true;
  for (const c of expectedCodes) if (!actualCodes.has(c)) pass = false;
  // ensure no unexpected errors if expect specifies exact list
  if (pass && spec.expect.strict) {
    for (const c of actualCodes) if (!expectedCodes.has(c)) pass = false;
  }
  if (!pass) failed++;
  results.push({ test: f, file: spec.file, expected: [...expectedCodes], actual: [...actualCodes], exitCode: run.status, pass, stderr: run.stderr?.trim() });
}

const summary = { total: files.length, failed, results };
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(failed ? 1 : 0);
