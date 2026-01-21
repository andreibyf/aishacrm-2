import express from 'express';
import { Kafka } from 'kafkajs';
import amqplib from 'amqplib';

const app = express();
const PORT = Number(process.env.PORT || 4010);
const BUS_TYPE = (process.env.BUS_TYPE || 'kafka').toLowerCase();
const MAX_EVENTS = Number(process.env.MAX_EVENTS_IN_MEMORY || 5000);

// Security / UX toggles
// - If OFFICE_VIZ_TOKEN is set, require Authorization: Bearer <token> (or ?token=)
// - Demo endpoints are disabled by default
const OFFICE_VIZ_TOKEN = process.env.OFFICE_VIZ_TOKEN || '';
const ENABLE_DEMO_ENDPOINTS = (process.env.ENABLE_DEMO_ENDPOINTS || 'false').toLowerCase() === 'true';

function requireVizAuth(req, res, next) {
  if (!OFFICE_VIZ_TOKEN) return next();
  const header = (req.headers.authorization || '').trim();
  const tokenFromHeader = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const token = tokenFromHeader || (req.query.token ? String(req.query.token) : '');
  if (token && token === OFFICE_VIZ_TOKEN) return next();
  res.status(401).json({ error: 'unauthorized' });
}

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'redpanda:9092').split(',');
// Canonical topic (contracts): aisha.events.v1
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'aisha.events.v1';

const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
// Keep exchange name aligned with canonical topic by default
const RABBIT_EXCHANGE = process.env.RABBIT_EXCHANGE || 'aisha.events.v1';
const RABBIT_BINDING_KEY = process.env.RABBIT_BINDING_KEY || 'events';

const events = [];
// Map<res, { tenant_id?: string, run_id?: string }>
const sseClients = new Map();

function passesFilter(evt, filter) {
  if (!filter) return true;
  if (filter.tenant_id && evt.tenant_id && filter.tenant_id !== evt.tenant_id) return false;
  if (filter.run_id && evt.run_id && filter.run_id !== evt.run_id) return false;
  return true;
}

/**
 * Normalize canonical telemetry events (contracts) into the UI-friendly event
 * types the current office-viz client understands.
 *
 * Canonical types include: task_created, task_assigned, task_started,
 * task_completed, task_failed, tool_call_started, tool_call_finished, handoff,
 * agent_registered, agent_spawned.
 */
function normalizeToUiEvents(rawEvt) {
  const evt = rawEvt && typeof rawEvt === 'object' ? rawEvt : null;
  if (!evt || !evt.type) return [];

  // Already in UI format (legacy/demo)
  const uiTypes = new Set([
    'task_enqueued', 'task_assigned', 'run_started', 'run_completed', 'task_failed',
    'handoff', 'tool_call', 'agent_spawned', 'agent_registered', 'task_created'
  ]);
  if (uiTypes.has(evt.type)) return [evt];

  const common = {
    _telemetry: evt._telemetry,
    ts: evt.ts,
    tenant_id: evt.tenant_id,
    trace_id: evt.trace_id,
    span_id: evt.span_id,
    parent_span_id: evt.parent_span_id,
    run_id: evt.run_id,
    task_id: evt.task_id,
    agent_id: evt.agent_id,
    agent_name: evt.agent_name,
  };

  switch (evt.type) {
    case 'task_created':
      return [{
        ...common,
        type: 'task_enqueued',
        // use title as the safe summary shown in Inbox
        input_summary: evt.title || evt.input_summary || 'New Task',
      }];

    case 'task_assigned':
      return [{
        ...common,
        type: 'task_assigned',
        to_agent_id: evt.to_agent_id,
        reason: evt.reason || 'Assigned',
      }];

    case 'task_started':
      return [{
        ...common,
        type: 'run_started',
        input_summary: evt.input_summary || evt.title,
      }];

    case 'tool_call_started':
    case 'tool_call_finished':
    case 'tool_call_failed':
      return [{
        ...common,
        type: 'tool_call',
        tool_name: evt.tool_name,
      }];

    case 'handoff':
      return [{
        ...common,
        type: 'handoff',
        from_agent_id: evt.from_agent_id,
        to_agent_id: evt.to_agent_id,
        reason: evt.summary || evt.reason || 'Handoff',
      }];

    case 'task_completed':
      return [{
        ...common,
        type: 'run_completed',
        output_summary: evt.summary || 'Completed',
      }];

    case 'task_failed':
      return [{
        ...common,
        type: 'task_failed',
        error: evt.error,
        output_summary: evt.error || 'Failed',
      }];

    case 'agent_registered':
    case 'agent_spawned':
      return [{
        ...common,
        type: 'agent_spawned',
      }];

    default:
      return [];
  }
}

