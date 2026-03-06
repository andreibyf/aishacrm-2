import express from 'express';
import { Kafka } from 'kafkajs';
import amqplib from 'amqplib';

const app = express();
const PORT = Number(process.env.PORT || 4010);
const BUS_TYPE = (process.env.BUS_TYPE || 'kafka').toLowerCase();
const MAX_EVENTS = Number(process.env.MAX_EVENTS_IN_MEMORY || 5000);

const OFFICE_VIZ_TOKEN = process.env.OFFICE_VIZ_TOKEN || '';
const ENABLE_DEMO_ENDPOINTS =
  (process.env.ENABLE_DEMO_ENDPOINTS || 'false').toLowerCase() === 'true';

function requireVizAuth(req, res, next) {
  if (!OFFICE_VIZ_TOKEN) return next();
  const header = (req.headers.authorization || '').trim();
  const tokenFromHeader = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const token = tokenFromHeader || (req.query.token ? String(req.query.token) : '');
  if (token && token === OFFICE_VIZ_TOKEN) return next();
  res.status(401).json({ error: 'unauthorized' });
}

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'redpanda:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'aisha.events.v1';
const RABBIT_URL = process.env.RABBIT_URL || 'amqp://rabbitmq:5672';
const RABBIT_EXCHANGE = process.env.RABBIT_EXCHANGE || 'aisha.events.v1';
const RABBIT_BINDING_KEY = process.env.RABBIT_BINDING_KEY || 'events';

const events = [];
const sseClients = new Map();

function passesFilter(evt, filter) {
  if (!filter) return true;
  if (filter.tenant_id && evt.tenant_id && filter.tenant_id !== evt.tenant_id) return false;
  if (filter.run_id && evt.run_id && filter.run_id !== evt.run_id) return false;
  return true;
}

function normalizeToUiEvents(rawEvt) {
  const evt = rawEvt && typeof rawEvt === 'object' ? rawEvt : null;
  if (!evt || !evt.type) return [];

  const uiTypes = new Set([
    'task_enqueued',
    'task_assigned',
    'subtask_assigned',
    'run_started',
    'run_completed',
    'task_failed',
    'handoff',
    'tool_call',
    'agent_spawned',
    'agent_registered',
    'task_created',
    'system_reset',
  ]);
  if (uiTypes.has(evt.type)) return [evt];

  const common = {
    ts: evt.ts,
    tenant_id: evt.tenant_id,
    run_id: evt.run_id,
    task_id: evt.task_id,
    agent_id: evt.agent_id,
    agent_name: evt.agent_name,
  };

  switch (evt.type) {
    case 'task_created':
      return [
        {
          ...common,
          type: 'task_enqueued',
          input_summary: evt.title || evt.input_summary || 'New Task',
        },
      ];
    case 'task_assigned':
      return [
        {
          ...common,
          type: 'task_assigned',
          to_agent_id: evt.to_agent_id,
          reason: evt.reason || 'Assigned',
        },
      ];
    case 'task_started':
      return [{ ...common, type: 'run_started', input_summary: evt.input_summary || evt.title }];
    case 'tool_call_started':
    case 'tool_call_finished':
    case 'tool_call_failed':
      return [{ ...common, type: 'tool_call', tool_name: evt.tool_name }];
    case 'handoff':
      return [
        {
          ...common,
          type: 'handoff',
          from_agent_id: evt.from_agent_id,
          to_agent_id: evt.to_agent_id,
          reason: evt.summary || evt.reason || 'Handoff',
        },
      ];
    case 'task_completed':
      return [{ ...common, type: 'run_completed', output_summary: evt.summary || 'Completed' }];
    case 'task_failed':
      return [
        { ...common, type: 'task_failed', error: evt.error, output_summary: evt.error || 'Failed' },
      ];
    case 'agent_registered':
    case 'agent_spawned':
      return [{ ...common, type: 'agent_spawned' }];
    default:
      return [];
  }
}

function pushEvent(rawEvt) {
  const uiEvents = normalizeToUiEvents(rawEvt);
  for (const evt of uiEvents) {
    console.log(
      '[office-viz] event:',
      evt.type,
      'task=' + (evt.task_id || '-'),
      'agent=' + (evt.agent_id || '-'),
    );
    events.push(evt);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    const line = `data: ${JSON.stringify(evt)}\n\n`;
    for (const [res, filter] of sseClients.entries()) {
      if (!passesFilter(evt, filter)) continue;
      try {
        res.write(line);
      } catch (_) {}
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
        pushEvent(JSON.parse(msg.content.toString('utf-8')));
      } catch (_) {}
      ch.ack(msg);
    });
    return;
  }
  const kafka = new Kafka({ clientId: 'aisha-office-viz', brokers: KAFKA_BROKERS });
  const consumer = kafka.consumer({ groupId: 'aisha-office-viz' });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        pushEvent(JSON.parse(message.value.toString('utf-8')));
      } catch (err) {
        console.error('[office-viz] kafka parse error:', err.message);
      }
    },
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', events: events.length, clients: sseClients.size });
});

