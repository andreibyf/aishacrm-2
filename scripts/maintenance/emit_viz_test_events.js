// scripts/maintenance/emit_viz_test_events.js
//
// Emits NDJSON canonical telemetry events to stdout.
// Generates multiple tasks for the same assignee so you can see:
// 1) Inbox queued list fill up
// 2) Folder stacks on agent desks (if implemented in office-viz)
//
// Usage examples:
//   node scripts/maintenance/emit_viz_test_events.js
//   node scripts/maintenance/emit_viz_test_events.js --count 5 --assignee sales_manager:dev --tenant dev
//   node scripts/maintenance/emit_viz_test_events.js --count 6 --complete 2 --start-task-index 101 --interval-ms 700
//
// Notes:
// - Emits full canonical sequence (created->assigned) for all tasks.
// - Emits started/tool calls/completed for the first --complete tasks only.
//   Remaining tasks stay queued (good for seeing inbox + desk stacks).

function getArg(flag, defaultValue) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) return defaultValue;
  return val;
}

function asInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

// CLI args
const COUNT = asInt(getArg("--count", "5"), 5);
const COMPLETE = asInt(getArg("--complete", "5"), 5); // how many tasks go all the way to completed
const ASSIGNEE = getArg("--assignee", "sales_manager:dev");
const TENANT = getArg("--tenant", "dev");
const INTERVAL_MS = asInt(getArg("--interval-ms", "700"), 700);
const START_INDEX = asInt(getArg("--start-task-index", "101"), 101);
const TITLE_BASE = getArg("--title-base", "Analyze Lead: Acme Corp");

const OPS = "ops_manager:dev";

// Helpers
function isoAt(ms) {
  return new Date(ms).toISOString();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Deterministic-ish UUID-like strings without external deps.
// Not cryptographic; just unique enough for test telemetry.
function makeRunId(baseRunId, i) {
  // baseRunId looks like 550e8400-e29b-41d4-a716-446655440000
  // We replace the last 4 hex chars with an index-based suffix.
  const suffix = pad2((i + 1) % 100) + pad2((i + 11) % 100); // e.g. 0111
  return baseRunId.slice(0, -4) + suffix;
}

function makeSpanId(baseSpanId, step, i) {
  // step is 1..6
  // Replace last 4 hex chars with step+index
  const a = (step % 16).toString(16);
  const b = ((i + 1) % 16).toString(16);
  const c = ((i + 7) % 16).toString(16);
  const d = ((i + 13) % 16).toString(16);
  return baseSpanId.slice(0, -4) + a + b + c + d;
}

function emit(evt) {
  process.stdout.write(JSON.stringify(evt) + "\n");
}

// Base IDs (kept stable so you can filter run_id patterns easily)
const BASE_RUN_ID = "550e8400-e29b-41d4-a716-446655440000";
const BASE_TRACE_ID = "550e8400-e29b-41d4-a716-446655440000";
const BASE_SPAN_ID = "770e8400-e29b-41d4-a716-446655440001";

const now = Date.now();

// Emit tasks
for (let i = 0; i < COUNT; i++) {
  const taskId = `task-${START_INDEX + i}`;
  const runId = makeRunId(BASE_RUN_ID, i);
  const title = `${TITLE_BASE} #${i + 1}`;

  // Spread tasks slightly so inbox visibly increments and animations have time.
  const baseTs = now + i * INTERVAL_MS;

  // 1) task_created
  emit({
    _telemetry: true,
    ts: isoAt(baseTs),
    type: "task_created",
    run_id: runId,
    trace_id: runId, // keep trace_id aligned to run_id for easy debugging
    span_id: makeSpanId(BASE_SPAN_ID, 1, i),
    tenant_id: TENANT,
    agent_id: OPS,
    task_id: taskId,
    task_type: "analyze_lead",
    title,
    input_summary: "Analyze lead and propose next steps",
    priority: "normal",
  });

  // 2) task_assigned (Ops -> Assignee)
  emit({
    _telemetry: true,
    ts: isoAt(baseTs + 1000),
    type: "task_assigned",
    tenant_id: TENANT,
    run_id: runId,
    trace_id: runId,
    span_id: makeSpanId(BASE_SPAN_ID, 2, i),
    task_id: taskId,
    agent_id: OPS,
    to_agent_id: ASSIGNEE,
    reason: "Lead analysis requires sales context",
    title,
  });

  // For first N tasks, emit full execution lifecycle.
  if (i < COMPLETE) {
    // 3) task_started (Assignee starts)
    emit({
      _telemetry: true,
      ts: isoAt(baseTs + 2000),
      type: "task_started",
      tenant_id: TENANT,
      run_id: runId,
      trace_id: runId,
      span_id: makeSpanId(BASE_SPAN_ID, 3, i),
      task_id: taskId,
      agent_id: ASSIGNEE,
    });

    // 4) tool_call_started
    emit({
      _telemetry: true,
      ts: isoAt(baseTs + 3000),
      type: "tool_call_started",
      tenant_id: TENANT,
      run_id: runId,
      trace_id: runId,
      span_id: makeSpanId(BASE_SPAN_ID, 4, i),
      task_id: taskId,
      agent_id: ASSIGNEE,
      tool_name: "supabase.query",
      input_summary: `Fetch recent activities for ${TITLE_BASE.replace(/^Analyze Lead:\s*/i, "")}`,
    });

    // 5) tool_call_finished
    emit({
      _telemetry: true,
      ts: isoAt(baseTs + 4000),
      type: "tool_call_finished",
      tenant_id: TENANT,
      run_id: runId,
      trace_id: runId,
      span_id: makeSpanId(BASE_SPAN_ID, 5, i),
      task_id: taskId,
      agent_id: ASSIGNEE,
      tool_name: "supabase.query",
      output_summary: "Found 3 activities, last contact 12 days ago",
    });

    // 6) task_completed
    emit({
      _telemetry: true,
      ts: isoAt(baseTs + 5000),
      type: "task_completed",
      run_id: runId,
      trace_id: runId,
      span_id: makeSpanId(BASE_SPAN_ID, 6, i),
      tenant_id: TENANT,
      agent_id: ASSIGNEE,
      task_id: taskId,
      summary: "Lead analysis complete. High potential.",
      metrics: {
        duration_ms: 5000,
        tokens_est: 1250,
      },
    });
  }
}