function pushEvent(rawEvt) {
  const uiEvents = normalizeToUiEvents(rawEvt);
  for (const evt of uiEvents) {
    events.push(evt);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

    const line = `data: ${JSON.stringify(evt)}\n\n`;
    for (const [res, filter] of sseClients.entries()) {
      if (!passesFilter(evt, filter)) continue;
      try { res.write(line); } catch (_) { }
    }
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

app.get('/', requireVizAuth, (req, res) => {
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
      transition: top 1.5s linear, left 1.5s linear; /* Slower movement */
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
      animation: walk-leg 1.5s infinite ease-in-out;
    }
    .agent.walking .leg-right {
      animation: walk-leg 1.5s infinite ease-in-out reverse;
    }
    
    .agent.walking .arm-right {
      animation: swing-arm 1.5s infinite ease-in-out;
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

    /* Side Panes */
    .side-pane {
      width: 200px;
      height: 600px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 4px;
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    /* Removed absolute positioning */
    
    .main-layout {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      justify-content: center;
    }
    
    .pane-header {
      padding: 10px;
      background: #21262d;
      border-bottom: 1px solid #30363d;
      font-weight: bold;
      color: #c9d1d9;
      text-align: center;
      font-size: 0.9rem;
    }
    
    .task-list {
      flex-grow: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex; flex-direction: column; gap: 8px;
    }
    
    .task-item {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 4px;
      padding: 8px;
      font-size: 0.8rem;
      color: #8b949e;
    }
    .task-item.completed { border-left: 3px solid #3fb950; }
    .task-item.failed { border-left: 3px solid #f85149; }
    .task-item.queued { border-left: 3px solid #e3b341; }
    
    .task-id { font-weight: bold; color: #c9d1d9; margin-bottom: 4px; display: block; }
    .task-meta { font-size: 0.7rem; }

    /* Bubble Types */
    .speech-bubble.thought {
      border-radius: 12px;
      border: 1px solid #d29922;
      color: #d29922;
    }
    .speech-bubble.chat {
      border-radius: 4px;
      border: 1px solid #58a6ff;
      color: #58a6ff;
    }

    /* Rooms */
    .room {
      position: absolute;
      border: 2px solid #484f58;
      background: rgba(22, 27, 34, 0.3);
      border-radius: 0; /* Boxy look */
      pointer-events: none;
    }
    .room-label {
      position: absolute;
      top: 5px; left: 5px;
      font-size: 0.7rem; color: #8b949e;
      font-weight: bold; text-transform: uppercase;
      z-index: 5;
    }
    /* Doorways (visual gaps) */
    .doorway {
      position: absolute;
      width: 50px; height: 4px;
      background: #161b22; /* Match floor */
      z-index: 2;
    }
    /* Cubicles */
    .cubicle-area {
      position: absolute;
      border: 2px solid #484f58;
      border-top: none; /* Open top access? Or just visual style */
      background: rgba(22, 27, 34, 0.3);
    }
    .cubicle-divider {
      position: absolute;
      top: 20px; bottom: 0;
      width: 2px; background: #484f58;
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
    ${ENABLE_DEMO_ENDPOINTS ? `<button onclick="fetch('/test/handoff', {method:'POST'})" style="padding: 4px 12px; background: #238636; color: white; border: none; border-radius: 4px; cursor: pointer;">Run Demo</button>` : ''}
  </div>

  <div class="main-layout">
    <div class="side-pane">
      <div class="pane-header">INBOX / QUEUED</div>
      <div class="task-list" id="inbox-list"></div>
    </div>

    <div class="office-floor" id="office-floor">
      <div class="zone inbox" style="left: 60px; top: 300px;"><div>📥</div><div>Inbox</div></div>
      <div class="zone outbox" style="left: 940px; top: 300px;"><div>📤</div><div>Outbox</div></div>

      <!-- Rooms (Top Row) -->
      <!-- Ops: Top Left -->
      <div class="room" style="left: 50px; top: 20px; width: 280px; height: 220px;">
        <div class="room-label">Ops Office</div>
        <div class="doorway" style="bottom: -3px; left: 115px;"></div>
      </div>
      
      <!-- Sales: Top Center -->
      <div class="room" style="left: 350px; top: 20px; width: 280px; height: 220px;">
        <div class="room-label">Sales Office</div>
        <div class="doorway" style="bottom: -3px; left: 115px;"></div>
      </div>

      <!-- Marketing: Top Right (Swapped) -->
      <div class="room" style="left: 650px; top: 20px; width: 280px; height: 220px;">
        <div class="room-label">Marketing Office</div>
        <div class="doorway" style="bottom: -3px; left: 115px;"></div>
      </div>

      <!-- Project: Bottom Left (Swapped) -->
      <div class="room" style="left: 50px; top: 360px; width: 280px; height: 220px;">
        <div class="room-label">Project Office</div>
        <div class="doorway" style="top: -3px; left: 115px;"></div>
      </div>

      <!-- Cubicles: Bottom Right -->
      <div class="cubicle-area" style="left: 350px; top: 360px; width: 580px; height: 220px; border-top: none;">
        <div class="room-label">Support Cubicles</div>
        <!-- Vertical Divider -->
        <div class="cubicle-divider" style="left: 290px;"></div>
        <!-- Visual "walls" for cubicles -->
        <div style="position:absolute; top:0; left:0; width:2px; height:50px; background:#484f58;"></div>
        <div style="position:absolute; top:0; right:0; width:2px; height:50px; background:#484f58;"></div>
      </div>

    <!-- Desks -->
    <!-- Ops (Top Left) -->
    <div class="desk-group" style="left: 190px; top: 130px;">
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

    <!-- Sales (Top Center) -->
    <div class="desk-group" style="left: 490px; top: 130px;">
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
    
    <!-- Marketing (Top Right) -->
    <div class="desk-group" style="left: 790px; top: 130px;">
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

    <!-- Project (Bottom Left) -->
    <div class="desk-group" style="left: 190px; top: 470px;">
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
    
    <!-- Client Services (Cubicle 1) -->
    <div class="desk-group" style="left: 495px; top: 470px;">
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
    
    <!-- Customer Service (Cubicle 2) -->
    <div class="desk-group" style="left: 795px; top: 470px;">
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

  <div class="side-pane">
    <div class="pane-header">OUTBOX / COMPLETED</div>
    <div class="task-list" id="outbox-list"></div>
  </div>
  </div><!-- End main-layout -->

  <div class="log-panel" id="log">Waiting for events...</div>

  <script>
    // Configuration
    // Configuration
    const DESK_POSITIONS = {
      'ops_manager': { x: 190, y: 130 },
      'sales_manager': { x: 490, y: 130 },
      'marketing_manager': { x: 790, y: 130 },
      'project_manager': { x: 190, y: 470 },
      'client_services_expert': { x: 495, y: 470 },
      'customer_service_manager': { x: 795, y: 470 },
      // Fallbacks
      'sales_rep': { x: 490, y: 130 }, 
      'support_agent': { x: 795, y: 470 }
    };

    const INBOX_POS = { x: 60, y: 300 };
    const OUTBOX_POS = { x: 940, y: 300 };
    
    // Room Definitions for Pathfinding
    // Door is the point agents must pass through to enter/exit
    const ROOMS = [
      { name: 'Ops', x: 50, y: 20, w: 280, h: 220, door: { x: 190, y: 240 } },
      { name: 'Sales', x: 350, y: 20, w: 280, h: 220, door: { x: 490, y: 240 } },
      { name: 'Marketing', x: 650, y: 20, w: 280, h: 220, door: { x: 790, y: 240 } },
      { name: 'Project', x: 50, y: 360, w: 280, h: 220, door: { x: 190, y: 340 } }, // Door above
      // Split Cubicles to force aisle usage
      { name: 'Cubicle 1', x: 350, y: 360, w: 290, h: 220, door: { x: 495, y: 340 } }, // Client Services Door
      { name: 'Cubicle 2', x: 640, y: 360, w: 290, h: 220, door: { x: 795, y: 340 } }  // Customer Service Door
    ];

    const AGENT_COLORS = {
      'ops_manager': '#58a6ff', // Blue
      'sales_manager': '#3fb950', // Green
      'marketing_manager': '#d29922', // Orange
      'project_manager': '#a371f7', // Purple
      'client_services_expert': '#f0883e', // Red/Orange
      'customer_service_manager': '#f78166' // Red
    };

    // State
    // agents: { id: { x, y, homeX, homeY, facing, status, carrying, label, queue: [], busy: false } }
    const agents = {};

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
 
    const deskStacks = {}; // { agentId: [ { id, title, status, ts, priority } ] }
    const taskDeliveryETAs = {}; // { taskId: timestamp } 
    let eventCount = 0;
    
    // Task Lists
    let inboxTasks = []; // { id, summary, agent }
    let outboxTasks = []; // { id, summary, status }

    const processedEventIds = new Set(); // Track processed events to prevent replay
    const completedTaskIds = new Set(); // Track completed tasks to prevent re-adding to inbox
    let sessionStartTime = Date.now(); // Ignore events older than this
    const logEl = document.getElementById('log');
    const agentLayer = document.getElementById('agent-layer');
    const inboxEl = document.getElementById('inbox-list');
    const outboxEl = document.getElementById('outbox-list');
    
    function log(msg) {
      logEl.innerText = msg + '\\n' + logEl.innerText.slice(0, 1000);
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
    function renderStacks() {
      for (const [agentId, stack] of Object.entries(deskStacks)) {
        // Find stack container - try role-based ID first
        const role = agentId.split(':')[0];
        const stackEl = document.getElementById('stack-' + role);
        if (!stackEl) continue;

        // Render up to 6 folders
        const visibleStack = stack.slice(0, 6);
        stackEl.innerHTML = visibleStack.map((task, i) => {
          const offset = i * 4; // 4px vertical stack
          const z = i;
          return \`<div class="folder \${task.status}" 
                       style="bottom: \${offset}px; left: 0; z-index: \${z};"
                       title="\${task.title}"></div>\`;
        }).join('');
      }
    }

    function updateStacks(evt) {
      // 1. Task Assigned: REMOVED immediate addition. 
      // Now handled by the Ops Manager's delivery animation in handleEvent.

      // 2. Task Started (mapped to run_started): Mark active
      if (evt.type === 'run_started' || evt.type === 'task_started') {
        const agentId = evt.agent_id;
        if (!agentId) return;
        const role = getRoleFromAgentId(agentId);

        if (!deskStacks[role]) deskStacks[role] = [];
        const taskId = evt.task_id || evt.run_id;
        const taskIdx = deskStacks[role].findIndex(t => t.id === taskId);
        
        if (taskIdx !== -1) {
          // Found: update and move to top (end of array)
          const task = deskStacks[role][taskIdx];
          task.status = 'active';
          // Remove and push to end
          deskStacks[role].splice(taskIdx, 1);
          deskStacks[role].push(task);
        } else {
          // Not found (maybe direct start or race condition): add as active
          // This acts as a fallback if the delivery animation hasn't finished yet
          deskStacks[role].push({
            id: taskId,
            title: evt.input_summary || evt.title || 'Active Task',
            status: 'active',
            ts: evt.ts
          });
        }
      }

      // 3. Completed/Failed: Remove
      if (evt.type === 'run_completed' || evt.type === 'task_completed' || evt.type === 'task_failed') {
        const agentId = evt.agent_id;
        const role = getRoleFromAgentId(agentId);
        if (!agentId || !deskStacks[role]) return;
        
        const taskId = evt.task_id || evt.run_id;
        deskStacks[role] = deskStacks[role].filter(t => t.id !== taskId);
      }
      
      renderStacks();
    }

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

    function showBubble(agentId, text, type = 'chat', duration = 4000) {
       const el = document.getElementById('agent-' + agentId.replace(/[^a-zA-Z0-9]/g, '_'));
       if (!el) return;
       const bubble = el.querySelector('.speech-bubble');
       if (bubble) {
         bubble.innerText = text;
         bubble.className = 'speech-bubble visible ' + type;

         // Clear previous timeout if any
         if (bubble.dataset.timeout) clearTimeout(Number(bubble.dataset.timeout));

         const tid = setTimeout(() => {
            bubble.classList.remove('visible');
         }, duration);
         bubble.dataset.timeout = tid;
       }
    }

    function renderPanes() {
      try {
        // Update stats
        const taskCountEl = document.getElementById('task-count');
        if (taskCountEl) {
          taskCountEl.innerText = inboxTasks.length + outboxTasks.length;
        }

        // Debug log to UI
        log('Render: Inbox=' + inboxTasks.length + ' Outbox=' + outboxTasks.length);

        if (inboxEl) {
          if (inboxTasks.length === 0) {
            inboxEl.innerHTML = '<div style="padding:10px; color:#484f58; text-align:center;">No tasks</div>';
          } else {
            inboxEl.innerHTML = inboxTasks.map(t => \`
              <div class="task-item queued">
                <span class="task-id">\${(t.id||'').split(':').pop().substring(0,8)}</span>
                <div class="task-meta">\${t.summary || 'Task'}</div>
                <div class="task-meta">-> \${t.agent}</div>
              </div>
            \`).join('');
          }
        }
        
        if (outboxEl) {
          outboxEl.innerHTML = outboxTasks.map(t => \`
            <div class="task-item \${t.status}">
              <span class="task-id">\${(t.id||'').split(':').pop().substring(0,8)}</span>
              <div class="task-meta">\${t.summary || 'Task'}</div>
              <div class="task-meta">\${t.status.toUpperCase()}</div>
            </div>
          \`).join('');
        }
      } catch (e) {
        console.error('Error rendering panes:', e);
        log('Render error: ' + e.message);
      }
    }

    function ensureInInbox(e) {
      const id = e.task_id || e.run_id;
      if (!id) return;

      // Skip if already completed (in outbox or marked as done)
      if (completedTaskIds.has(id)) return;
      if (outboxTasks.some(t => t.id === id)) return;

      // dedupe - skip if already in inbox

      if (inboxTasks.some(t => t.id === id)) return;
      inboxTasks.push({
        id,
        summary: e.input_summary || e.summary || e.reason || 'New Task',
        agent: e.to_agent_id || e.agent_id || e.agent_name || 'queued'
      });
    }

    // ========== ACTION QUEUE SYSTEM ==========
    // Actions: 
    // ['move', x, y]
    // ['wait', ms]
    // ['set', key, val]
    // ['trigger', fn]
    // ['exec', fn]
    // ['bubble', text, type, duration]
    // ['waitForState', key, val]

    function queueAction(agentId, action) {
      const role = getRoleFromAgentId(agentId);
      if (!agents[role]) return;
      agents[role].queue.push(action);
      processQueue(agentId);
    }

    // Pathfinding helper
    function getRoomForPoint(x, y) {
      return ROOMS.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    }

    function queueMove(agentId, targetX, targetY) {
      const role = getRoleFromAgentId(agentId);
      const agent = agents[role];
      if (!agent) return;

      let currX = agent.x;
      let currY = agent.y;

      // Scan queue for last move target to establish starting point
      for (let i = agent.queue.length - 1; i >= 0; i--) {
        if (agent.queue[i][0] === 'move') {
          currX = agent.queue[i][1];
          currY = agent.queue[i][2];
          break;
        }
      }

      const startRoom = getRoomForPoint(currX, currY);
      const endRoom = getRoomForPoint(targetX, targetY);

      // Helper to push orthogonal segments (X then Y)
      const pushLeg = (destX, destY) => {
        if (currX !== destX && currY !== destY) {
          queueAction(agentId, ['move', destX, currY]); // Move X
          queueAction(agentId, ['move', destX, destY]); // Move Y
        } else if (currX !== destX || currY !== destY) {
          queueAction(agentId, ['move', destX, destY]);
        }
        currX = destX;
        currY = destY;
      };

      // 1. Exit Start Room
      if (startRoom && startRoom !== endRoom) {
        pushLeg(startRoom.door.x, startRoom.door.y);
      }

      // 2. Enter End Room
      if (endRoom && startRoom !== endRoom) {
        pushLeg(endRoom.door.x, endRoom.door.y);
      }

      // 3. Final Target
      pushLeg(targetX, targetY);
    }

    async function processQueue(agentId) {
      const role = getRoleFromAgentId(agentId);
      const agent = agents[role];
      if (agent.busy || agent.queue.length === 0) return;

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
            // Wait for transition (1.5s CSS + buffer)
            await new Promise(r => setTimeout(r, 1600));
            agent.status = 'idle';
            renderAgents();
            agent.busy = false;
            processQueue(agentId);
            break;

          case 'wait':
            setTimeout(() => {
              agent.busy = false;
              processQueue(agentId);
            }, action[1]);
            break;

          case 'set':
            agent[action[1]] = action[2];
            renderAgents();
            agent.busy = false;
            processQueue(agentId); // Next
            break;
            
          case 'trigger':
             action[1]();
             agent.busy = false;
             processQueue(agentId);
             break;

          case 'exec': // Synchronous trigger (same as trigger but clearer name for state updates)
            action[1]();
            agent.busy = false;
            processQueue(agentId);
            break;

          case 'bubble':
            showBubble(agentId, action[1], action[2], action[3]);
            agent.busy = false;
            processQueue(agentId);
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
             agent.busy = false;
             processQueue(agentId); // Next
             break;
        }
      } catch (e) {
        console.error('Queue error', e);
        agent.busy = false;
        processQueue(agentId); // Attempt to continue queue
      }
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
        document.getElementById('agent-count').innerText = Object.keys(agents).length;
      }
      return agents[role];
    }

    function handleEvent(evt) {
      eventCount++;

      // Skip events older than 60 seconds (prevents Kafka replay of very old events)
      // We use a grace window instead of strict session start time to allow
      // events that were generated shortly before the page loaded
      if (evt.ts) {
        const eventTime = new Date(evt.ts).getTime();
        const maxAge = 60 * 1000; // 60 seconds grace window
        if (eventTime < Date.now() - maxAge) {
          log("[SKIP] Old event (>60s): " + evt.type + " from " + evt.ts);
          return;
        }
      }

      // ========== SYSTEM RESET ==========
      if (evt.type === 'system_reset') {
        log('[SYSTEM] Reset - clearing state and reinitializing agents');
        inboxTasks = [];
        outboxTasks = [];
        processedEventIds.clear();
        completedTaskIds.clear();
        sessionStartTime = Date.now(); // Reset session time to accept new events
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


      document.getElementById('event-count').innerText = eventCount;

      // System-level queue events: MUST work without agent_id
      if (evt.type === 'task_created' || evt.type === 'task_enqueued') {
        ensureInInbox(evt);
        renderPanes();
        log('[' + evt.type + '] ' + (evt.task_id || evt.run_id || ''));
        return;
      }

      // task_assigned is special: may arrive before enqueue; backfill inbox first
      if (evt.type === 'task_assigned') {
        if (!evt.to_agent_id || !(evt.task_id || evt.run_id)) {
          log('[task_assigned] invalid (missing to_agent_id or task_id/run_id)');
          return;
        }
        ensureInInbox(evt);
        renderPanes();
        // continue below (needs dispatcher animation)
      }

      const agentId = evt.agent_id;

      // Most other events require an agent_id
      if (!agentId && evt.type !== 'task_assigned') return;

      log('[' + evt.type + '] ' + (agentId || '') + ' ' + (evt.task_id || evt.run_id || ''));
      const agent = agentId ? ensureAgent(agentId, evt.agent_name) : null;
      
      // Update desk stacks
      updateStacks(evt);

      switch(evt.type) {
        case 'agent_spawned':
          // Just ensure exists (handled above)
          break;

        case 'task_enqueued':
        case 'task_created':
          break;

        case 'task_started':
        case 'run_started':
          // SYNC: Wait for delivery if needed
          const taskId = evt.task_id || evt.run_id;
          const eta = taskDeliveryETAs[taskId];
          if (eta && eta > Date.now()) {
            const waitMs = eta - Date.now();
            queueAction(agentId, ['wait', waitMs]);
          }

          // Only set carrying=true if task is on agents desk stack (delivered by Ops Manager)
          queueAction(agentId, ['exec', () => {
            const role = getRoleFromAgentId(agentId);
            const stack = deskStacks[role] || [];
            const hasTask = stack.some(t => t.id === taskId);
            if (hasTask) {
              agents[role].carrying = true;
              agents[role].status = 'working';
            } else {
              agents[role].status = 'working';
            }
            renderAgents();
          }]);
          queueAction(agentId, ['bubble', 'Analyzing...', 'thought', 4000]);
          break;

        case 'task_assigned':
          // Logic: Ops Manager (Dispatcher) picks up -> Walks to Assignee -> Drops -> Walks Home

          const dispatcherId = 'ops_manager'; // Role-based key 
          const assigneeIdFull = evt.to_agent_id || evt.agent_id;
          const assigneeId = getRoleFromAgentId(assigneeIdFull || 'ops_manager');

          if (assigneeId && agents[dispatcherId]) {
             ensureAgent(dispatcherId);
             ensureAgent(assigneeId);

             const dispatcher = agents[dispatcherId];
             const assignee = agents[assigneeId];
             const targetPos = { x: assignee.homeX, y: assignee.homeY };
             
             // 1. Dispatcher walks to Inbox
             queueMove(dispatcherId, INBOX_POS.x, INBOX_POS.y);
             queueAction(dispatcherId, ['wait', 200]);
             
             // 2. Pick up from Inbox
             queueAction(dispatcherId, ['exec', () => {
                console.log('Executing pickup for task:', evt.task_id);
                // Remove from inbox NOW, visually
                inboxTasks = inboxTasks.filter(t => t.id !== (evt.task_id || evt.run_id));
                renderPanes();
             }]);
             queueAction(dispatcherId, ['set', 'carrying', true]);
             queueAction(dispatcherId, ['bubble', 'Dispatching...', 'chat']);
             queueAction(dispatcherId, ['wait', 200]);

             // 3. Walk to Assignee's Desk
             queueMove(dispatcherId, targetPos.x, targetPos.y);
             queueAction(dispatcherId, ['wait', 200]);

             // 4. Drop / Transfer
             queueAction(dispatcherId, ['set', 'carrying', false]);
             
             if (dispatcherId !== assigneeId) {
               // Transfer to another agent
               queueAction(dispatcherId, ['trigger', () => {
                 // ADD TO DESK STACK HERE (Physical Delivery)
                 if (!deskStacks[assigneeId]) deskStacks[assigneeId] = [];
                 // Avoid dupes
                 const taskId = evt.task_id || evt.run_id;
                 if (!deskStacks[assigneeId].some(t => t.id === taskId)) {
                    deskStacks[assigneeId].push({
                      id: taskId,
                      title: evt.title || evt.input_summary || evt.summary || evt.task_type || 'Task',
                      status: 'queued',
                      ts: evt.ts,
                      priority: evt.priority
                    });
                    renderStacks();
                 }

                 if (agents[assigneeId]) {
                   // Only show "Received" if agent is actually at their desk
                   const dist = Math.hypot(agents[assigneeId].x - agents[assigneeId].homeX, agents[assigneeId].y - agents[assigneeId].homeY);
                   if (dist < 50) {
                     showBubble(assigneeId, 'Received.', 'chat');
                   }
                   renderAgents();
                 }
               }]);
             } else {
               // Self-assigned (Ops Manager kept it)
               queueAction(dispatcherId, ['set', 'status', 'working']);
               queueAction(dispatcherId, ['bubble', 'I will handle this.', 'chat']);
             }
             queueAction(dispatcherId, ['wait', 200]);

             // 5. Walk Home (if not already there)
             queueMove(dispatcherId, dispatcher.homeX, dispatcher.homeY);
             
             // Calculate ETA for delivery so Assignee doesn't start too early
             const dist1 = Math.hypot(INBOX_POS.x - dispatcher.x, INBOX_POS.y - dispatcher.y);
             const dist2 = Math.hypot(targetPos.x - INBOX_POS.x, targetPos.y - INBOX_POS.y);
             const speed = 4; // pixels per tick
             const fps = 60;
             const travelTimeMs = ((dist1 + dist2) / speed / fps) * 1000;
             const bufferMs = 1500; // Waits and transitions
             taskDeliveryETAs[evt.task_id || evt.run_id] = Date.now() + travelTimeMs + bufferMs;
          }
          break;

        case 'handoff':
          const toIdFull = evt.to_agent_id;
          const toId = getRoleFromAgentId(toIdFull || agentId);
          if (toId) {
            ensureAgent(toId);
            const targetPos = getAgentPos(toId);
            
            // Wait until we actually have the folder!
            queueAction(agentId, ['waitForState', 'carrying', true]);

            queueAction(agentId, ['bubble', 'Handing off...', 'chat', 4000]);

            // 1. Walk to target
            queueMove(agentId, targetPos.x, targetPos.y);
            queueAction(agentId, ['wait', 500]);
            // 2. Transfer
            queueAction(agentId, ['set', 'carrying', false]);
            queueAction(agentId, ['trigger', () => {
               if (agents[toId]) agents[toId].carrying = true;
               if (agents[toId]) agents[toId].status = 'working';
               renderAgents();
               showBubble(toId, 'Got it!', 'chat');
            }]);
            queueAction(agentId, ['wait', 200]);
            // 3. Walk Home
            queueMove(agentId, agent.homeX, agent.homeY);
          }
          break;

        case 'task_completed':
        case 'task_failed':
        case 'run_completed':
          // Wait until we have the folder
          queueAction(agentId, ['waitForState', 'carrying', true]);
          
          // Sanity check: If the task is still "queued" in our stack, we haven't started it yet!
          // This prevents "teleporting" to completion if events arrive out of order or too fast.
          queueAction(agentId, ['exec', () => {
             const taskId = evt.task_id || evt.run_id;
             const stack = deskStacks[role] || [];
             const task = stack.find(t => t.id === taskId);
             if (task && task.status === 'queued') {
               // Force start it visually if we missed the start event or timing is off
               task.status = 'active';
               renderStacks();
             }
             
           }]);

          const status = evt.type === 'task_failed' ? 'failed' : 'completed';

          // Walk to Outbox -> Drop -> Home
          queueAction(agentId, ['bubble', status === 'failed' ? 'Blocked.' : 'Done.', 'chat', 3000]);
          queueAction(agentId, ['set', 'status', 'idle']);
          queueMove(agentId, OUTBOX_POS.x, OUTBOX_POS.y);
          queueAction(agentId, ['wait', 200]);

          // Drop and Update Outbox
          queueAction(agentId, ['exec', () => {
            const taskId = evt.task_id || evt.run_id;
            // dedupe
            if (!outboxTasks.some(t => t.id === taskId)) {
              // CRITICAL: Ensure it's removed from Inbox if it's still there
              // This handles cases where the Ops Manager hasn't picked it up yet
              inboxTasks = inboxTasks.filter(t => t.id !== taskId);
              completedTaskIds.add(taskId); // Mark as completed to prevent replay
              
              outboxTasks.unshift({
                id: taskId,
                summary: evt.output_summary || 'Task Done',
                status
              });
              if (outboxTasks.length > 50) outboxTasks.pop();
              renderPanes();
            }
          }]);

          queueAction(agentId, ['set', 'carrying', false]);
          queueMove(agentId, agent.homeX, agent.homeY);
          break;

        case 'tool_call':
          queueAction(agentId, ['set', 'status', 'working']);
          queueAction(agentId, ['bubble', 'Using ' + (evt.tool_name || 'tool') + '...', 'chat', 4000]);
          break;
      }
    }
    
    // Initialize all agents on standby
    initializeAllAgents();

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
    // Pass-through filters from page query params (tenant_id / run_id)
    const qs = new URLSearchParams(window.location.search);
    const sseQs = new URLSearchParams();
    sseQs.set('replay', '1');
    if (qs.get('tenant_id')) sseQs.set('tenant_id', qs.get('tenant_id'));
    if (qs.get('run_id')) sseQs.set('run_id', qs.get('run_id'));
    // If auth is configured, you can also pass ?token=... in the page URL; it will be forwarded implicitly
    if (qs.get('token')) sseQs.set('token', qs.get('token'));
    const es = new EventSource('/sse?' + sseQs.toString());
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

app.get('/events', requireVizAuth, (req, res) => {
  res.json({ count: events.length, events });
});

if (ENABLE_DEMO_ENDPOINTS) {
  app.post('/test/handoff', requireVizAuth, (req, res) => {
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
    { type: 'task_enqueued', task_id: runIdA, input_summary: 'Q1 Sales Campaign', agent_name: 'Ops Manager', ts: now },
    { type: 'task_enqueued', task_id: runIdB, input_summary: 'Client Onboarding: Acme Corp', agent_name: 'Ops Manager', ts: now },

    // Assign tasks to Ops Manager to trigger fetch
    { type: 'task_assigned', task_id: runIdA, to_agent_id: 'ops_manager:dev', ts: now },
    { type: 'task_assigned', task_id: runIdB, to_agent_id: 'ops_manager:dev', ts: now },

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
    delay += 3000; // 3.0s delay between events to allow animations to start/queue
  }

  res.json({ status: 'ok', message: 'Handoff demo started', events: testEvents.length, duration_ms: delay });
});
}

app.get('/sse', requireVizAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const filter = {
    tenant_id: req.query.tenant_id ? String(req.query.tenant_id) : '',
    run_id: req.query.run_id ? String(req.query.run_id) : '',
  };
  sseClients.set(res, filter);

  // Replay last N events only when explicitly requested
  const replay = req.query.replay === '1';
  if (replay) {
    for (const evt of events.slice(-500)) {
      if (!passesFilter(evt, filter)) continue;
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
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
  const line = `data: ${JSON.stringify(resetEvent)}\n\n`;
  for (const sseRes of sseClients.keys()) {
    try { sseRes.write(line); } catch (_) {}
  }
  res.json({ status: 'ok', cleared: oldCount, message: 'Event queue cleared (GET)' });
});

// Handle any unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[office-viz] Unhandled Rejection:', reason?.message || reason);
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

