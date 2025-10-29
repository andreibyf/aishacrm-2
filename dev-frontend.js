#!/usr/bin/env node
/**
 * Frontend Development Server Wrapper with Auto-Restart
 * 
 * Monitors the Vite frontend server and auto-restarts on crashes:
 * - Max 5 restarts per minute (frontend crashes are less common)
 * - 3 second cooldown between restarts
 * - Automatic exit if restart limit exceeded
 */

import { spawn } from 'child_process';
import process from 'process';

// Restart policy configuration
const MAX_RESTARTS_PER_MINUTE = 5;
const RESTART_COOLDOWN_MS = 3000; // 3 seconds
const RESTART_WINDOW_MS = 60000; // 1 minute

// State tracking
let viteProcess = null;
let restartTimestamps = [];
let lastRestartTime = 0;

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
    log('The frontend server keeps crashing. Check the error logs above.', colors.yellow);
    log('Fix the error and restart manually: npm run dev', colors.yellow);
    process.exit(1);
  }
}

function startVite() {
  const now = Date.now();
  const timeSinceLastRestart = now - lastRestartTime;
  
  // Enforce cooldown period
  if (timeSinceLastRestart < RESTART_COOLDOWN_MS && lastRestartTime > 0) {
    const remaining = Math.ceil((RESTART_COOLDOWN_MS - timeSinceLastRestart) / 1000);
    log(`⏳ Restart cooldown active (${remaining}s remaining)`, colors.yellow);
    setTimeout(startVite, RESTART_COOLDOWN_MS - timeSinceLastRestart);
    return;
  }
  
  // Check restart limits
  checkRestartLimit();
  
  // Track restart
  restartTimestamps.push(now);
  lastRestartTime = now;
  
  if (restartTimestamps.length === 1) {
    log('🚀 Starting Vite frontend server...', colors.green);
  } else {
    log(`🔄 Restarting frontend (${restartTimestamps.length}/${MAX_RESTARTS_PER_MINUTE})...`, colors.cyan);
  }
  
  viteProcess = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });
  
  viteProcess.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      log('✓ Frontend stopped gracefully', colors.green);
      process.exit(0);
    } else if (code !== 0 && code !== null) {
      log(`⚠️  Frontend exited with code ${code}`, colors.yellow);
      log('Auto-restarting in 3 seconds...', colors.cyan);
      setTimeout(startVite, RESTART_COOLDOWN_MS);
    }
  });
  
  viteProcess.on('error', (error) => {
    log(`❌ Failed to start frontend: ${error.message}`, colors.red);
    setTimeout(startVite, RESTART_COOLDOWN_MS);
  });
}

// Handle process termination
process.on('SIGINT', () => {
  log('\n👋 Shutting down frontend...', colors.yellow);
  if (viteProcess) {
    viteProcess.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  log('\n👋 Shutting down frontend...', colors.yellow);
  if (viteProcess) {
    viteProcess.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1000);
});

// Start initial server
log('🎯 Frontend auto-restart wrapper started', colors.green);
log(`📋 Restart policy: Max ${MAX_RESTARTS_PER_MINUTE} restarts per minute, ${RESTART_COOLDOWN_MS/1000}s cooldown`, colors.gray);
log('Note: Vite has built-in HMR for file changes - this wrapper only handles crashes', colors.gray);
startVite();
