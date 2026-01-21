import express from 'express';
import { Kafka } from 'kafkajs';
import amqplib from 'amqplib';

const app = express();
const PORT = Number(process.env.PORT || 4010);
const BUS_TYPE = (process.env.BUS_TYPE || 'kafka').toLowerCase();
const MAX_EVENTS = Number(process.env.MAX_EVENTS_IN_MEMORY || 5000);

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'redpanda:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'aisha.telemetry';

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
const RABBIT_EXCHANGE = process.env.RABBIT_EXCHANGE || 'aisha.telemetry';
const RABBIT_BINDING_KEY = process.env.RABBIT_BINDING_KEY || 'events';

const events = [];
const sseClients = new Set();

function pushEvent(evt) {
  events.push(evt);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const line = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch (_) {}
  }
}

async function startConsumer() {
  if (BUS_TYPE === 'rabbit') {
    const conn = await amqplib.connect(RABBIT_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(RABBIT_EXCHANGE, 'topic', { durable: true });
    const q = await ch.assertQueue('', { exclusive: true });
    await ch.bindQueue(q.queue, RABBIT_EXCHANGE, RABBIT_BINDING_KEY);
    await ch.consume(q.queue, (msg) => {
      if (!msg) return;
      try {
        const evt = JSON.parse(msg.content.toString('utf-8'));
        pushEvent(evt);
      } catch (_) {}
      ch.ack(msg);
    });
    return;
  }

  // kafka default
  const kafka = new Kafka({ clientId: 'aisha-office-viz', brokers: KAFKA_BROKERS });
  const consumer = kafka.consumer({ groupId: 'aisha-office-viz' });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const evt = JSON.parse(message.value.toString('utf-8'));
        pushEvent(evt);
      } catch (_) {}
    }
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', events: events.length, clients: sseClients.size });
});

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>AiSHA Office Viz</title>
  <style>
    :root {
      --bg-color: #0d1117;
      --floor-color: #161b22;
      --floor-grid: #21262d;
      --desk-color: #30363d;
      --desk-border: #8b949e;
      --chair-color: #238636;
      --text-color: #c9d1d9;
      --accent-color: #58a6ff;
    }

    * { box-sizing: border-box; }
    
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      margin: 0; 
      padding: 20px; 
      background: var(--bg-color); 
      color: var(--text-color); 
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    h1 { 
      margin: 0 0 8px 0; 
      color: var(--accent-color); 
      font-size: 1.5rem; 
      text-transform: uppercase; 
      letter-spacing: 2px;
    }
    
    .stats-bar {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      background: #21262d;
      padding: 10px 20px;
      border-radius: 8px;
      border: 1px solid #30363d;
      font-size: 0.9rem;
    }
    
    .stat-value { color: #fff; font-weight: bold; margin-left: 5px; }

    /* Office Floor */
    .office-floor { 
      position: relative; 
      width: 1000px; 
      height: 600px; 
      background-color: var(--floor-color);
      background-image: 
        linear-gradient(var(--floor-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--floor-grid) 1px, transparent 1px);
      background-size: 40px 40px;
      border-radius: 4px; 
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      overflow: hidden;
      border: 1px solid #30363d;
    }

    /* Furniture (Side View) */
    .desk-group {
      position: absolute;
      transform: translate(-50%, -50%);
      display: flex; flex-direction: column; align-items: center;
      width: 120px;
      z-index: 5; /* Behind agents (z=20) */
    }

    .desk {
      width: 100px;
      height: 60px; /* Height of the desk structure */
      position: relative;
    }
    
    /* Table Surface */
    .desk-surface {
      position: absolute;
      bottom: 20px; /* Table height */
      left: 0;
      width: 100%;
      height: 8px;
      background: #30363d;
      border-radius: 4px;
      box-shadow: 0 4px 4px rgba(0,0,0,0.3);
      z-index: 2;
    }
    
    /* Table Legs */
    .desk-leg {
      position: absolute;
      bottom: 0;
      width: 6px;
      height: 20px;
      background: #8b949e;
      border-radius: 2px;
    }
    .desk-leg.left { left: 10px; }
    .desk-leg.right { right: 10px; }

    /* Computer Monitor */
    .monitor {
      position: absolute;
      bottom: 28px; /* On top of surface */
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 28px;
      background: #0d1117;
      border: 2px solid #58a6ff;
      border-radius: 4px;
      box-shadow: 0 0 10px rgba(88, 166, 255, 0.2);
      z-index: 1;
    }
    /* Monitor Stand */
    .monitor::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 12px;
      height: 6px;
      background: #8b949e;
    }
    /* Screen Glow */
    .monitor::before {
      content: '';
      position: absolute;
      top: 4px; left: 4px; right: 4px; bottom: 4px;
      background: linear-gradient(135deg, rgba(88, 166, 255, 0.1), rgba(88, 166, 255, 0.05));
    }

    /* Side View Chair */
    .chair {
      position: absolute;
      bottom: 0;
      right: -10px; /* Tucked behind/side */
      width: 30px;
      height: 50px;
      z-index: 0;
    }
    .chair-seat {
      position: absolute;
      bottom: 15px;
      left: 0;
      width: 25px;
      height: 6px;
      background: #238636;
      border-radius: 2px;
    }
    .chair-back {
      position: absolute;
      bottom: 15px;
      right: 0;
      width: 6px;
      height: 35px;
      background: #238636;
      border-radius: 4px;
    }
    .chair-leg {
      position: absolute;
      bottom: 0;
      left: 10px;
      width: 4px;
      height: 15px;
      background: #484f58;
    }
    
    .desk-label {
      margin-top: 4px;
      font-size: 0.7rem; color: #8b949e;
      text-transform: uppercase; letter-spacing: 0.5px;
      white-space: nowrap;
      text-align: center;
    }

    /* Zones */
    .zone {
      position: absolute; transform: translate(-50%, -50%);
      width: 80px; height: 80px;
      border: 2px dashed #484f58; border-radius: 8px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #8b949e; font-weight: bold; font-size: 0.75rem;
      text-transform: uppercase; z-index: 0;
    }
    .zone.inbox { border-color: #e3b341; color: #e3b341; background: rgba(227, 179, 65, 0.05); }
    .zone.outbox { border-color: #3fb950; color: #3fb950; background: rgba(63, 185, 80, 0.05); }

    /* Agent Layer */
    #agent-layer {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 10;
    }

    /* Agent Sprite (Side View / Dollhouse) */
    .agent {
      position: absolute;
      width: 60px; height: 100px; /* Taller for standing figure */
      transform-origin: bottom center; /* Pivot at feet */
      transition: top 0.8s linear, left 0.8s linear; /* Smooth movement */
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      z-index: 20;
    }

    /* Container for flipping the sprite without flipping the label */
    .agent-sprite-container {
      width: 100%; height: 80px;
      position: relative;
      transition: transform 0.2s;
    }

    .agent.facing-left .agent-sprite-container {
      transform: scaleX(-1);
    }

    .agent-svg {
      width: 100%; height: 100%;
      filter: drop-shadow(0 4px 4px rgba(0,0,0,0.4));
    }

    /* Walking Animation */
    .agent.walking .leg-left {
      animation: walk-leg 0.8s infinite ease-in-out;
    }
    .agent.walking .leg-right {
      animation: walk-leg 0.8s infinite ease-in-out reverse;
    }
    
    .agent.walking .arm-right {
      animation: swing-arm 0.8s infinite ease-in-out;
    }

    @keyframes walk-leg {
      0%, 100% { transform: rotate(-15deg); }
      50% { transform: rotate(15deg); }
    }
    
    @keyframes swing-arm {
      0%, 100% { transform: rotate(10deg); }
      50% { transform: rotate(-10deg); }
    }

    /* Label stays upright and unflipped */
    .agent-label {
      position: absolute;
      bottom: -20px;
      background: rgba(0,0,0,0.8);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
      color: white;
      white-space: nowrap;
      z-index: 30;
    }

    /* Working Animation */
    .agent.working .agent-svg {
      animation: bounce 1s infinite;
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
    }

    /* Speech Bubble */
    .speech-bubble {
      position: absolute;
      top: -40px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      color: #1a1a2e;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 0.7rem;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 40;
      opacity: 0;
      transition: opacity 0.3s, transform 0.3s;
      pointer-events: none;
    }
    .speech-bubble.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(-5px);
    }
    .speech-bubble::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 4px 4px 0;
      border-style: solid;
      border-color: white transparent transparent transparent;
    }

    /* Idle Micro-Animations */
    .agent.idle.stretch .agent-svg { animation: stretch 2s ease-in-out; }
    @keyframes stretch {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(1.05); }
    }

    /* Folder Icon */
    .agent-folder {
      position: absolute;
      top: 40px; right: 5px; /* Held in hand */
      font-size: 20px;
      z-index: 25;
    }

    /* Log */
    .log-panel {
      width: 1000px; margin-top: 20px; padding: 10px;
      background: #0d1117; border-top: 1px solid #30363d;
      font-family: monospace; font-size: 0.8rem; color: #8b949e;
      height: 100px; overflow-y: auto;
    }
  </style>
