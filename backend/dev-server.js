#!/usr/bin/env node
/**
 * Development Server Wrapper with Restart Limiting
 * 
 * Monitors the backend server and enforces restart policies:
 * - Max 10 restarts per minute (prevents infinite crash loops)
 * - 2 second cooldown between restarts (debounces rapid file changes)
 * - Automatic exit if restart limit exceeded (forces developer to fix issue)
 */

import { spawn } from 'child_process';
import { watch } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Restart policy configuration
const MAX_RESTARTS_PER_MINUTE = 10;
const RESTART_COOLDOWN_MS = 2000; // 2 seconds between kill/start cycles
const RESTART_WINDOW_MS = 60000; // 1 minute window
const INITIAL_SUPPRESS_MS = 8000; // suppress fs events for N ms after (re)start
const RESTART_DEBOUNCE_MS = 750; // batch multiple fs events into one restart

// State tracking
let serverProcess = null;
let restartTimestamps = [];
let lastRestartTime = 0;
let isRestarting = false;
let suppressUntil = 0; // suppress watcher events shortly after (re)start
let restartTimer = null; // debounce timer

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[91m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  cyan: '\x1b[96m',
  gray: '\x1b[90m',
};

function log(message, color = colors.reset) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.gray}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

function checkRestartLimit() {
  const now = Date.now();
  
  // Remove timestamps older than 1 minute
  restartTimestamps = restartTimestamps.filter(ts => now - ts < RESTART_WINDOW_MS);
  
  if (restartTimestamps.length >= MAX_RESTARTS_PER_MINUTE) {
    log(`❌ Restart limit exceeded (${MAX_RESTARTS_PER_MINUTE} restarts in 1 minute)`, colors.red);
    log('This usually indicates a crash loop or configuration issue.', colors.yellow);
    log('Fix the error and restart manually: npm run dev', colors.yellow);
    process.exit(1);
  }
}

function startServer() {
  if (isRestarting) return;
  
  const now = Date.now();
  const timeSinceLastRestart = now - lastRestartTime;
  
  // Enforce cooldown period
  if (timeSinceLastRestart < RESTART_COOLDOWN_MS) {
    log(`⏳ Restart cooldown active (${Math.ceil((RESTART_COOLDOWN_MS - timeSinceLastRestart) / 1000)}s remaining)`, colors.yellow);
    return;
  }
  
  // Check restart limits
  checkRestartLimit();
  
  // Track restart
  restartTimestamps.push(now);
  lastRestartTime = now;
  // Suppress spurious file change events during module loading on Windows
  suppressUntil = now + INITIAL_SUPPRESS_MS;
  
  log('🚀 Starting backend server...', colors.green);
  
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
  });
  
  serverProcess.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      // Child was stopped intentionally (likely due to a restart)
      log('✓ Server stopped gracefully', colors.green);
      // Do NOT exit the wrapper here; restartServer schedules the next start
      if (!isRestarting) {
        log('Waiting for file changes to restart...', colors.cyan);
      }
    } else if (code !== 0) {
      log(`⚠️  Server exited with code ${code}`, colors.yellow);
      log('Waiting for file changes to restart...', colors.cyan);
    } else {
      log('ℹ️  Server exited normally', colors.gray);
    }
  });
  
  serverProcess.on('error', (error) => {
    log(`❌ Failed to start server: ${error.message}`, colors.red);
  });
}

function restartServer() {
  if (isRestarting) {
    log('⏳ Restart already in progress, ignoring...', colors.gray);
    return;
  }
  
  isRestarting = true;
  
  if (serverProcess) {
    log('🔄 Restarting server...', colors.cyan);
    
    serverProcess.kill('SIGTERM');
    
    // Wait for process to exit, then start new one
    setTimeout(() => {
      isRestarting = false;
      startServer();
    }, RESTART_COOLDOWN_MS);
  } else {
    isRestarting = false;
    startServer();
  }
}

// Watch for file changes
const watcher = watch(__dirname, { recursive: true }, (eventType, filename) => {
  // Ignore non-JS files, node_modules, and hidden files
  if (!filename || 
      !filename.endsWith('.js') || 
      filename.includes('node_modules') ||
      filename.includes('public') ||
      filename.includes('server-debug.log') ||
      filename.startsWith('.') ||
      filename.includes('dev-server.js')) {
    return;
  }
  // Suppress events immediately after a (re)start to avoid restart storms on Windows
  if (Date.now() < suppressUntil) {
    return;
  }
  
  log(`📝 File changed: ${filename}`, colors.cyan);
  // Debounce restarts to coalesce rapid bursts of fs events
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartServer();
  }, RESTART_DEBOUNCE_MS);
});

// Handle process termination
process.on('SIGINT', () => {
  log('\n👋 Shutting down...', colors.yellow);
  watcher.close();
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  log('\n👋 Shutting down...', colors.yellow);
  watcher.close();
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1000);
});

// Start initial server
log('🎯 Development server wrapper started', colors.green);
log(`📋 Restart policy: Max ${MAX_RESTARTS_PER_MINUTE} restarts per minute, ${RESTART_COOLDOWN_MS/1000}s cooldown`, colors.gray);
startServer();
