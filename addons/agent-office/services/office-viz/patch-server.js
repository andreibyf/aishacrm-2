/**
 * Patch script to add:
 * 1. /clear endpoint to reset event queue
 * 2. initializeAllAgents function for standby mode
 * 3. getRoleFromAgentId helper
 * 4. Modified ensureAgent to use role-based keys (prevents duplicate agents)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'src', 'server.js');

let content = fs.readFileSync(serverPath, 'utf-8');

// 1. Add /clear endpoint before startConsumer()
const clearEndpoint = `
// Clear event queue and reset state
app.post('/clear', (req, res) => {
  const oldCount = events.length;
  events.length = 0; // Clear all events
  // Notify clients to reset
  const resetEvent = { 
    type: 'system_reset', 
    message: 'Event queue cleared',
    ts: new Date().toISOString()
  };
  const line = \`data: \${JSON.stringify(resetEvent)}\\n\\n\`;
  for (const sseRes of sseClients.keys()) {
    try { sseRes.write(line); } catch (_) {}
  }
  res.json({ status: 'ok', cleared: oldCount, message: 'Event queue cleared' });
});

// Convenience GET version for browser testing
app.get('/clear', (req, res) => {
  const oldCount = events.length;
  events.length = 0;
  const resetEvent = { 
    type: 'system_reset', 
    message: 'Event queue cleared',
    ts: new Date().toISOString()
  };
  const line = \`data: \${JSON.stringify(resetEvent)}\\n\\n\`;
  for (const sseRes of sseClients.keys()) {
    try { sseRes.write(line); } catch (_) {}
  }
  res.json({ status: 'ok', cleared: oldCount, message: 'Event queue cleared (GET)' });
});

`;

// Check if already patched
if (!content.includes("app.post('/clear'")) {
  content = content.replace(
    /startConsumer\(\)\.then/,
    clearEndpoint + 'startConsumer().then'
  );
  console.log('✓ Added /clear endpoint');
} else {
  console.log('- /clear endpoint already exists');
}

// 2. Add getRoleFromAgentId helper after getAgentColor
const getRoleHelper = `
    // Extract role from agentId (e.g., "ops_manager:tenant123" -> "ops_manager")
    function getRoleFromAgentId(agentId) {
      return agentId.split(':')[0];
    }
`;

if (!content.includes('function getRoleFromAgentId')) {
  content = content.replace(
    /function getAgentColor\(agentId\) \{[^}]+\}/,
    (match) => match + '\n' + getRoleHelper
  );
  console.log('✓ Added getRoleFromAgentId helper');
} else {
  console.log('- getRoleFromAgentId already exists');
}

// 3. Add initializeAllAgents function after agents = {}
const initFn = `
    // ========== INITIALIZE ALL AGENTS ON STANDBY ==========
    function initializeAllAgents() {
      Object.entries(DESK_POSITIONS).forEach(([role, pos]) => {
        const label = role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (!agents[role]) {
          agents[role] = {
            x: pos.x,
            y: pos.y,
            homeX: pos.x,
            homeY: pos.y,
            facing: 'right',
            status: 'idle',
            carrying: false,
            label: label,
            queue: [],
            busy: false
          };
        }
      });
      if (typeof renderAgents === 'function') renderAgents();
      if (document.getElementById('agent-count')) {
        document.getElementById('agent-count').innerText = Object.keys(agents).length;
      }
      log('All agents initialized on standby');
    }
`;

if (!content.includes('function initializeAllAgents')) {
  // Add after AGENT_COLORS definition
  content = content.replace(
    /(const agents = \{\};)/,
    '$1\n' + initFn
  );
  console.log('✓ Added initializeAllAgents function');
} else {
  console.log('- initializeAllAgents already exists');
}

// 4. Modify ensureAgent to use role-based key
if (content.includes('function ensureAgent(agentId, name)') && !content.includes('getRoleFromAgentId(agentId)')) {
  content = content.replace(
    /function ensureAgent\(agentId, name\) \{\s*\n\s*if \(!agents\[agentId\]\) \{/,
    `function ensureAgent(agentId, name) {
      // Use role as key to prevent duplicate agents for same role with different tenants
      const role = getRoleFromAgentId(agentId);
      if (!agents[role]) {`
  );
  // Also update the assignment
  content = content.replace(
    /agents\[agentId\] = \{/g,
    (match, offset) => {
      // Only replace in ensureAgent context (check nearby)
      const context = content.substring(offset - 100, offset);
      if (context.includes('getRoleFromAgentId')) {
        return 'agents[role] = {';
      }
      return match;
    }
  );
  // Update return statement
  content = content.replace(
    /return agents\[agentId\];/,
    'return agents[role];'
  );
  console.log('✓ Modified ensureAgent to use role-based keys');
} else {
  console.log('- ensureAgent already uses role-based keys (or not found)');
}

// 5. Add system_reset handler in handleEvent
const resetHandler = `
      // ========== SYSTEM RESET ==========
      if (evt.type === 'system_reset') {
        log('[SYSTEM] Reset - clearing state and reinitializing agents');
        inboxTasks = [];
        outboxTasks = [];
        Object.keys(deskStacks).forEach(k => deskStacks[k] = []);
        // Reset all agents to idle at their desks
        Object.values(agents).forEach(agent => {
          agent.queue = [];
          agent.busy = false;
          agent.carrying = false;
          agent.status = 'idle';
          agent.x = agent.homeX;
          agent.y = agent.homeY;
        });
        renderAgents();
        renderStacks();
        renderLists();
        eventCount = 0;
        document.getElementById('event-count').innerText = '0';
        return;
      }
`;

if (!content.includes("evt.type === 'system_reset'")) {
  content = content.replace(
    /function handleEvent\(evt\) \{\s*\n\s*eventCount\+\+;/,
    `function handleEvent(evt) {
      eventCount++;
${resetHandler}
`
  );
  console.log('✓ Added system_reset handler');
} else {
  console.log('- system_reset handler already exists');
}

// 6. Add init call before SSE connection
const initCall = `
    // Initialize all agents on standby
    setTimeout(() => {
      initializeAllAgents();
      log('Office ready - all agents on standby');
    }, 100);
`;

if (!content.includes('initializeAllAgents()')) {
  content = content.replace(
    /const es = new EventSource/,
    initCall + '\n    const es = new EventSource'
  );
  console.log('✓ Added initializeAllAgents() call');
} else {
  console.log('- initializeAllAgents() call already exists');
}

// 7. Fix the startup to not exit on Kafka failure
if (content.includes('process.exit(1)')) {
  content = content.replace(
    /startConsumer\(\)\.then\(\(\) => \{\s*\n\s*app\.listen\(PORT, \(\) => \{\s*\n\s*console\.log\(\`\[office-viz\] listening[^`]+\`\);\s*\n\s*\}\);\s*\n\}\)\.catch\(\(e\) => \{\s*\n\s*console\.error\('\[office-viz\] consumer fatal', e\);\s*\n\s*process\.exit\(1\);\s*\n\}\);/,
    `// Handle any unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[office-viz] Unhandled Rejection:', reason?.message || reason);
});

// Start HTTP server first
const server = app.listen(PORT, () => {
  console.log(\`[office-viz] listening on :\${PORT} bus=\${BUS_TYPE}\`);
});

// Then try to connect to message bus (non-blocking)
startConsumer().then(() => {
  console.log(\`[office-viz] connected to \${BUS_TYPE}\`);
}).catch((e) => {
  console.error('[office-viz] consumer failed to connect (events will only come from /test endpoints)', e.message);
  // Don't exit - the HTTP server is still useful for manual testing
});`
  );
  console.log('✓ Fixed startup to not exit on Kafka failure');
} else {
  console.log('- Startup already fixed');
}

fs.writeFileSync(serverPath, content);
console.log('\n✅ Patch complete! File saved.');