</head>
<body>
  <h1>AiSHA Office Floor</h1>
  
  <div class="stats-bar">
    <div class="stat-item">Agents: <span class="stat-value" id="agent-count">0</span></div>
    <div class="stat-item">Tasks: <span class="stat-value" id="task-count">0</span></div>
    <div class="stat-item">Events: <span class="stat-value" id="event-count">0</span></div>
    <div style="flex-grow:1"></div>
    <button onclick="fetch('/test/handoff', {method:'POST'})" style="padding: 4px 12px; background: #238636; color: white; border: none; border-radius: 4px; cursor: pointer;">Run Demo</button>
  </div>

  <div class="office-floor" id="office-floor">
    <div class="zone inbox" style="left: 80px; top: 300px;"><div>📥</div><div>Inbox</div></div>
    <div class="zone outbox" style="left: 920px; top: 300px;"><div>📤</div><div>Outbox</div></div>

    <!-- Desks -->
    <div class="desk-group" style="left: 250px; top: 300px;">
      <div class="desk">
        <div class="monitor"></div>
        <div class="desk-surface"></div>
        <div class="desk-leg left"></div>
        <div class="desk-leg right"></div>
      </div>
      <div class="chair">
        <div class="chair-back"></div>
        <div class="chair-seat"></div>
        <div class="chair-leg"></div>
      </div>
      <div class="desk-label">Ops Manager</div>
    </div>

    <div class="desk-group" style="left: 500px; top: 150px;">
      <div class="desk">
        <div class="monitor"></div>
        <div class="desk-surface"></div>
        <div class="desk-leg left"></div>
        <div class="desk-leg right"></div>
      </div>
      <div class="chair">
        <div class="chair-back"></div>
        <div class="chair-seat"></div>
        <div class="chair-leg"></div>
      </div>
      <div class="desk-label">Sales Manager</div>
    </div>
    
    <div class="desk-group" style="left: 500px; top: 450px;">
      <div class="desk">
        <div class="monitor"></div>
        <div class="desk-surface"></div>
        <div class="desk-leg left"></div>
        <div class="desk-leg right"></div>
      </div>
      <div class="chair">
        <div class="chair-back"></div>
        <div class="chair-seat"></div>
        <div class="chair-leg"></div>
      </div>
      <div class="desk-label">Marketing</div>
    </div>

    <div class="desk-group" style="left: 750px; top: 150px;">
      <div class="desk">
        <div class="monitor"></div>
        <div class="desk-surface"></div>
        <div class="desk-leg left"></div>
        <div class="desk-leg right"></div>
      </div>
      <div class="chair">
        <div class="chair-back"></div>
        <div class="chair-seat"></div>
        <div class="chair-leg"></div>
      </div>
      <div class="desk-label">Project Manager</div>
    </div>
    
    <div class="desk-group" style="left: 750px; top: 300px;">
      <div class="desk">
        <div class="monitor"></div>
        <div class="desk-surface"></div>
        <div class="desk-leg left"></div>
        <div class="desk-leg right"></div>
      </div>
      <div class="chair">
        <div class="chair-back"></div>
        <div class="chair-seat"></div>
        <div class="chair-leg"></div>
      </div>
      <div class="desk-label">Client Services</div>
    </div>
    
    <div class="desk-group" style="left: 750px; top: 450px;">
      <div class="desk">
        <div class="monitor"></div>
        <div class="desk-surface"></div>
        <div class="desk-leg left"></div>
        <div class="desk-leg right"></div>
      </div>
      <div class="chair">
        <div class="chair-back"></div>
        <div class="chair-seat"></div>
        <div class="chair-leg"></div>
      </div>
      <div class="desk-label">Customer Service</div>
    </div>

    <!-- Agent Layer -->
    <div id="agent-layer"></div>
  </div>

  <div class="log-panel" id="log">Waiting for events...</div>

  <script>
    // Configuration
    const DESK_POSITIONS = {
      'ops_manager': { x: 250, y: 300 },
      'sales_manager': { x: 500, y: 150 },
      'marketing_manager': { x: 500, y: 450 },
      'project_manager': { x: 750, y: 150 },
      'client_services_expert': { x: 750, y: 300 },
      'customer_service_manager': { x: 750, y: 450 },
      // Fallbacks
      'sales_rep': { x: 500, y: 150 }, 
      'support_agent': { x: 750, y: 450 }
    };

    const INBOX_POS = { x: 80, y: 300 };
    const OUTBOX_POS = { x: 920, y: 300 };

    const AGENT_COLORS = {
      'ops_manager': '#58a6ff', // Blue
      'sales_manager': '#3fb950', // Green
      'marketing_manager': '#d29922', // Orange
      'project_manager': '#a371f7', // Purple
      'client_services_expert': '#f0883e', // Red/Orange
      'customer_service_manager': '#f78166' // Red
    };

    // State
    // agents: { role: { x, y, homeX, homeY, facing, status, carrying, label, queue: [], busy: false } }
    // Note: Using role as key (not agentId with tenant) to prevent duplicate spawning
    const agents = {}; 
    const inboxItems = {}; // { task_id: { id, label } }
    let eventCount = 0;

    // ========== INITIALIZE ALL AGENTS ON STANDBY ==========
    // Pre-spawn all agents at their desks on page load
    function initializeAllAgents() {
      Object.entries(DESK_POSITIONS).forEach(([role, pos]) => {
        const label = role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
      });
      log('All agents initialized on standby');
    }
    
    // Note: initializeAllAgents() is called after renderAgents is defined (see below)

    const logEl = document.getElementById('log');
    const agentLayer = document.getElementById('agent-layer');
    
    function log(msg) {
      logEl.innerText = msg + '\\n' + logEl.innerText.slice(0, 1000);
    }
    
    function ensureInInbox(evt) {
      const taskId = evt.task_id || evt.run_id;
      if (!taskId) return;
      if (inboxItems[taskId]) return; // Already exists
      
      const label = evt.summary || evt.reason || taskId.substring(0, 20);
      inboxItems[taskId] = { id: taskId, label };
    }
    
    function removeFromInbox(taskId) {
      if (taskId && inboxItems[taskId]) {
        delete inboxItems[taskId];
      }
    }
    
    function renderInbox() {
      const count = Object.keys(inboxItems).length;
      document.getElementById('task-count').innerText = count;
    }

    function getAgentPos(agentId) {
      const role = agentId.split(':')[0];
      return DESK_POSITIONS[role] || DESK_POSITIONS['ops_manager'];
    }
    
    function getAgentColor(agentId) {
      const role = agentId.split(':')[0];
      return AGENT_COLORS[role] || '#8b949e';
    }
    
    // Extract role from agentId (e.g., "ops_manager:tenant123" -> "ops_manager")
    function getRoleFromAgentId(agentId) {
      return agentId.split(':')[0];
    }

    // ========== RENDERER ==========
    function renderAgents() {
      for (const [id, agent] of Object.entries(agents)) {
        let el = document.getElementById('agent-' + id.replace(/[^a-zA-Z0-9]/g, '_'));
        if (!el) {
          el = document.createElement('div');
          el.id = 'agent-' + id.replace(/[^a-zA-Z0-9]/g, '_');
          el.className = 'agent';
          
          const color = getAgentColor(id);
          el.innerHTML = \`
            <div class="agent-sprite-container">
              <svg class="agent-svg" viewBox="0 0 60 100">
                <g transform="translate(30, 70)">
                  <rect class="leg-left" x="-6" y="0" width="12" height="28" rx="4" fill="#161b22" stroke="#30363d" stroke-width="2" transform-origin="top center" />
                  <rect class="leg-right" x="-6" y="0" width="12" height="28" rx="4" fill="#161b22" stroke="#30363d" stroke-width="2" transform-origin="top center" />
                </g>
                <rect x="15" y="30" width="30" height="45" rx="8" fill="\${color}" stroke="#000" stroke-width="1" />
                <circle cx="30" cy="20" r="14" fill="#f0e0d0" stroke="#000" stroke-width="1" />
                <path d="M18,16 Q30,6 42,16" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round" />
                <g transform="translate(30, 40)">
                   <rect class="arm-right" x="-4" y="0" width="8" height="30" rx="4" fill="\${color}" stroke="#000" stroke-width="1" transform-origin="top center" />
                </g>
              </svg>
              <div class="folder-container"></div>
            </div>
            <div class="speech-bubble"></div>
            <div class="agent-label">\${agent.label}</div>
          \`;
          agentLayer.appendChild(el);
        }

        // Update Position (with vertical offset for perspective)
        el.style.left = agent.x + 'px';
        el.style.top = (agent.y + 25) + 'px';
        el.style.transform = 'translate(-50%, -100%)';

        // Update Facing
        if (agent.facing === 'left') el.classList.add('facing-left');
        else el.classList.remove('facing-left');

        // Update Status
        // Don't remove 'stretch' if it's there
        if (!el.classList.contains('stretch')) {
           el.classList.remove('idle', 'walking', 'working');
           el.classList.add(agent.status);
        }
        
        // Update Folder
        const folderContainer = el.querySelector('.folder-container');
        if (agent.carrying) {
          if (!folderContainer.hasChildNodes()) {
            const f = document.createElement('div');
            f.className = 'agent-folder';
            f.innerText = '📁';
            folderContainer.appendChild(f);
          }
        } else {
          folderContainer.innerHTML = '';
        }
      }
    }

    function showBubble(agentId, text, duration = 2000) {
       const role = getRoleFromAgentId(agentId);
       const el = document.getElementById('agent-' + role.replace(/[^a-zA-Z0-9]/g, '_'));
       if (!el) return;
       const bubble = el.querySelector('.speech-bubble');
       if (bubble) {
         bubble.innerText = text;
         bubble.classList.add('visible');
         setTimeout(() => bubble.classList.remove('visible'), duration);
       }
    }

    // ========== ACTION QUEUE SYSTEM ==========
    // Actions: 
    // ['move', x, y]
    // ['wait', ms]
    // ['set', key, value]
    // ['trigger', fn]
    // ['waitForState', key, val]

    function queueAction(agentId, action) {
      const role = getRoleFromAgentId(agentId);
      if (!agents[role]) return;
      agents[role].queue.push(action);
      processQueue(agentId);
    }

    async function processQueue(agentId) {
      const role = getRoleFromAgentId(agentId);
      const agent = agents[role];
      if (!agent || agent.busy || agent.queue.length === 0) return;

      agent.busy = true;
      const action = agent.queue.shift();

      try {
        switch(action[0]) {
          case 'move':
            const [_, targetX, targetY] = action;
            // Determine facing
            agent.facing = targetX < agent.x ? 'left' : 'right';
            agent.status = 'walking';
            agent.x = targetX;
            agent.y = targetY;
            renderAgents();
            // Wait for transition (0.8s CSS + buffer)
            await new Promise(r => setTimeout(r, 900));
            agent.status = 'idle';
            renderAgents();
            break;

          case 'wait':
            await new Promise(r => setTimeout(r, action[1]));
            break;

          case 'set':
            agent[action[1]] = action[2];
            renderAgents();
            break;
            
          case 'trigger':
             if (typeof action[1] === 'function') action[1]();
             break;
             
          case 'waitForState':
             const [__, key, val] = action;
             if (agent[key] !== val) {
               // Condition not met. Retry later.
               agent.queue.unshift(action);
               agent.busy = false;
               setTimeout(() => processQueue(agentId), 200);
               return; // Exit loop, will be called again by timeout
             }
             break;
        }
      } catch (e) {
        console.error('Queue error', e);
      }

      agent.busy = false;
      processQueue(agentId); // Next
    }

    // ========== EVENT REDUCER ==========
    function ensureAgent(agentId, name) {
      // Use role as key to prevent duplicate agents for same role with different tenants
      const role = getRoleFromAgentId(agentId);
      if (!agents[role]) {
        const pos = getAgentPos(agentId);
        agents[role] = {
          x: pos.x,
          y: pos.y,
          homeX: pos.x,
          homeY: pos.y,
          facing: 'right',
          status: 'idle',
          carrying: false,
          label: (name || role).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').substring(0, 15),
          queue: [],
          busy: false
        };
        renderAgents();
      }
      return agents[role];
    }

    function handleEvent(evt) {
      eventCount++;
      document.getElementById('event-count').innerText = eventCount;
      
      // ========== SYSTEM RESET ==========
      if (evt.type === 'system_reset') {
        log('[SYSTEM] Reset - clearing state and reinitializing agents');
        // Clear inbox
        Object.keys(inboxItems).forEach(k => delete inboxItems[k]);
        renderInbox();
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
        eventCount = 0;
        document.getElementById('event-count').innerText = '0';
        return;
      }
      
      // ========== SYSTEM-LEVEL EVENTS (no agent_id required) ==========
      if (evt.type === 'task_created' || evt.type === 'task_enqueued') {
        log(\`[\${evt.type}] \${evt.task_id || evt.run_id || ''}\`);
        ensureInInbox(evt);
        renderInbox();
        return;
      }
      
      // ========== TASK_ASSIGNED (special validation) ==========
      if (evt.type === 'task_assigned') {
        const agentId = evt.agent_id;
        const assigneeId = evt.to_agent_id;
        const taskId = evt.task_id;
        
        if (!agentId || !assigneeId || !taskId) {
          log(\`[WARNING] Invalid task_assigned: missing agent_id=\${agentId} to_agent_id=\${assigneeId} task_id=\${taskId}\`);
          return;
        }
        
        log(\`[task_assigned] \${agentId} -> \${assigneeId} (\${taskId})\`);
        
        // Ensure task is in inbox before pickup
        ensureInInbox(evt);
        renderInbox();
        
        const agent = ensureAgent(agentId, evt.agent_name);
        
        if (assigneeId !== agentId) {
          // Dispatcher sequence
          ensureAgent(assigneeId); // Ensure target exists
          const targetPos = getAgentPos(assigneeId);
          
          // 1. Walk to Inbox
          queueAction(agentId, ['move', INBOX_POS.x, INBOX_POS.y]);
          queueAction(agentId, ['wait', 500]);
          
          // 2. Pick up from Inbox (and remove from inbox state)
          queueAction(agentId, ['set', 'carrying', true]);
          queueAction(agentId, ['trigger', () => {
            removeFromInbox(taskId);
            renderInbox();
          }]);
          showBubble(agentId, 'New Task');
          queueAction(agentId, ['wait', 500]);

             // 3. Walk back to own desk (Home)
             queueAction(agentId, ['move', agent.homeX, agent.homeY]);
             queueAction(agentId, ['wait', 500]);

             // 4. Walk to target
             queueAction(agentId, ['move', targetPos.x, targetPos.y]);
             queueAction(agentId, ['wait', 500]);
             
             // 5. Drop (Transfer)
             queueAction(agentId, ['set', 'carrying', false]);
             queueAction(agentId, ['trigger', () => {
               // Instant transfer to target
               if (agents[assigneeId]) agents[assigneeId].carrying = true;
               if (agents[assigneeId]) agents[assigneeId].status = 'working';
               renderAgents();
               showBubble(assigneeId, 'On it!');
             }]);
             queueAction(agentId, ['wait', 500]);
             
          // 6. Walk Home
          queueAction(agentId, ['move', agent.homeX, agent.homeY]);
        } else {
          // Self assignment
          removeFromInbox(taskId);
          renderInbox();
          queueAction(agentId, ['set', 'status', 'working']);
          queueAction(agentId, ['set', 'carrying', true]);
        }
        return;
      }
      
      // ========== AGENT-SPECIFIC EVENTS (require agent_id) ==========
      const agentId = evt.agent_id;
      if (!agentId) {
        log(\`[WARNING] Event \${evt.type} missing agent_id, ignoring\`);
        return;
      }
      
      log(\`[\${evt.type}] \${agentId} \${evt.task_id||''}\`);
      const agent = ensureAgent(agentId, evt.agent_name);

      switch(evt.type) {
        case 'agent_spawned':
          // Just ensure exists (handled above)
          break;

        case 'handoff':
          const toId = evt.to_agent_id;
          if (toId) {
            ensureAgent(toId);
            const targetPos = getAgentPos(toId);
            
            // Wait until we actually have the folder!
            queueAction(agentId, ['waitForState', 'carrying', true]);

            showBubble(agentId, 'Handoff: ' + (evt.reason || 'Task'));

            // 1. Walk to target
            queueAction(agentId, ['move', targetPos.x, targetPos.y]);
            queueAction(agentId, ['wait', 800]);
            // 2. Transfer
            queueAction(agentId, ['set', 'carrying', false]);
            queueAction(agentId, ['trigger', () => {
               if (agents[toId]) agents[toId].carrying = true;
               if (agents[toId]) agents[toId].status = 'working';
               renderAgents();
               showBubble(toId, 'Got it!');
            }]);
            queueAction(agentId, ['wait', 500]);
            // 3. Walk Home
            queueAction(agentId, ['move', agent.homeX, agent.homeY]);
          }
          break;

        case 'task_completed':
        case 'task_failed':
        case 'run_completed':
        case 'run_finished': // Backend emits run_finished per telemetry contract
          // Wait until we have the folder
          queueAction(agentId, ['waitForState', 'carrying', true]);
          
          // Walk to Outbox -> Drop -> Home
          showBubble(agentId, 'Done!');
          queueAction(agentId, ['set', 'status', 'idle']);
          queueAction(agentId, ['move', OUTBOX_POS.x, OUTBOX_POS.y]);
          queueAction(agentId, ['wait', 500]);
          queueAction(agentId, ['set', 'carrying', false]);
          queueAction(agentId, ['move', agent.homeX, agent.homeY]);
          break;

        case 'run_started':
          queueAction(agentId, ['set', 'status', 'working']);
          showBubble(agentId, 'Starting...');
          break;

        case 'tool_call':
        case 'tool_call_started': // Backend emits tool_call_started per telemetry contract
          queueAction(agentId, ['set', 'status', 'working']);
          showBubble(agentId, (evt.tool_name || '...'));
          break;
      }
    }
    
    // ========== INITIALIZATION ==========
    // Initialize all agents on standby and render them
    initializeAllAgents();
    renderAgents();
    log('Office ready - all agents on standby');
    
    // Random Idle Animations
    setInterval(() => {
      const idleAgents = Object.entries(agents).filter(([_, a]) => a.status === 'idle' && !a.busy);
      if (idleAgents.length > 0) {
        const [id, _] = idleAgents[Math.floor(Math.random() * idleAgents.length)];
        const el = document.getElementById('agent-' + id.replace(/[^a-zA-Z0-9]/g, '_'));
        if (el) {
          el.classList.add('stretch');
          setTimeout(() => el.classList.remove('stretch'), 2000);
        }
      }
    }, 3000);

    // SSE Connection
    const es = new EventSource('/sse');
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        handleEvent(evt);
      } catch (err) { console.error(err); }
    };
    
    es.onerror = () => {
      log('Connection lost. Reconnecting...');
    };
  </script>
</body>
</html>`);
});

