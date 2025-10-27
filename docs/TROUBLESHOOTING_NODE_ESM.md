# Node.js ESM Server Troubleshooting Guide

## Why Node Exits in ES Modules and How to Keep It Running

### The Problem

In pure ESM (ECMAScript Modules), Node.js will **exit once the event loop is empty**. If your server "starts" (the listen callback runs) but the process exits immediately, it means nothing is keeping the event loop alive.

### Common Causes of Immediate Exit

1. **HTTP server not actually bound** - Missing `server.listen()` or it's awaited and closed
2. **Top-level await throws** - Startup code throws error and server never stays referenced
3. **Deno-style serve in Node** - No active handles or creating server then immediately closing it
4. **Test/dev environment issues** - Process terminated when stdio closes or no active timers/sockets
5. **Port binding error** - `EADDRINUSE` not handled; process exits

## Robust Patterns for ESM Servers

### Minimal ESM HTTP Server (Node 18+)

```javascript
// package.json
// {
//   "type": "module",
//   "scripts": { "start": "node server.js" }
// }

import http from 'node:http';

const port = process.env.PORT || 3000;

// Create and KEEP a reference to the server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.end('ok');
});

// Important: DO NOT await a promise that stops the server or unref the socket
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

// Avoid accidental exits: handle rejections and exceptions
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
```

**Key Points:**
- ✅ Ensure `server.listen()` is called and you keep the server variable alive
- ✅ Don't call `server.close()` or `unref()` handles
- ✅ No top-level awaits that would throw and abort before listen
- ✅ Handle unhandled rejections and exceptions

### ESM with Express

```javascript
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(port, () => {
  console.log(`Express listening on http://localhost:${port}`);
});

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
```

## Common Gotchas That Cause Immediate Exit

### 1. Top-level await failure

```javascript
// ❌ BAD: If this throws, your code never reaches listen()
const cfg = await loadConfig(); // throws -> process exits

// ✅ GOOD: Wrap in try/catch
try {
  const cfg = await loadConfig();
} catch (err) {
  console.error('Config load failed:', err);
  process.exit(1);
}
```

### 2. Import rejection at startup

```javascript
// Using import('some-module') that rejects at startup
```

### 3. Port binding error not handled

```javascript
// ✅ GOOD: Handle port binding errors
server.on('error', (err) => {
  console.error('Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
    process.exit(1);
  }
});
```

### 4. Using Bun/Deno code that calls process.exit on error

### 5. Docker/Nodemon killing the process

## Debugging Steps

If your server still exits:

1. ✅ **Verify nothing calls `server.close()`**
2. ✅ **Check Docker/Nodemon scripts aren't killing the process**
3. ✅ **Ensure you're not running under a test runner that auto-exits**
4. ✅ **Look for top-level await failures before `listen()` is called**
5. ✅ **Check for unhandled promise rejections in startup code**
6. ✅ **Verify port isn't already in use** - `netstat -ano | findstr :3001` (Windows) or `lsof -i :3001` (Unix)

## Emergency Keep-Alive (Not Recommended)

As a defensive measure, you can keep a timer reference (only if absolutely needed, usually not required if server is bound):

```javascript
// ⚠️ Only use as last resort debugging measure
const keepAlive = setInterval(() => {}, 1 << 30); // large interval
keepAlive.unref?.(); // allow clean exit on SIGTERM if supported
```

**Note:** The correct fix is ensuring the server is actually listening and no fatal errors occur beforehand.

## Our Server Implementation

Our `backend/server.js` follows these best practices:

```javascript
// ✅ Import with http module
import { createServer } from 'http';

// ✅ Keep server reference alive
const server = createServer(app);

// ✅ Proper listen call
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// ✅ Error handling
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// ✅ Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// ✅ Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (pgPool) {
    pgPool.end(() => {
      console.log('PostgreSQL pool closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// ⚠️ Don't export at module level if it prevents listen
export { app, pgPool, server };
```

## Checking If Server Is Actually Running

### PowerShell (Windows)
```powershell
# Check if port is listening
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue

# Test health endpoint
Invoke-RestMethod -Uri "http://localhost:3001/health"

# Check node processes
Get-Process node | Format-Table Id, ProcessName, StartTime
```

### Bash (Unix/Linux/Mac)
```bash
# Check if port is listening
lsof -i :3001

# Test health endpoint
curl http://localhost:3001/health

# Check node processes
ps aux | grep node
```

## Running the Server Correctly

### Development Mode (with auto-reload)
```bash
cd backend
npm run dev
# or
node --watch server.js
```

### Production Mode
```bash
cd backend
npm start
# or
node server.js
```

### Using PowerShell Script (Recommended)
```powershell
cd backend
.\start-server.ps1          # Background with health checks
.\start-server.ps1 -Foreground  # Foreground (Ctrl+C to stop)
```

## Summary

**The server MUST:**
1. Call `server.listen()` and keep the server reference
2. Not call `server.close()` or `unref()`
3. Handle errors properly without exiting before listen
4. Have proper exception/rejection handlers
5. Not use top-level await that throws before listen

**To verify it's running:**
- Check terminal shows "Server listening on port 3001"
- Terminal process stays active (doesn't exit)
- Can connect to `http://localhost:3001/health`
- Port shows as LISTENING in netstat/lsof
