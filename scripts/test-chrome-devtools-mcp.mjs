#!/usr/bin/env node
/**
 * Verification test for chrome-devtools-mcp installation.
 *
 * Asserts:
 *   1. claude_desktop_config.json parses and contains the chrome-devtools entry
 *      with the expected command + args.
 *   2. The MCP server can be spawned, completes a JSON-RPC `initialize`
 *      handshake, responds to `tools/list`, and exposes a non-empty toolset.
 *
 * Run:  node scripts/test-chrome-devtools-mcp.mjs
 * Exit: 0 = all checks passed, 1 = any failure.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(
  process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
  'Claude',
  'claude_desktop_config.json'
);

const tests = [];
const fail = (name, msg) => {
  tests.push({ name, ok: false, msg });
  console.error(`FAIL  ${name}\n      ${msg}`);
};
const pass = (name, msg = '') => {
  tests.push({ name, ok: true, msg });
  console.log(`PASS  ${name}${msg ? `  (${msg})` : ''}`);
};

// ---------- 1. config shape ----------
let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  pass('config parses as JSON', CONFIG_PATH);
} catch (e) {
  fail('config parses as JSON', `${CONFIG_PATH}: ${e.message}`);
  process.exit(1);
}

const entry = cfg?.mcpServers?.['chrome-devtools'];
if (!entry) {
  fail('chrome-devtools entry exists', 'missing mcpServers["chrome-devtools"]');
  process.exit(1);
}
pass('chrome-devtools entry exists');

if (!entry.command || typeof entry.command !== 'string') {
  fail('entry.command is a string', JSON.stringify(entry.command));
} else {
  pass('entry.command is a string', entry.command);
}

if (!Array.isArray(entry.args) || !entry.args.some((a) => /chrome-devtools-mcp/.test(a))) {
  fail('entry.args references chrome-devtools-mcp', JSON.stringify(entry.args));
} else {
  pass('entry.args references chrome-devtools-mcp');
}

// ---------- 2. live MCP handshake ----------
console.log('\nSpawning MCP server for handshake...');

const child = spawn(entry.command, entry.args, {
  env: { ...process.env, ...(entry.env || {}) },
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
});

let stdoutBuf = '';
let stderrBuf = '';
const responses = new Map(); // id -> resolve

child.stdout.on('data', (chunk) => {
  stdoutBuf += chunk.toString('utf8');
  // MCP framing on stdio = newline-delimited JSON
  let nl;
  while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && responses.has(msg.id)) {
        responses.get(msg.id)(msg);
        responses.delete(msg.id);
      }
    } catch {
      /* ignore non-JSON banner lines */
    }
  }
});
child.stderr.on('data', (c) => (stderrBuf += c.toString('utf8')));

const send = (msg) =>
  new Promise((resolve, reject) => {
    if (msg.id != null) responses.set(msg.id, resolve);
    child.stdin.write(JSON.stringify(msg) + '\n', (err) => {
      if (err) reject(err);
      if (msg.id == null) resolve(null); // notifications: no reply
    });
  });

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

let exitCode = 0;
try {
  // initialize
  const initRes = await withTimeout(
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'aishacrm-mcp-smoke', version: '1.0.0' },
      },
    }),
    60_000, // first run downloads npm package — generous
    'initialize'
  );

  if (initRes?.result?.serverInfo?.name) {
    pass('initialize handshake', `serverInfo.name=${initRes.result.serverInfo.name}`);
  } else if (initRes?.error) {
    fail('initialize handshake', `error: ${JSON.stringify(initRes.error)}`);
    throw new Error('init failed');
  } else {
    fail('initialize handshake', `unexpected: ${JSON.stringify(initRes)}`);
    throw new Error('init failed');
  }

  // initialized notification
  await send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  // tools/list
  const toolsRes = await withTimeout(
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    15_000,
    'tools/list'
  );

  const tools = toolsRes?.result?.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    pass('tools/list returns tools', `${tools.length} tools, e.g. ${tools.slice(0, 3).map((t) => t.name).join(', ')}`);
  } else {
    fail('tools/list returns tools', JSON.stringify(toolsRes));
  }
} catch (e) {
  fail('MCP handshake', e.message);
  exitCode = 1;
} finally {
  child.kill('SIGTERM');
  // small grace window for shutdown
  await new Promise((r) => setTimeout(r, 500));
  if (!child.killed) child.kill('SIGKILL');
}

// ---------- summary ----------
const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} checks passed`);
if (failed.length) {
  console.error('\nFailures:');
  failed.forEach((t) => console.error(`  - ${t.name}: ${t.msg}`));
  if (stderrBuf.trim()) console.error('\nMCP stderr:\n' + stderrBuf);
  exitCode = 1;
}
process.exit(exitCode);