// ─────────────────────────────────────────────────────────────────────────────
//  HTML / FRONT-END
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', requireVizAuth, (req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>AiSHA Office Viz</title>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:       #000;
      --wall:     #1a1aff;
      --dot:      #ffb8ae;
      --txt:      #fff;
      --accent:   #ffff00;
      --panelbg:  #0a0a1a;
      --panelbd:  #1a1aff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'VT323', monospace;
      background: var(--bg);
      color: var(--txt);
      min-height: 100vh;
      display: flex; flex-direction: column; align-items: center;
      padding: 16px; overflow-x: hidden;
    }

    /* ── Header ── */
    .header {
      width: 100%; max-width: 1320px;
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
      border-bottom: 2px solid var(--wall); padding-bottom: 10px;
    }
    .logo {
      font-family: 'Press Start 2P', monospace; font-size: 1.2rem;
      color: var(--accent); text-shadow: 0 0 12px #ff0, 0 0 24px #fa0; letter-spacing: 2px;
    }
    .stats-bar { display: flex; gap: 24px; font-size: 1.4rem; color: #aaf; }
    .stat-value { color: var(--accent); font-weight: bold; }
    .demo-btn {
      padding: 8px 18px; background: #111; color: var(--accent);
      border: 2px solid var(--accent); border-radius: 3px; cursor: pointer;
      font-family: 'Press Start 2P', monospace; font-size: 0.6rem; letter-spacing: 1px;
      transition: background 0.15s;
    }
    .demo-btn:hover { background: var(--accent); color: #000; }

    /* ── Layout ── */
    .main-layout {
      display: flex; gap: 14px; align-items: flex-start; justify-content: center;
      width: 100%; max-width: 1320px;
    }
    .side-pane {
      width: 210px; min-height: 600px; background: var(--panelbg);
      border: 2px solid var(--panelbd); border-radius: 4px;
      display: flex; flex-direction: column; flex-shrink: 0;
    }
    .pane-header {
      padding: 10px 12px; background: var(--wall); color: var(--accent);
      font-family: 'Press Start 2P', monospace; font-size: 0.7rem;
      letter-spacing: 1px; text-align: center;
    }
    .task-list {
      flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 8px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .task-item {
      background: #05050f; border: 1px solid #2222aa;
      border-radius: 3px; padding: 7px 8px; font-size: 0.95rem; color: #aab;
    }
    .task-item.completed { border-left: 3px solid #3fb950; }
    .task-item.failed    { border-left: 3px solid #f85149; }
    .task-item.queued    { border-left: 3px solid var(--accent); }
    .task-id      { font-family: monospace; font-size: 0.78rem; color: #888; display: block; margin-bottom: 3px; }
    .task-summary { color: #dde; font-size: 0.88rem; display: block; line-height: 1.3; }
    .task-meta    { font-size: 0.78rem; color: #666; display: block; margin-top: 4px; }
    .task-meta strong { color: #88f; }

    /* ── Office Floor ── */
    .office-floor {
      position: relative; width: 1000px; height: 600px;
      background: #000; border: 3px solid var(--wall); border-radius: 4px;
      overflow: hidden; flex-shrink: 0;
      box-shadow: 0 0 40px rgba(26,26,255,0.4), inset 0 0 80px rgba(0,0,0,0.8);
    }
    .maze-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }

    /* ── Pellets ── */
    .pellet {
      position: absolute; width: 6px; height: 6px; background: var(--dot);
      border-radius: 50%; z-index: 1; transform: translate(-50%,-50%);
      opacity: 0.5; transition: opacity 0.3s;
    }
    .pellet.eaten { opacity: 0; }
    .power-pellet {
      position: absolute; width: 14px; height: 14px; background: #fff;
      border-radius: 50%; z-index: 1; transform: translate(-50%,-50%);
      animation: pulse-pellet 0.8s infinite alternate;
    }
    @keyframes pulse-pellet {
      from { box-shadow: 0 0 4px #fff; transform: translate(-50%,-50%) scale(0.9); }
      to   { box-shadow: 0 0 16px #fff, 0 0 32px #aaf; transform: translate(-50%,-50%) scale(1.1); }
    }

    /* ── Room labels ── */
    .room-label {
      position: absolute; font-family: 'Press Start 2P', monospace;
      font-size: 0.58rem; color: #4455dd; letter-spacing: 0.5px;
      z-index: 2; text-transform: uppercase; pointer-events: none;
    }

    /* ── Zones ── */
    .zone {
      position: absolute; transform: translate(-50%,-50%);
      width: 72px; height: 72px; border: 2px dashed; border-radius: 6px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: 'Press Start 2P', monospace; font-size: 0.38rem; z-index: 2;
    }
    .zone.inbox  { border-color: var(--accent); color: var(--accent); background: rgba(255,255,0,0.04); }
    .zone.outbox { border-color: #3fb950;       color: #3fb950;       background: rgba(63,185,80,0.04); }
    .zone-icon { font-size: 1.4rem; margin-bottom: 3px; }

    /* ── PAC-MAN AGENTS ── */
    #agent-layer { position: absolute; inset: 0; pointer-events: none; z-index: 10; }

    .agent {
      position: absolute; width: 52px; height: 52px;
      transform: translate(-50%,-50%);
      transition: left 0.55s linear, top 0.55s linear;
      z-index: 20;
    }
    .pacman-svg { width: 46px; height: 46px; position: absolute; left: 3px; top: 3px; }

    /* Chomping via path animation */
    @keyframes chomp-fast { 0%,100%{d:path("M23,23 L46,8 A23,23 0 1,0 46,38 Z")} 50%{d:path("M23,23 L46,23 A23,23 0 1,0 46,23 Z")} }
    @keyframes chomp-slow { 0%,100%{d:path("M23,23 L46,8 A23,23 0 1,0 46,38 Z")} 50%{d:path("M23,23 L46,20 A23,23 0 1,0 46,26 Z")} }

    .agent.walking  .pm-body { animation: chomp-fast 0.22s infinite; }
    .agent.working  .pm-body { animation: chomp-slow 0.5s  infinite; }
    .agent.idle     .pm-body { animation: none; d: path("M23,23 L46,8 A23,23 0 1,0 46,38 Z"); }

    /* Direction via rotation on the svg group */
    .agent.facing-right .pm-group { transform: rotate(0deg);    transform-origin: 23px 23px; }
    .agent.facing-left  .pm-group { transform: rotate(180deg);  transform-origin: 23px 23px; }
    .agent.facing-up    .pm-group { transform: rotate(270deg);  transform-origin: 23px 23px; }
    .agent.facing-down  .pm-group { transform: rotate(90deg);   transform-origin: 23px 23px; }

    .agent-label {
      position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
      font-family: 'Press Start 2P', monospace; font-size: 0.42rem;
      color: #ccc; white-space: nowrap; text-align: center; z-index: 30;
      text-shadow: 0 1px 3px #000;
    }

    /* Speech bubble */
    .speech-bubble {
      position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
      background: #111; color: var(--accent); border: 1px solid var(--accent);
      padding: 4px 8px; border-radius: 6px;
      font-family: 'Press Start 2P', monospace; font-size: 0.38rem;
      white-space: nowrap; z-index: 40; opacity: 0; pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }
    .speech-bubble.visible { opacity: 1; transform: translateX(-50%) translateY(-4px); }
    .speech-bubble::after {
      content:''; position: absolute; bottom:-5px; left:50%; transform:translateX(-50%);
      border: 4px solid transparent; border-top-color: var(--accent);
    }

    /* Ghost (carried task) — REMOVED, ghosts now float freely */
    .ghost-carry { display: none !important; }

    /* ── Floating aisle ghosts ── */
    .aisle-ghost {
      position: absolute;
      font-size: 1.6rem;
      z-index: 30;
      pointer-events: none;
      transform: translate(-50%, -50%);
      transition: left 0.05s linear;
      filter: drop-shadow(0 0 6px rgba(255,255,255,0.7));
      animation: ghost-bob 0.7s infinite alternate ease-in-out;
    }
    @keyframes ghost-bob {
      from { margin-top: 0px; }  to { margin-top: -6px; }
    }
    .aisle-ghost.eaten {
      animation: ghost-eat 0.35s ease-out forwards;
    }
    @keyframes ghost-eat {
      0%   { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
      50%  { transform: translate(-50%,-50%) scale(1.8); opacity: 0.7; }
      100% { transform: translate(-50%,-50%) scale(0);   opacity: 0; }
    }
    .aisle-ghost.done {
      filter: drop-shadow(0 0 10px #3fb950);
      animation: ghost-bob 0.5s infinite alternate ease-in-out, ghost-done-fade 2.5s ease-out forwards;
    }
    @keyframes ghost-done-fade {
      0%   { opacity:1; }
      70%  { opacity:1; }
      100% { opacity:0; }
    }

    /* ── Task dependency arrow (canvas overlay) ── */
    #dep-canvas { position: absolute; inset: 0; pointer-events: none; z-index: 8; }

    /* ── Parallel badge ── */
    .parallel-badge {
      position: absolute; background: #111; border: 1px solid #ff0;
      color: #ff0; font-family: 'Press Start 2P', monospace; font-size: 0.28rem;
      padding: 2px 5px; border-radius: 3px; white-space: nowrap;
      z-index: 45; pointer-events: none;
      animation: badge-pop 0.3s ease-out;
    }
    @keyframes badge-pop { from{transform:scale(0)} to{transform:scale(1)} }

    /* ── Log ── */
    .log-panel {
      width: 100%; max-width: 1320px; margin-top: 12px; padding: 8px 12px;
      background: var(--panelbg); border: 1px solid var(--panelbd);
      font-family: 'VT323', monospace; font-size: 1.1rem; color: #778;
      height: 80px; overflow-y: auto; border-radius: 3px;
    }

    /* Scanlines */
    .office-floor::after {
      content:''; position: absolute; inset: 0;
      background: repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px);
      pointer-events: none; z-index: 50;
    }
  </style>
</head>
<body>

<div class="header">
  <div class="logo">⬤ AiSHA OFFICE</div>
  <div class="stats-bar">
    <span>AGENTS <span class="stat-value" id="agent-count">0</span></span>
    <span>TASKS  <span class="stat-value" id="task-count">0</span></span>
    <span>EVENTS <span class="stat-value" id="event-count">0</span></span>
  </div>
  ${ENABLE_DEMO_ENDPOINTS ? `<div style="display:flex;gap:8px"><button class="demo-btn" onclick="fetch('/test/handoff',{method:'POST'})">▶ PARALLEL</button><button class="demo-btn" onclick="fetch('/test/crm',{method:'POST'})">▶ CRM FLOW</button><button class="demo-btn" onclick="fetch('/test/subtasks',{method:'POST'})">▶ SUBTASKS</button><button class="demo-btn" style="border-color:#f85149;color:#f85149" onclick="fetch('/clear',{method:'POST'})">■ RESET</button></div>` : '<div></div>'}
</div>

<div class="main-layout">
  <div class="side-pane">
    <div class="pane-header">📥 INBOX</div>
    <div class="task-list" id="inbox-list"></div>
  </div>

  <div class="office-floor" id="office-floor">
    <!-- Maze walls -->
    <svg class="maze-bg" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g fill="none" stroke="#1a1aff" stroke-width="3" filter="url(#glow)" opacity="0.9">
        <rect x="30"  y="20"  width="270" height="210" rx="4"/>
        <rect x="365" y="20"  width="270" height="210" rx="4"/>
        <rect x="700" y="20"  width="270" height="210" rx="4"/>
        <rect x="30"  y="360" width="270" height="210" rx="4"/>
        <rect x="365" y="360" width="605" height="210" rx="4"/>
        <line x1="660" y1="360" x2="660" y2="570"/>
        <!-- doors -->
        <line x1="130" y1="230" x2="230" y2="230" stroke="#000" stroke-width="5"/>
        <line x1="465" y1="230" x2="565" y2="230" stroke="#000" stroke-width="5"/>
        <line x1="800" y1="230" x2="900" y2="230" stroke="#000" stroke-width="5"/>
        <line x1="130" y1="360" x2="230" y2="360" stroke="#000" stroke-width="5"/>
        <line x1="465" y1="360" x2="565" y2="360" stroke="#000" stroke-width="5"/>
        <line x1="760" y1="360" x2="860" y2="360" stroke="#000" stroke-width="5"/>
        <!-- aisle guide -->
        <line x1="30" y1="290" x2="970" y2="290" stroke="#1a1aff" stroke-width="1" stroke-dasharray="8,8" opacity="0.25"/>
      </g>
    </svg>

    <!-- Room labels -->
    <div class="room-label" style="left:42px;  top:28px;">OPS</div>
    <div class="room-label" style="left:377px; top:28px;">SALES</div>
    <div class="room-label" style="left:712px; top:28px;">MARKETING</div>
    <div class="room-label" style="left:42px;  top:368px;">PROJECT</div>
    <div class="room-label" style="left:377px; top:368px;">CLIENT SVC</div>
    <div class="room-label" style="left:672px; top:368px;">CUST SVC</div>

    <div id="pellets-layer"></div>

    <!-- Dependency arrow canvas -->
    <canvas id="dep-canvas" width="1000" height="600"></canvas>

    <!-- Zones -->
    <div class="zone inbox"  style="left:50px;  top:295px;"><div class="zone-icon">📥</div>INBOX</div>
    <div class="zone outbox" style="left:950px; top:295px;"><div class="zone-icon">📤</div>DONE</div>

    <div id="agent-layer"></div>
  </div>

  <div class="side-pane">
    <div class="pane-header">📤 OUTBOX</div>
    <div class="task-list" id="outbox-list"></div>
  </div>
</div>

<div class="log-panel" id="log">WAITING FOR EVENTS…</div>

<script>
// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const CANONICAL_ROLES = new Set([
  'ops_manager','sales_manager','marketing_manager',
  'project_manager','client_services_expert','customer_service_manager'
]);

const DESK = {
  ops_manager:              { x:165, y:125 },
  sales_manager:            { x:500, y:125 },
  marketing_manager:        { x:835, y:125 },
  project_manager:          { x:165, y:465 },
  client_services_expert:   { x:512, y:465 },
  customer_service_manager: { x:808, y:465 },
};
const DOOR = {
  ops_manager:              { x:165, y:242 },
  sales_manager:            { x:500, y:242 },
  marketing_manager:        { x:835, y:242 },
  project_manager:          { x:165, y:348 },
  client_services_expert:   { x:512, y:348 },
  customer_service_manager: { x:808, y:348 },
};
const INBOX_POS  = { x:50,  y:295 };
const OUTBOX_POS = { x:950, y:295 };
const AISLE_Y    = 290;

const COLOR = {
  ops_manager:              '#FFD700',
  sales_manager:            '#FF6B6B',
  marketing_manager:        '#4ECDC4',
  project_manager:          '#A571F7',
  client_services_expert:   '#FF9F1C',
  customer_service_manager: '#FF85A1',
};
const GHOSTS = ['👻','💀','🫧','✨','⭐','🌀'];

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════
const agents = {};
let inboxTasks  = [];
let outboxTasks = [];
const completedTaskIds = new Set();
let eventCount = 0;

// ── Causal delivery promises ─────────────────────────────────────────────
// task_assigned → resolves when Ops physically drops at desk
// subtask_assigned → resolves immediately (peer walk, no Ops involvement)
// run_started awaits this before animating as working
const deliveryMap = {};   // taskId → { promise, resolve }
function awaitDelivery(taskId) {
  if (!deliveryMap[taskId]) {
    let res; const p = new Promise(r => { res = r; });
    deliveryMap[taskId] = { promise: p, resolve: res };
  }
  return deliveryMap[taskId].promise;
}
function resolveDelivery(taskId) {
  if (deliveryMap[taskId]) { deliveryMap[taskId].resolve(); delete deliveryMap[taskId]; }
}

// ── Floating ghost registry ───────────────────────────────────────────────
// Each entry: { el, x, dir, targetX, taskId, eaten }
const floatingGhosts = {}; // taskId → ghost state
const GHOST_SPEED = 0.8;   // px per tick
const AISLE_GHOST_Y = AISLE_Y;

function spawnAisleGhost(taskId, spawnX, targetX, emoji, cssClass) {
  const floor = document.getElementById('office-floor');
  const el = document.createElement('div');
  el.className = 'aisle-ghost' + (cssClass ? ' ' + cssClass : '');
  el.textContent = emoji || '👻';
  el.style.left = spawnX + 'px';
  el.style.top  = AISLE_GHOST_Y + 'px';
  floor.appendChild(el);

  const dir = targetX >= spawnX ? 1 : -1;
  const state = { el, x: spawnX, dir, targetX, taskId, eaten: false };
  floatingGhosts[taskId] = state;
  return state;
}

function removeAisleGhost(taskId, animate) {
  const g = floatingGhosts[taskId];
  if (!g || g.eaten) return;
  g.eaten = true;
  if (animate) {
    g.el.classList.add('eaten');
    setTimeout(() => { g.el.remove(); delete floatingGhosts[taskId]; }, 400);
  } else {
    g.el.remove();
    delete floatingGhosts[taskId];
  }
}

// Ghost float loop — runs every 40ms, moves all active non-eaten ghosts
setInterval(() => {
  for (const [taskId, g] of Object.entries(floatingGhosts)) {
    if (g.eaten) continue;
    g.x += GHOST_SPEED * g.dir;
    if (g.x > 960) { g.dir = -1; }
    if (g.x < 40)  { g.dir =  1; }
    g.el.style.left = g.x + 'px';
  }
}, 40);

// ── Dependency tracking for "wait for N tasks before firing" ─────────────
// dependencyMap[triggerTaskId] = { needed: Set<taskId>, ready: fn }
const dependencyMap = {};
function registerDependency(triggerTaskId, prereqTaskIds, readyFn) {
  dependencyMap[triggerTaskId] = { needed: new Set(prereqTaskIds), ready: readyFn };
}
function notifyCompletion(taskId) {
  for (const [trigger, dep] of Object.entries(dependencyMap)) {
    dep.needed.delete(taskId);
    if (dep.needed.size === 0) {
      dep.ready();
      delete dependencyMap[trigger];
    }
  }
}

// ── Dependency arrow drawing ──────────────────────────────────────────────
const depCanvas = document.getElementById('dep-canvas');
const depCtx    = depCanvas.getContext('2d');
const depArrows = [];  // { from: role, to: role, label, alpha }

function drawDepArrows() {
  depCtx.clearRect(0, 0, 1000, 600);
  depArrows.forEach((arr, i) => {
    const f = agents[arr.from];
    const t = agents[arr.to];
    if (!f || !t) return;
    depCtx.save();
    depCtx.globalAlpha = arr.alpha ?? 1;
    depCtx.strokeStyle = '#ffff00';
    depCtx.lineWidth   = 1.5;
    depCtx.setLineDash([5, 4]);
    depCtx.beginPath();
    depCtx.moveTo(f.x, f.y);
    depCtx.lineTo(t.x, t.y);
    depCtx.stroke();
    // Arrowhead
    const ang = Math.atan2(t.y - f.y, t.x - f.x);
    depCtx.setLineDash([]);
    depCtx.fillStyle = '#ffff00';
    depCtx.beginPath();
    depCtx.moveTo(t.x, t.y);
    depCtx.lineTo(t.x - 10*Math.cos(ang-0.4), t.y - 10*Math.sin(ang-0.4));
    depCtx.lineTo(t.x - 10*Math.cos(ang+0.4), t.y - 10*Math.sin(ang+0.4));
    depCtx.closePath();
    depCtx.fill();
    // Label
    if (arr.label) {
      depCtx.font = '10px "Press Start 2P"';
      depCtx.fillStyle = '#ff0';
      const mx = (f.x + t.x) / 2;
      const my = (f.y + t.y) / 2 - 8;
      depCtx.fillText(arr.label, mx - depCtx.measureText(arr.label).width/2, my);
    }
    depCtx.restore();
  });
}

function addDepArrow(fromRole, toRole, label) {
  depArrows.push({ from: fromRole, to: toRole, label, alpha: 1 });
  drawDepArrows();
  // Fade out after 5s
  const idx = depArrows.length - 1;
  setTimeout(() => {
    const arr = depArrows[idx];
    if (!arr) return;
    let alpha = 1;
    const fade = setInterval(() => {
      alpha -= 0.05;
      arr.alpha = Math.max(0, alpha);
      drawDepArrows();
      if (alpha <= 0) { depArrows.splice(idx, 1); clearInterval(fade); }
    }, 100);
  }, 4000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PELLETS
// ═══════════════════════════════════════════════════════════════════════════
(function buildPellets() {
  const layer = document.getElementById('pellets-layer');
  for (let x = 100; x < 920; x += 28) {
    const d = document.createElement('div');
    d.className = 'pellet';
    d.style.left = x + 'px'; d.style.top = AISLE_Y + 'px';
    d.dataset.x = x; d.dataset.y = AISLE_Y;
    layer.appendChild(d);
  }
  [[165,242,165,348],[500,242,500,348],[835,242,835,348]].forEach(([x,y1,,y2]) => {
    for (let y = y1; y <= y2; y += 28) {
      const d = document.createElement('div');
      d.className = 'pellet';
      d.style.left = x+'px'; d.style.top = y+'px';
      d.dataset.x = x; d.dataset.y = y;
      layer.appendChild(d);
    }
  });
  [[60,295],[940,295],[165,245],[835,245],[165,348],[835,348]].forEach(([x,y]) => {
    const d = document.createElement('div');
    d.className = 'power-pellet';
    d.style.left = x+'px'; d.style.top = y+'px';
    layer.appendChild(d);
  });
})();

function eatPelletsNear(x, y, r=28) {
  document.querySelectorAll('.pellet').forEach(p => {
    const dx = parseFloat(p.dataset.x) - x;
    const dy = parseFloat(p.dataset.y) - y;
    if (dx*dx + dy*dy < r*r) p.classList.add('eaten');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const logEl = document.getElementById('log');
function log(msg) { logEl.textContent = msg + '\\n' + logEl.textContent.slice(0, 900); }

function roleOf(id)    { return (id||'').split(':')[0]; }
function colorOf(role) { return COLOR[role] || '#aaa'; }
function ghostFor(id)  {
  let h = 0; for (const c of (id||'')) h=(h*31+c.charCodeAt(0))&0xffff;
  return GHOSTS[h % GHOSTS.length];
}
function labelOf(role) {
  return role.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join('\\n');
}

// ── Parallel badge flash ──
function flashParallelBadge(x, y, text) {
  const b = document.createElement('div');
  b.className = 'parallel-badge';
  b.style.left = (x - 30) + 'px';
  b.style.top  = (y - 50) + 'px';
  b.textContent = text;
  document.getElementById('office-floor').appendChild(b);
  setTimeout(() => b.remove(), 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AGENT DOM
// ═══════════════════════════════════════════════════════════════════════════
function ensureAgentEl(role) {
  const sid = 'agent-' + role.replace(/[^a-zA-Z0-9]/g,'_');
  let el = document.getElementById(sid);
  if (el) return el;
  const c = colorOf(role);
  el = document.createElement('div');
  el.id = sid; el.className = 'agent idle facing-right';
  el.innerHTML = \`
    <svg class="pacman-svg" viewBox="0 0 46 46">
      <g class="pm-group">
        <path class="pm-body" fill="\${c}" d="M23,23 L46,8 A23,23 0 1,0 46,38 Z"/>
        <circle cx="33" cy="11" r="3" fill="#111"/>
      </g>
    </svg>
    <span class="agent-label">\${role.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}</span>
    <div class="speech-bubble"></div>
    <div class="ghost-carry">\${ghostFor(role)}</div>
  \`;
  document.getElementById('agent-layer').appendChild(el);
  return el;
}

function updateAgentEl(role) {
  const a = agents[role]; if (!a) return;
  const el = ensureAgentEl(role);
  el.style.left = a.x + 'px'; el.style.top = a.y + 'px';
  el.classList.remove('facing-right','facing-left','facing-up','facing-down');
  el.classList.add('facing-' + (a.facing||'right'));
  el.classList.remove('idle','walking','working');
  el.classList.add(a.status||'idle');
  el.querySelector('.ghost-carry').classList.toggle('visible', !!a.carrying);
  eatPelletsNear(a.x, a.y);
  drawDepArrows();  // refresh arrows when agents move
}

function showBubble(role, text, dur=3500) {
  const el = document.getElementById('agent-'+role.replace(/[^a-zA-Z0-9]/g,'_'));
  if (!el) return;
  const b = el.querySelector('.speech-bubble'); if (!b) return;
  b.textContent = text; b.classList.add('visible');
  if (b._t) clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('visible'), dur);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AGENT STATE
// ═══════════════════════════════════════════════════════════════════════════
function ensureAgent(agentId) {
  const role = roleOf(agentId);
  if (!agents[role]) {
    const p = DESK[role] || DESK['ops_manager'];
    agents[role] = { x:p.x, y:p.y, homeX:p.x, homeY:p.y,
                     facing:'right', status:'idle', carrying:false,
                     queue:[], busy:false };
    updateAgentEl(role);
    document.getElementById('agent-count').textContent = Object.keys(agents).length;
  }
  return agents[role];
}

function initAllAgents() {
  CANONICAL_ROLES.forEach(r => ensureAgent(r+':init'));
  log('ALL AGENTS ON STANDBY');
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTION QUEUE (per-agent, fully independent)
// ═══════════════════════════════════════════════════════════════════════════
function queueAction(role, action) {
  if (!agents[role]) return;
  agents[role].queue.push(action);
  processQueue(role);
}

function faceToward(role, tx, ty) {
  const a = agents[role]; if (!a) return;
  const dx = tx - a.x, dy = ty - a.y;
  a.facing = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? 'right' : 'left')
    : (dy >= 0 ? 'down'  : 'up');
}

// Build waypoints for room-aware routing.
// Rule: movement is always axis-aligned (no diagonals).
// Path is a Manhattan route: exit room vertically → traverse aisle horizontally → enter dest room vertically.
function buildWaypoints(role, tx, ty) {
  const a = agents[role]; if (!a) return [[tx,ty]];
  const pts = [];
  const cx = a.x, cy = a.y;  // current position (snapshot — don't re-read during build)

  const inTopRoom    = cy < 240;
  const inBottomRoom = cy > 350;
  const inRoom       = inTopRoom || inBottomRoom;

  const destInTopRoom    = ty < 240;
  const destInBottomRoom = ty > 350;
  const destInRoom       = destInTopRoom || destInBottomRoom;

  const ownDoor  = DOOR[role];
  const destRole = Object.entries(DESK).find(([,p]) => Math.abs(p.x-tx)<15 && Math.abs(p.y-ty)<15)?.[0];
  const destDoor = destRole ? DOOR[destRole] : null;

  // Step 1: if currently inside a room, walk vertically to the door threshold
  if (inRoom && ownDoor && Math.abs(cy - ownDoor.y) > 2) {
    pts.push([cx, ownDoor.y]);   // straight down/up to door row
  }

  const afterDoorX = pts.length ? pts[pts.length-1][0] : cx;
  const afterDoorY = pts.length ? pts[pts.length-1][1] : cy;

  if (destInRoom && destDoor) {
    // Step 2a: going into a room — go to aisle, walk horizontally to dest door column, enter room
    if (Math.abs(afterDoorY - AISLE_Y) > 2) pts.push([afterDoorX, AISLE_Y]);  // down/up to aisle
    pts.push([destDoor.x, AISLE_Y]);    // horizontal traverse
    pts.push([destDoor.x, destDoor.y]); // enter dest room door
    pts.push([tx, ty]);                 // walk to desk inside room
  } else {
    // Step 2b: going to aisle/inbox/outbox — go to aisle, then walk horizontally to target x, then y
    if (Math.abs(afterDoorY - AISLE_Y) > 2) pts.push([afterDoorX, AISLE_Y]);
    if (Math.abs(afterDoorX - tx) > 2 || pts.length === 0) pts.push([tx, AISLE_Y]); // horizontal
    if (Math.abs(ty - AISLE_Y) > 2) pts.push([tx, ty]);                             // vertical to final y
  }

  // Always start from current position (don't include it as a waypoint)
  // Dedupe consecutive identical points
  return pts.filter((p,i) => i===0 || p[0]!==pts[i-1][0] || p[1]!==pts[i-1][1]);
}

function queueMove(role, tx, ty) {
  buildWaypoints(role, tx, ty).forEach(([wx,wy]) => queueAction(role, ['move',wx,wy]));
}

async function processQueue(role) {
  const a = agents[role];
  if (!a || a.busy || a.queue.length === 0) return;
  a.busy = true;
  const act = a.queue.shift();
  try {
    switch (act[0]) {
      case 'move': {
        const [,tx,ty] = act;
        faceToward(role, tx, ty);
        a.status = 'walking'; a.x = tx; a.y = ty; updateAgentEl(role);
        await new Promise(r => setTimeout(r, 620));
        a.status = 'idle'; updateAgentEl(role);
        break;
      }
      case 'wait': await new Promise(r => setTimeout(r, act[1])); break;
      case 'set':  a[act[1]] = act[2]; updateAgentEl(role); break;
      case 'exec': await act[1](); break;
      case 'bubble': showBubble(role, act[1], act[2]||3500); break;
    }
  } catch(e) { console.error('queue err', e); }
  a.busy = false;
  processQueue(role);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PANE RENDERING
// ═══════════════════════════════════════════════════════════════════════════
function renderPanes() {
  document.getElementById('task-count').textContent = inboxTasks.length + outboxTasks.length;
  const inboxEl = document.getElementById('inbox-list');
  inboxEl.innerHTML = inboxTasks.length === 0
    ? '<div style="padding:10px;color:#334;text-align:center;font-size:0.9rem;">EMPTY</div>'
    : inboxTasks.map(t => {
        const short = (t.id||'').split(':').pop().substring(0,8);
        const aLabel = (t.agent||'queued').split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
        return \`<div class="task-item queued">
          <span class="task-id">\${short}</span>
          <span class="task-summary">\${t.summary||'Task'}</span>
          <span class="task-meta"><strong>→</strong> \${aLabel}</span>
        </div>\`;
      }).join('');

  const outboxEl = document.getElementById('outbox-list');
  outboxEl.innerHTML = outboxTasks.map(t => {
    const short = (t.id||'').split(':').pop().substring(0,8);
    return \`<div class="task-item \${t.status}">
      <span class="task-id">\${short}</span>
      <span class="task-summary">\${t.summary||'Task'}</span>
      <span class="task-meta">\${t.status==='failed'?'✗ FAILED':'✓ DONE'}</span>
    </div>\`;
  }).join('');
}

function ensureInInbox(evt) {
  const id = evt.task_id || evt.run_id; if (!id) return;
  if (completedTaskIds.has(id)) return;
  if (outboxTasks.some(t=>t.id===id)) return;
  const existing = inboxTasks.find(t=>t.id===id);
  if (existing) {
    // Update agent assignment if we now know who it's going to
    if (evt.to_agent_id) existing.agent = roleOf(evt.to_agent_id);
    return;
  }
  inboxTasks.push({
    id,
    agent: evt.to_agent_id ? roleOf(evt.to_agent_id) : (evt.agent_id ? roleOf(evt.agent_id) : 'queued'),
    summary: evt.input_summary||evt.summary||evt.title||'New Task',
    ts: evt.ts,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  GHOST DISPATCH  — spawn ghost at inbox, assigned agent walks out & eats it
// ═══════════════════════════════════════════════════════════════════════════
function dispatchGhost(taskId, assigneeRole) {
  ensureAgent(assigneeRole);

  // Spawn ghost at inbox drifting toward assignee's door x
  const door = DOOR[assigneeRole] || { x: OUTBOX_POS.x };
  spawnAisleGhost(taskId, INBOX_POS.x, door.x, '👻', null);

  // Remove from inbox pane
  inboxTasks = inboxTasks.filter(t => t.id !== taskId);
  renderPanes();

  // Resolve delivery immediately — run_started should not block on the walk animation
  resolveDelivery(taskId);

  // Tag agent so the proximity check knows which ghost it's hunting
  agents[assigneeRole]._huntingGhost = taskId;

  // Agent walks out to aisle, eats ghost (cosmetic), returns home
  queueMove(assigneeRole, door.x, AISLE_GHOST_Y);
  queueAction(assigneeRole, ['exec', async () => {
    removeAisleGhost(taskId, true);
    agents[assigneeRole]._huntingGhost = null;
    showBubble(assigneeRole, 'WAKA!');
  }]);
  queueMove(assigneeRole, DESK[assigneeRole].x, DESK[assigneeRole].y);
}

// ── Peer ghost: agent spawns ghost from their door toward a target ──────────
function spawnPeerGhost(fromRole, toRole, taskId, emoji) {
  const fromDoor = DOOR[fromRole] || { x: agents[fromRole]?.x || 500 };
  const toDoor   = DOOR[toRole]   || { x: OUTBOX_POS.x };
  spawnAisleGhost(taskId, fromDoor.x, toDoor.x, emoji || '👻', null);

  ensureAgent(toRole);

  // Resolve delivery immediately so run_started doesn’t deadlock
  resolveDelivery(taskId);

  agents[toRole]._huntingGhost = taskId;

  // Target agent walks out to eat ghost (cosmetic), returns home
  queueMove(toRole, toDoor.x, AISLE_GHOST_Y);
  queueAction(toRole, ['exec', async () => {
    removeAisleGhost(taskId, true);
    agents[toRole]._huntingGhost = null;
    showBubble(toRole, 'GOT IT!');
    agents[toRole].status = 'working';
    updateAgentEl(toRole);
  }]);
  queueMove(toRole, DESK[toRole].x, DESK[toRole].y);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EVENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════
function handleEvent(evt) {
  eventCount++;
  document.getElementById('event-count').textContent = eventCount;

  if (evt.ts && new Date(evt.ts).getTime() < Date.now() - 60_000) {
    log('[SKIP] old: ' + evt.type); return;
  }

  // ── Reset ──
  if (evt.type === 'system_reset') {
    inboxTasks = []; outboxTasks = []; completedTaskIds.clear();
    // Kill all floating ghosts
    Object.values(floatingGhosts).forEach(g => { try { g.el.remove(); } catch(_){} });
    Object.keys(floatingGhosts).forEach(k => delete floatingGhosts[k]);
    Object.keys(deliveryMap).forEach(k => { deliveryMap[k].resolve(); delete deliveryMap[k]; });
    Object.keys(dependencyMap).forEach(k => delete dependencyMap[k]);
    depArrows.length = 0; depCtx.clearRect(0,0,1000,600);
    Object.values(agents).forEach(a => {
      a.queue=[]; a.busy=false; a.carrying=false; a.status='idle';
      a.x=a.homeX; a.y=a.homeY;
    });
    Object.keys(agents).forEach(r => updateAgentEl(r));
    renderPanes(); eventCount=0;
    document.getElementById('event-count').textContent='0';
    log('[RESET]'); return;
  }

  log('['+evt.type+'] agent='+(evt.agent_id||'-')+' task='+(evt.task_id||evt.run_id||'-'));

  // ── Spawn ──
  if (evt.type === 'agent_spawned' || evt.type === 'agent_registered') {
    ensureAgent(evt.agent_id); return;
  }

  // ── Enqueue ──
  if (evt.type === 'task_created' || evt.type === 'task_enqueued') {
    ensureInInbox(evt); renderPanes(); return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  TASK_ASSIGNED  — ghost spawns at inbox, assigned agent walks out to eat it
  // ──────────────────────────────────────────────────────────────────────
  if (evt.type === 'task_assigned') {
    const taskId       = evt.task_id || evt.run_id;
    const assigneeRole = roleOf(evt.to_agent_id || evt.agent_id);
    // Skip if no assignee, or task already completed/in-outbox (out-of-order replay)
    if (!taskId || !assigneeRole) return;
    if (completedTaskIds.has(taskId)) return;
    if (outboxTasks.some(t => t.id === taskId)) return;

    awaitDelivery(taskId);
    ensureInInbox(evt); renderPanes();
    dispatchGhost(taskId, assigneeRole);
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  SUBTASK_ASSIGNED  — peer-to-peer: from_agent walks directly to to_agent
  //  Use when an ALREADY-WORKING agent spawns a sub-task for another agent
  //  without going through Ops. Visualised as a direct walk between agents.
  //  The from_agent keeps their ghost (still working on parent task) and
  //  the to_agent receives a new ghost immediately.
  // ──────────────────────────────────────────────────────────────────────
  if (evt.type === 'subtask_assigned') {
    const taskId   = evt.task_id || evt.run_id;
    const fromRole = roleOf(evt.agent_id || evt.from_agent_id);
    const toRole   = roleOf(evt.to_agent_id);
    if (!taskId || !toRole) return;

    ensureAgent(fromRole); ensureAgent(toRole);
    awaitDelivery(taskId);

    addDepArrow(fromRole, toRole, evt.reason || 'SUB');

    // fromRole walks to their door, spawns ghost toward toRole's door
    const fromDoor = DOOR[fromRole];
    queueAction(fromRole, ['bubble', '📋 SPAWNING SUB-TASK…']);
    queueMove(fromRole, fromDoor.x, fromDoor.y);
    queueAction(fromRole, ['exec', async () => {
      spawnPeerGhost(fromRole, toRole, taskId, '👻');
    }]);
    queueMove(fromRole, agents[fromRole].homeX, agents[fromRole].homeY);
    queueAction(fromRole, ['set', 'status', 'working']);
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  RUN_STARTED  — wait for delivery, then animate as working
  // ──────────────────────────────────────────────────────────────────────
  if (evt.type === 'run_started' || evt.type === 'task_started') {
    const agentId = evt.agent_id;
    const taskId  = evt.task_id || evt.run_id;
    if (!agentId) return;
    const role = roleOf(agentId);
    ensureAgent(agentId);
    queueAction(role, ['exec', async () => {
      if (taskId) await awaitDelivery(taskId);
      agents[role].status = 'working';
      updateAgentEl(role);
      showBubble(role, 'ANALYZING…');
    }]);
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  HANDOFF  — agent walks directly to target, transfers ghost
  // ──────────────────────────────────────────────────────────────────────
  if (evt.type === 'handoff') {
    const fromRole = roleOf(evt.agent_id || evt.from_agent_id);
    const toRole   = roleOf(evt.to_agent_id);
    if (!fromRole || !toRole) return;
    ensureAgent(fromRole); ensureAgent(toRole);
    const taskId = evt.task_id || evt.run_id;

    addDepArrow(fromRole, toRole, evt.reason || 'HANDOFF');

    // fromRole walks to their door, spawns ghost toward toRole's door
    const fromDoor = DOOR[fromRole];
    queueAction(fromRole, ['bubble', '🔀 HANDING OFF…']);
    queueMove(fromRole, fromDoor.x, fromDoor.y);
    queueAction(fromRole, ['exec', async () => {
      agents[fromRole].status = 'idle';
      updateAgentEl(fromRole);
      if (taskId) spawnPeerGhost(fromRole, toRole, taskId, '👻');
    }]);
    queueMove(fromRole, agents[fromRole].homeX, agents[fromRole].homeY);
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  TOOL_CALL
  // ──────────────────────────────────────────────────────────────────────
  if (evt.type === 'tool_call') {
    const role = roleOf(evt.agent_id); if (!role) return;
    ensureAgent(evt.agent_id);
    const tool = (evt.tool_name||'TOOL').toUpperCase().replace(/_/g,' ');
    queueAction(role, ['set', 'status', 'working']);
    queueAction(role, ['bubble', tool+'…']);
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  RUN_COMPLETED / TASK_FAILED  — walk to outbox, drop, go home
  // ──────────────────────────────────────────────────────────────────────
  if (evt.type === 'run_completed' || evt.type === 'task_completed' || evt.type === 'task_failed') {
    const agentId = evt.agent_id; if (!agentId) return;
    const role   = roleOf(agentId);
    const taskId = evt.task_id || evt.run_id;
    const status = evt.type === 'task_failed' ? 'failed' : 'completed';
    ensureAgent(agentId);

    queueAction(role, ['bubble', status==='failed' ? '✗ BLOCKED' : '✓ WAKA!']);
    queueAction(role, ['set', 'status', 'idle']);

    // Update outbox immediately — don't wait for walk animation
    if (taskId && !outboxTasks.some(t => t.id === taskId)) {
      inboxTasks = inboxTasks.filter(t => t.id !== taskId);
      completedTaskIds.add(taskId);
      notifyCompletion(taskId);
      outboxTasks.unshift({ id: taskId, summary: evt.output_summary||evt.summary||'Done', status, ts: evt.ts });
      if (outboxTasks.length > 50) outboxTasks.pop();
      renderPanes();
    }

    // Walk to door, spawn done-ghost drifting east toward outbox, go home
    const completeDoor = DOOR[role];
    queueMove(role, completeDoor.x, completeDoor.y);
    queueAction(role, ['exec', async () => {
      const doneId = (taskId||role) + ':done:' + Date.now();
      spawnAisleGhost(doneId, completeDoor.x, OUTBOX_POS.x, status==='failed' ? '💀' : '✨', 'done');
      setTimeout(() => { if (floatingGhosts[doneId]) removeAisleGhost(doneId, false); }, 3000);
    }]);
    queueMove(role, agents[role]?.homeX, agents[role]?.homeY);
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  IDLE MICRO-ANIMATIONS  (left/right only — no upside-down flips)
// ═══════════════════════════════════════════════════════════════════════════
setInterval(() => {
  const idle = Object.entries(agents).filter(([,a])=>a.status==='idle'&&!a.busy&&a.queue.length===0);
  if (!idle.length) return;
  const [role] = idle[Math.floor(Math.random()*idle.length)];
  const facing = Math.random() > 0.5 ? 'right' : 'left';
  queueAction(role, ['set', 'facing', facing]);
  queueAction(role, ['set', 'status', 'walking']);
  queueAction(role, ['wait', 300]);
  queueAction(role, ['set', 'facing', 'right']);
  queueAction(role, ['set', 'status', 'idle']);
}, 4000);

// ═══════════════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════════════
initAllAgents();

// SSE
const qs = new URLSearchParams(window.location.search);
const sseQs = new URLSearchParams();
sseQs.set('replay','1');
['tenant_id','run_id','token'].forEach(k => { if (qs.get(k)) sseQs.set(k,qs.get(k)); });
const es = new EventSource('/sse?'+sseQs.toString());
es.onmessage = e => { try { handleEvent(JSON.parse(e.data)); } catch(err){console.error(err);} };
es.onerror   = () => log('CONNECTION LOST… RECONNECTING');
</script>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────────────────
//  REST ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/events', requireVizAuth, (req, res) => {
  res.json({ count: events.length, events });
});

if (ENABLE_DEMO_ENDPOINTS) {
  // ── Demo 1: Parallel tasks (fan-out from Ops) ──────────────────────────────
  app.post('/test/handoff', requireVizAuth, (req, res) => {
    const now = new Date().toISOString();
    const taskA = 'task-a-' + Date.now(); // sales campaign
    const taskB = 'task-b-' + Date.now(); // client onboarding

    const seq = [
      // Spawn
      ...[
        'ops_manager',
        'sales_manager',
        'marketing_manager',
        'project_manager',
        'client_services_expert',
        'customer_service_manager',
      ].map((r, i) => ({
        delay: i * 200,
        evt: { type: 'agent_spawned', agent_id: r + ':dev', agent_name: r, ts: now },
      })),

      // Enqueue both
      {
        delay: 1400,
        evt: { type: 'task_enqueued', task_id: taskA, input_summary: 'Q1 Sales Campaign', ts: now },
      },
      {
        delay: 1600,
        evt: {
          type: 'task_enqueued',
          task_id: taskB,
          input_summary: 'Client Onboarding: Acme',
          ts: now,
        },
      },

      // Assign A → Sales, B → Project  (Ops walks sequentially per dispatch queue)
      {
        delay: 2000,
        evt: { type: 'task_assigned', task_id: taskA, to_agent_id: 'sales_manager:dev', ts: now },
      },
      {
        delay: 2200,
        evt: { type: 'task_assigned', task_id: taskB, to_agent_id: 'project_manager:dev', ts: now },
      },

      // Both run_started — frontend awaits delivery promise per task
      {
        delay: 3500,
        evt: { type: 'run_started', agent_id: 'sales_manager:dev', task_id: taskA, ts: now },
      },
      {
        delay: 4200,
        evt: { type: 'run_started', agent_id: 'project_manager:dev', task_id: taskB, ts: now },
      },

      // Parallel tool calls (fire simultaneously — different agents, different queues)
      {
        delay: 6000,
        evt: {
          type: 'tool_call',
          agent_id: 'sales_manager:dev',
          tool_name: 'analyze_market',
          ts: now,
        },
      },
      {
        delay: 6000,
        evt: {
          type: 'tool_call',
          agent_id: 'project_manager:dev',
          tool_name: 'create_timeline',
          ts: now,
        },
      },

      // Handoffs (also parallel)
      {
        delay: 9000,
        evt: {
          type: 'handoff',
          agent_id: 'sales_manager:dev',
          to_agent_id: 'marketing_manager:dev',
          task_id: taskA,
          reason: 'Create Assets',
          ts: now,
        },
      },
      {
        delay: 9000,
        evt: {
          type: 'handoff',
          agent_id: 'project_manager:dev',
          to_agent_id: 'client_services_expert:dev',
          task_id: taskB,
          reason: 'Schedule Kickoff',
          ts: now,
        },
      },

      // Post-handoff work (parallel)
      {
        delay: 11000,
        evt: {
          type: 'tool_call',
          agent_id: 'marketing_manager:dev',
          tool_name: 'design_ads',
          ts: now,
        },
      },
      {
        delay: 11000,
        evt: {
          type: 'tool_call',
          agent_id: 'client_services_expert:dev',
          tool_name: 'email_client',
          ts: now,
        },
      },

      // Completions (parallel)
      {
        delay: 14000,
        evt: {
          type: 'run_completed',
          agent_id: 'marketing_manager:dev',
          task_id: taskA,
          output_summary: 'Campaign Ready',
          ts: now,
        },
      },
      {
        delay: 14000,
        evt: {
          type: 'run_completed',
          agent_id: 'client_services_expert:dev',
          task_id: taskB,
          output_summary: 'Onboarding Scheduled',
          ts: now,
        },
      },
    ];

    let max = 0;
    seq.forEach(({ delay, evt }) => {
      setTimeout(() => pushEvent(evt), delay);
      max = Math.max(max, delay);
    });
    res.json({ status: 'ok', scenario: 'parallel-tasks', events: seq.length, duration_ms: max });
  });

  // ── Demo 2: CRM Scenario ───────────────────────────────────────────────────
  // "Create a note + set up meeting (parallel: Sales + Project)
  //  THEN Customer Service sends email about the meeting"
  // Shows: parallel fan-out → sequential dependency gate → triggered follow-up
  app.post('/test/crm', requireVizAuth, (req, res) => {
    const now = new Date().toISOString();
    const noteT = 'note-' + Date.now();
    const meetT = 'meeting-' + Date.now();
    const emailT = 'email-' + Date.now();

    const seq = [
      // Spawn all agents
      ...[
        'ops_manager',
        'sales_manager',
        'marketing_manager',
        'project_manager',
        'client_services_expert',
        'customer_service_manager',
      ].map((r, i) => ({
        delay: i * 150,
        evt: { type: 'agent_spawned', agent_id: r + ':dev', agent_name: r, ts: now },
      })),

      // ── Step 1: Two parallel tasks arrive ──
      // Enqueue both
      {
        delay: 1200,
        evt: {
          type: 'task_enqueued',
          task_id: noteT,
          input_summary: 'Create note on Acme file',
          ts: now,
        },
      },
      {
        delay: 1400,
        evt: {
          type: 'task_enqueued',
          task_id: meetT,
          input_summary: 'Set up meeting for tomorrow',
          ts: now,
        },
      },

      // Assign (Ops dispatches sequentially but both agents work in parallel once delivered)
      {
        delay: 1800,
        evt: { type: 'task_assigned', task_id: noteT, to_agent_id: 'sales_manager:dev', ts: now },
      },
      {
        delay: 2000,
        evt: { type: 'task_assigned', task_id: meetT, to_agent_id: 'project_manager:dev', ts: now },
      },

      // Start working (waits for causal delivery)
      {
        delay: 3200,
        evt: { type: 'run_started', agent_id: 'sales_manager:dev', task_id: noteT, ts: now },
      },
      {
        delay: 4000,
        evt: { type: 'run_started', agent_id: 'project_manager:dev', task_id: meetT, ts: now },
      },

      // Parallel tool calls
      {
        delay: 5800,
        evt: { type: 'tool_call', agent_id: 'sales_manager:dev', tool_name: 'write_note', ts: now },
      },
      {
        delay: 5800,
        evt: {
          type: 'tool_call',
          agent_id: 'project_manager:dev',
          tool_name: 'create_calendar_event',
          ts: now,
        },
      },

      // ── Step 2: Both complete (parallel) ──
      {
        delay: 9000,
        evt: {
          type: 'run_completed',
          agent_id: 'sales_manager:dev',
          task_id: noteT,
          output_summary: 'Note saved to Acme file',
          ts: now,
        },
      },
      {
        delay: 9200,
        evt: {
          type: 'run_completed',
          agent_id: 'project_manager:dev',
          task_id: meetT,
          output_summary: 'Meeting scheduled: 10am tomorrow',
          ts: now,
        },
      },

      // ── Step 3: AFTER both complete, Customer Service sends email ──
      // (dependency gate: emailT depends on noteT AND meetT completing)
      // We enqueue the email task slightly after both complete, simulating
      // the orchestrator firing once all prerequisites are done.
      {
        delay: 10500,
        evt: {
          type: 'task_enqueued',
          task_id: emailT,
          input_summary: 'Email Acme: meeting confirmation',
          ts: now,
        },
      },
      {
        delay: 10800,
        evt: {
          type: 'task_assigned',
          task_id: emailT,
          to_agent_id: 'customer_service_manager:dev',
          ts: now,
        },
      },
      {
        delay: 12000,
        evt: {
          type: 'run_started',
          agent_id: 'customer_service_manager:dev',
          task_id: emailT,
          ts: now,
        },
      },
      {
        delay: 13500,
        evt: {
          type: 'tool_call',
          agent_id: 'customer_service_manager:dev',
          tool_name: 'send_email',
          ts: now,
        },
      },
      {
        delay: 16000,
        evt: {
          type: 'run_completed',
          agent_id: 'customer_service_manager:dev',
          task_id: emailT,
          output_summary: 'Email sent to Acme contact',
          ts: now,
        },
      },
    ];

    let max = 0;
    seq.forEach(({ delay, evt }) => {
      setTimeout(() => pushEvent(evt), delay);
      max = Math.max(max, delay);
    });
    res.json({
      status: 'ok',
      scenario: 'crm-parallel-then-sequential',
      events: seq.length,
      duration_ms: max,
    });
  });

  // ── Demo 3: Subtask delegation (agent spawns peer work mid-task) ───────────
  // Sales is working, discovers it needs marketing collateral AND a client
  // email. Spawns both as subtasks directly (no Ops involvement).
  app.post('/test/subtasks', requireVizAuth, (req, res) => {
    const now = new Date().toISOString();
    const mainT = 'main-' + Date.now();
    const subT1 = 'sub1-' + Date.now();
    const subT2 = 'sub2-' + Date.now();

    const seq = [
      ...[
        'ops_manager',
        'sales_manager',
        'marketing_manager',
        'project_manager',
        'client_services_expert',
        'customer_service_manager',
      ].map((r, i) => ({
        delay: i * 150,
        evt: { type: 'agent_spawned', agent_id: r + ':dev', agent_name: r, ts: now },
      })),

      // Main task: Sales analyses opportunity
      {
        delay: 1200,
        evt: {
          type: 'task_enqueued',
          task_id: mainT,
          input_summary: 'Analyse Acme opportunity',
          ts: now,
        },
      },
      {
        delay: 1500,
        evt: { type: 'task_assigned', task_id: mainT, to_agent_id: 'sales_manager:dev', ts: now },
      },
      {
        delay: 2800,
        evt: { type: 'run_started', agent_id: 'sales_manager:dev', task_id: mainT, ts: now },
      },
      {
        delay: 4500,
        evt: {
          type: 'tool_call',
          agent_id: 'sales_manager:dev',
          tool_name: 'review_account',
          ts: now,
        },
      },

      // Sales spawns two PARALLEL subtasks to peers (no Ops)
      {
        delay: 7000,
        evt: {
          type: 'subtask_assigned',
          agent_id: 'sales_manager:dev',
          from_agent_id: 'sales_manager:dev',
          to_agent_id: 'marketing_manager:dev',
          task_id: subT1,
          reason: 'COLLATERAL',
          ts: now,
        },
      },
      {
        delay: 7200,
        evt: {
          type: 'subtask_assigned',
          agent_id: 'sales_manager:dev',
          from_agent_id: 'sales_manager:dev',
          to_agent_id: 'customer_service_manager:dev',
          task_id: subT2,
          reason: 'EMAIL',
          ts: now,
        },
      },

      // Both subtasks start (parallel)
      {
        delay: 8500,
        evt: { type: 'run_started', agent_id: 'marketing_manager:dev', task_id: subT1, ts: now },
      },
      {
        delay: 8500,
        evt: {
          type: 'run_started',
          agent_id: 'customer_service_manager:dev',
          task_id: subT2,
          ts: now,
        },
      },
      {
        delay: 9500,
        evt: {
          type: 'tool_call',
          agent_id: 'marketing_manager:dev',
          tool_name: 'create_brochure',
          ts: now,
        },
      },
      {
        delay: 9500,
        evt: {
          type: 'tool_call',
          agent_id: 'customer_service_manager:dev',
          tool_name: 'send_email',
          ts: now,
        },
      },

      // Subtasks complete (parallel)
      {
        delay: 13000,
        evt: {
          type: 'run_completed',
          agent_id: 'marketing_manager:dev',
          task_id: subT1,
          output_summary: 'Brochure ready',
          ts: now,
        },
      },
      {
        delay: 13200,
        evt: {
          type: 'run_completed',
          agent_id: 'customer_service_manager:dev',
          task_id: subT2,
          output_summary: 'Email sent',
          ts: now,
        },
      },

      // Main task (Sales) completes after peers finish
      {
        delay: 14500,
        evt: {
          type: 'tool_call',
          agent_id: 'sales_manager:dev',
          tool_name: 'compile_report',
          ts: now,
        },
      },
      {
        delay: 16500,
        evt: {
          type: 'run_completed',
          agent_id: 'sales_manager:dev',
          task_id: mainT,
          output_summary: 'Opportunity report complete',
          ts: now,
        },
      },
    ];

    let max = 0;
    seq.forEach(({ delay, evt }) => {
      setTimeout(() => pushEvent(evt), delay);
      max = Math.max(max, delay);
    });
    res.json({
      status: 'ok',
      scenario: 'subtask-delegation',
      events: seq.length,
      duration_ms: max,
    });
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
  if (req.query.replay === '1') {
    for (const evt of events.slice(-500)) {
      if (!passesFilter(evt, filter)) continue;
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }
  }
  req.on('close', () => sseClients.delete(res));
});

function clearAll(res) {
  const old = events.length;
  events.length = 0;
  const resetEvt = { type: 'system_reset', message: 'Queue cleared', ts: new Date().toISOString() };
  const line = `data: ${JSON.stringify(resetEvt)}\n\n`;
  for (const r of sseClients.keys()) {
    try {
      r.write(line);
    } catch (_) {}
  }
  res.json({ status: 'ok', cleared: old });
}

// Clear endpoint - only available when ENABLE_DEMO_ENDPOINTS=true
if (ENABLE_DEMO_ENDPOINTS) {
  app.post('/clear', requireVizAuth, (req, res) => clearAll(res));
  app.get('/clear', requireVizAuth, (req, res) => clearAll(res));
}

process.on('unhandledRejection', (reason) => {
  console.error('[office-viz] Unhandled Rejection:', reason?.message || reason);
});

app.listen(PORT, () => console.log(`[office-viz] listening on :${PORT} bus=${BUS_TYPE}`));

startConsumer()
  .then(() => {
    console.log(`[office-viz] connected to ${BUS_TYPE}`);
  })
  .catch((e) => {
    console.error('[office-viz] consumer failed (HTTP still available):', e.message);
  });