app.get('/events', (req, res) => {
  res.json({ count: events.length, events });
});

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
  const line = `data: ${JSON.stringify(resetEvent)}\n\n`;
  for (const sseRes of sseClients) {
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
  const line = `data: ${JSON.stringify(resetEvent)}\n\n`;
  for (const sseRes of sseClients) {
    try { sseRes.write(line); } catch (_) {}
  }
  res.json({ status: 'ok', cleared: oldCount, message: 'Event queue cleared' });
});

app.post('/test/handoff', (req, res) => {
  const runIdA = 'run-a-' + Date.now();
  const runIdB = 'run-b-' + Date.now();
  const tenantId = 'dev';
  const now = new Date().toISOString();

  const testEvents = [
    // 1. Spawn All Agents
    { type: 'agent_spawned', agent_id: 'ops_manager:dev', agent_name: 'Ops Manager', ts: now },
    { type: 'agent_spawned', agent_id: 'sales_manager:dev', agent_name: 'Sales Manager', ts: now },
    { type: 'agent_spawned', agent_id: 'marketing_manager:dev', agent_name: 'Marketing Manager', ts: now },
    { type: 'agent_spawned', agent_id: 'project_manager:dev', agent_name: 'Project Manager', ts: now },
    { type: 'agent_spawned', agent_id: 'client_services_expert:dev', agent_name: 'Client Services', ts: now },
    { type: 'agent_spawned', agent_id: 'customer_service_manager:dev', agent_name: 'Customer Service', ts: now },

    // 2. Start Two Parallel Runs
    { type: 'run_started', agent_id: 'ops_manager:dev', run_id: runIdA, input_summary: 'Q1 Sales Campaign', ts: now },
    { type: 'run_started', agent_id: 'ops_manager:dev', run_id: runIdB, input_summary: 'Client Onboarding: Acme Corp', ts: now },

    // 3. Task A: Sales Campaign (Ops -> Sales -> Marketing)
    // Ops assigns to Sales
    { type: 'task_assigned', agent_id: 'ops_manager:dev', to_agent_id: 'sales_manager:dev', task_id: `task:${runIdA}:1`, run_id: runIdA, reason: 'Draft Sales Strategy', ts: now },

    // 4. Task B: Onboarding (Ops -> Project)
    // Ops assigns to Project (Will queue after Sales assignment)
    { type: 'task_assigned', agent_id: 'ops_manager:dev', to_agent_id: 'project_manager:dev', task_id: `task:${runIdB}:1`, run_id: runIdB, reason: 'Setup Project Plan', ts: now },

    // 5. Sales Works & Handoffs to Marketing
    { type: 'tool_call', agent_id: 'sales_manager:dev', tool_name: 'analyze_market', run_id: runIdA, ts: now },
    { type: 'handoff', agent_id: 'sales_manager:dev', from_agent_id: 'sales_manager:dev', to_agent_id: 'marketing_manager:dev', task_id: `task:${runIdA}:2`, run_id: runIdA, reason: 'Create Assets', ts: now },

    // 6. Project Works & Handoffs to Client Services
    { type: 'tool_call', agent_id: 'project_manager:dev', tool_name: 'create_timeline', run_id: runIdB, ts: now },
    { type: 'handoff', agent_id: 'project_manager:dev', from_agent_id: 'project_manager:dev', to_agent_id: 'client_services_expert:dev', task_id: `task:${runIdB}:2`, run_id: runIdB, reason: 'Schedule Kickoff', ts: now },

    // 7. Marketing Works & Completes
    { type: 'tool_call', agent_id: 'marketing_manager:dev', tool_name: 'design_ads', run_id: runIdA, ts: now },
    { type: 'run_completed', agent_id: 'marketing_manager:dev', run_id: runIdA, output_summary: 'Campaign Ready', ts: now },

    // 8. Client Services Works & Completes
    { type: 'tool_call', agent_id: 'client_services_expert:dev', tool_name: 'email_client', run_id: runIdB, ts: now },
    { type: 'run_completed', agent_id: 'client_services_expert:dev', run_id: runIdB, output_summary: 'Onboarding Scheduled', ts: now },
  ];

  // Stagger events slightly so they don't all hit at ms 0, but close enough to overlap
  let delay = 0;
  for (const evt of testEvents) {
    setTimeout(() => pushEvent(evt), delay);
    delay += 1500; // 1.5s delay between events to allow animations to start/queue
  }

  res.json({ status: 'ok', message: 'Handoff demo started', events: testEvents.length, duration_ms: delay });
});

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  for (const evt of events.slice(-500)) {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Handle any unhandled promise rejections (e.g., from KafkaJS background operations)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[office-viz] Unhandled Rejection:', reason?.message || reason);
  // Don't exit - keep the HTTP server running
});

// Start HTTP server first
const server = app.listen(PORT, () => {
  console.log(`[office-viz] listening on :${PORT} bus=${BUS_TYPE}`);
});

// Then try to connect to message bus (non-blocking)
startConsumer().then(() => {
  console.log(`[office-viz] connected to ${BUS_TYPE}`);
}).catch((e) => {
  console.error('[office-viz] consumer failed to connect (events will only come from /test endpoints)', e.message);
  // Don't exit - the HTTP server is still useful for manual testing
});
