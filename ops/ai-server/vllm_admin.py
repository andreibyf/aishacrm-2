"""
vLLM Admin Panel -- AiSHA AI Cloud Server
Runs on port 7860.  Access at http://192.168.7.219:7860
Uses only packages already in the vllm-env (fastapi, uvicorn, httpx).
"""

import os
import subprocess
import json
import re
import time
from collections import deque
from pathlib import Path

import httpx
import uvicorn
import redis
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI()

VLLM_KEY = os.environ.get("VLLM_KEY", "")   # provided by the systemd unit (drop-in)
VLLM_URL = "http://localhost:8000"
OLLAMA_URL = "http://localhost:11434"   # CPU lite models (qwen2.5:3b, coder:7b)
CONFIG_PATH = Path.home() / "vllm.config"
APPLY_SCRIPT = Path.home() / "vllm-apply.sh"

# Rolling 30-point history for the latency graph (polled every 10s = ~5 min)
_metric_history: deque = deque(maxlen=30)
_last_latency_sum = 0.0
_last_latency_count = 0

# Per-model tracking ─────────────────────────────────────────────────────────
# Last-seen cumulative Prometheus counters (to compute per-poll deltas)
_model_last: dict = {}
# Running totals per model (total_req, avg_ms, tok_in, tok_out)
_model_cumulative: dict = {}
# Kafka-style audit ring: 200 entries, newest first; each = one 10s poll window
_audit_log: deque = deque(maxlen=200)


# -- Helpers ------------------------------------------------------------------

def gpu_stats():
    try:
        r = subprocess.check_output([
            "nvidia-smi",
            "--query-gpu=name,temperature.gpu,memory.used,memory.total,utilization.gpu,power.draw",
            "--format=csv,noheader,nounits"
        ], text=True).strip()
        p = [x.strip() for x in r.split(",")]
        return {
            "name": p[0], "temp_c": int(p[1]),
            "vram_used_mb": int(p[2]), "vram_total_mb": int(p[3]),
            "gpu_util_pct": int(p[4]),
            "power_w": float(p[5]) if p[5] != "N/A" else None,
            "vram_pct": round(int(p[2]) / int(p[3]) * 100, 1),
        }
    except Exception as e:
        return {"error": str(e)}

def vllm_health():
    try:
        with httpx.Client(timeout=5) as c:
            h = c.get(f"{VLLM_URL}/health", headers={"Authorization": f"Bearer {VLLM_KEY}"})
            if h.status_code == 200:
                m = c.get(f"{VLLM_URL}/v1/models", headers={"Authorization": f"Bearer {VLLM_KEY}"}).json()
                model = m["data"][0] if m.get("data") else {}
                return {"status": "running", "model": model.get("id"), "max_model_len": model.get("max_model_len")}
    except Exception:
        pass
    try:
        active = subprocess.check_output(["systemctl", "is-active", "vllm"], text=True).strip()
        return {"status": active, "model": None, "max_model_len": None}
    except Exception:
        return {"status": "unknown", "model": None, "max_model_len": None}

def read_config():
    defaults = {
        "MODEL": "/home/aisha/models/Qwen2.5-14B-Instruct-AWQ",
        "SERVED_MODEL_NAME": "qwen-14b",
        "QUANTIZATION": "awq_marlin",
        "GPU_MEMORY_UTILIZATION": "0.90",
        "MAX_MODEL_LEN": "20000",
        "MAX_TOKENS_DEFAULT": "2048",
        "HOST": "0.0.0.0",
        "PORT": "8000",
    }
    if not CONFIG_PATH.exists():
        return defaults
    cfg = dict(defaults)
    for line in CONFIG_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            cfg[k.strip()] = v.strip().strip('"')
    return cfg

def parse_labeled_metric(name: str, text: str, label_key: str = "model_name") -> dict:
    """Parse a Prometheus labeled metric → {label_value: cumulative_float}."""
    results: dict = {}
    pattern = rf'^{re.escape(name)}\{{([^}}]*)\}}\s+([\d.e+\-]+)'
    for m in re.finditer(pattern, text, re.MULTILINE):
        labels_str, value = m.group(1), float(m.group(2))
        lm = re.search(rf'{re.escape(label_key)}="([^"]+)"', labels_str)
        key = lm.group(1) if lm else "unknown"
        results[key] = results.get(key, 0.0) + value
    return results


# -- Request monitor: read the Bull task-execution queues from local Redis -----
# The CRM's agent task queue (Bull v4) lives in Redis on this box (port 6381).
# Each job carries the request (data.description) and, on completion, a `meta`
# block written by the worker with the requested topic, the tools that fired,
# the resulting topic, and a mismatch flag. We read jobs straight off the queue
# — no push channel needed. Topic is aligned with the tools the agent used.

TASK_QUEUE_REDIS_PORT = 6381
TASK_QUEUE_ENVS = ["dev", "staging", "prd"]
QUEUE_BASE = "bull:task-execution:"

# Worker meta records the LiteLLM *alias*; map it to the underlying served model
# so queue-derived activity merges into the right By-Model row.
ALIAS_TO_MODEL = {
    "aisha-task": "qwen-14b",
    "aisha-summary": "qwen-14b",
    "aisha-task-lite": "qwen2.5:3b",
    "aisha-task-lite-plus": "qwen2.5-coder:7b",
}

# Tool name → topic facet (mirrors backend/lib/quality/taskType.js).
TOOL_FACETS = {
    "draft_email": "email", "draftEmail": "email",
    "create_note": "note", "createNote": "note",
    "create_activity": "activity", "createActivity": "activity", "schedule_meeting": "activity",
    "call_contact": "call", "callContact": "call", "initiate_call": "call",
    "create_contact": "contact", "create_lead": "lead",
    "search_web": "research", "fetch_web_page": "research", "lookup_company_info": "research",
    "get_health_summary": "summary", "get_cashflow_summary": "summary",
}
_INTENT_PATTERNS = [
    ("email", r"\b(e-?mail|compose|reply|respond|outreach|introduct(?:ion|ory))\b"),
    ("note", r"\bnotes?\b"),
    ("summary", r"\b(summar(?:ise|ize)|recap|brief|tl;?dr)\b"),
    ("activity", r"\b(appointments?|meetings?|schedule|calendar|tasks?|reminders?|follow[\s-]?ups?|events?)\b"),
    ("call", r"\bcalls?\b"),
    ("contact", r"\bcontacts?\b"),
    ("research", r"\b(research|look\s?up|investigate)\b"),
]
_FACET_ORDER = ["email", "note", "summary", "activity", "call", "contact", "lead", "research"]


def _intents_from_desc(desc: str):
    desc = desc or ""
    return [name for name, pat in _INTENT_PATTERNS if re.search(pat, desc, re.I)]


def _topic_label(facets):
    if not facets:
        return "other"
    uniq = list(dict.fromkeys(facets))
    uniq.sort(key=lambda f: _FACET_ORDER.index(f) if f in _FACET_ORDER else 99)
    return "+".join(uniq)


def _redis_conn():
    return redis.Redis(host="127.0.0.1", port=TASK_QUEUE_REDIS_PORT,
                       decode_responses=True, socket_timeout=2)


def _parse_job(r, prefix, job_id, status):
    h = r.hgetall(f"{prefix}:{job_id}")
    if not h:
        return None
    try:
        data = json.loads(h.get("data") or "{}")
    except Exception:
        data = {}
    try:
        rv = json.loads(h.get("returnvalue") or "{}") or {}
    except Exception:
        rv = {}
    meta = rv.get("meta") if isinstance(rv, dict) else None
    desc = (data.get("description") or "") if isinstance(data, dict) else ""

    def _num(key):
        try:
            return int(float(h[key])) if h.get(key) else None
        except Exception:
            return None

    processed, finished = _num("processedOn"), _num("finishedOn")
    rec = {
        "id": job_id,
        "name": h.get("name"),
        "status": status,
        "env": prefix.split(":")[-1],
        "ts": finished or processed or _num("timestamp") or 0,
        "duration_ms": (finished - processed) if (finished and processed) else None,
        "description": desc[:160],
        "failed_reason": (h.get("failedReason") or "")[:200] or None,
        "attempts": h.get("attemptsMade"),
    }
    if meta:
        rec.update({
            "requested_topic": meta.get("requested_topic"),
            "actual_topic": meta.get("actual_topic"),
            "tools_used": meta.get("tools_used") or [],
            "agent": meta.get("agent"), "role": meta.get("role"),
            "model": meta.get("model"), "tier": meta.get("tier"),
            "mismatch": meta.get("mismatch"),
            "mismatch_reasons": meta.get("mismatch_reasons") or [],
            "gate_pass": meta.get("gate_pass"),
            "tokens": meta.get("total_tokens"),
        })
        if meta.get("env"):
            rec["env"] = meta["env"]
    else:
        # No worker meta (failed / waiting / active) — fall back to a topic guess
        # from the description so the row is still legible.
        rec.update({
            "requested_topic": _topic_label(_intents_from_desc(desc)),
            "actual_topic": None, "tools_used": [],
            "mismatch": None, "mismatch_reasons": [], "gate_pass": None,
            "agent": None, "model": None, "tier": None, "tokens": None,
        })
    return rec


def read_bull_requests(limit: int = 80):
    try:
        r = _redis_conn()
        r.ping()
    except Exception as e:
        return {"requests": [], "counts": {}, "error": f"redis: {e}"}

    out, counts = [], {}
    states = [
        ("completed", "completed", True),
        ("failed", "failed", True),
        ("active", "active", False),
        ("waiting", "wait", False),
    ]
    for env in TASK_QUEUE_ENVS:
        prefix = QUEUE_BASE + env
        # A queue is "present" if any of its structural keys exist — including
        # stalled-check, which a connected worker creates even before the first job.
        try:
            present = any(
                r.exists(f"{prefix}:{k}")
                for k in ("stalled-check", "id", "meta", "completed", "failed", "wait", "active", "delayed")
            )
            if not present:
                continue
        except Exception:
            continue
        c = {}
        for label, suffix, is_zset in states:
            key = f"{prefix}:{suffix}"
            try:
                if is_zset:
                    ids = r.zrevrange(key, 0, limit - 1)
                    c[label] = r.zcard(key)
                else:
                    ids = r.lrange(key, 0, limit - 1)
                    c[label] = r.llen(key)
            except Exception:
                ids, c[label] = [], 0
            for jid in ids:
                rec = _parse_job(r, prefix, jid, label)
                if rec:
                    out.append(rec)
        counts[env] = c

    out.sort(key=lambda x: x.get("ts") or 0, reverse=True)
    return {"requests": out[:limit], "counts": counts}


def _queue_model_stats():
    """Per-model activity from completed Bull task jobs — the only source of
    lite-model usage (Ollama exposes no counters). Keyed by underlying model.
    NOTE: latency is whole-task duration (agentic loop + tools), not per-call."""
    agg = {}
    try:
        r = _redis_conn()
        r.ping()
    except Exception:
        return {}
    for env in TASK_QUEUE_ENVS:
        prefix = QUEUE_BASE + env
        try:
            ids = r.zrevrange(f"{prefix}:completed", 0, 199)
        except Exception:
            ids = []
        for jid in ids:
            h = r.hgetall(f"{prefix}:{jid}")
            if not h:
                continue
            try:
                meta = (json.loads(h.get("returnvalue") or "{}") or {}).get("meta") or {}
            except Exception:
                meta = {}
            alias = meta.get("model")
            if not alias:
                continue
            model = ALIAS_TO_MODEL.get(alias, alias)
            a = agg.setdefault(model, {"count": 0, "dur": 0, "durn": 0, "tokens": 0})
            a["count"] += 1
            a["tokens"] += meta.get("total_tokens") or 0
            try:
                p = int(float(h.get("processedOn") or 0))
                f = int(float(h.get("finishedOn") or 0))
                if p and f:
                    a["dur"] += (f - p)
                    a["durn"] += 1
            except Exception:
                pass
    return {
        m: {
            "task_count": a["count"],
            "avg_ms": round(a["dur"] / a["durn"]) if a["durn"] else None,
            "tokens": a["tokens"] or None,
        }
        for m, a in agg.items()
    }


# -- API ----------------------------------------------------------------------

@app.get("/api/status")
def api_status():
    return JSONResponse({"gpu": gpu_stats(), "vllm": vllm_health(), "config": read_config()})

@app.post("/api/apply")
async def api_apply(request: Request):
    data = await request.json()
    keys = ["MODEL","SERVED_MODEL_NAME","QUANTIZATION","GPU_MEMORY_UTILIZATION",
            "MAX_MODEL_LEN","MAX_TOKENS_DEFAULT","HOST","PORT"]
    lines = ["# vLLM Configuration -- edited via admin panel", ""]
    for k in keys:
        if k in data:
            lines.append(f'{k}="{data[k]}"')
    CONFIG_PATH.write_text("\n".join(lines) + "\n")
    try:
        result = subprocess.run(["bash", str(APPLY_SCRIPT)], capture_output=True, text=True, timeout=10)
        return JSONResponse({"ok": True, "output": result.stdout + result.stderr})
    except subprocess.TimeoutExpired:
        return JSONResponse({"ok": True, "output": "Restart initiated -- takes ~60s to load model"})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)})

@app.post("/api/test")
def api_test():
    try:
        with httpx.Client(timeout=30) as c:
            r = c.post(f"{VLLM_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {VLLM_KEY}", "Content-Type": "application/json"},
                json={"model": "qwen-14b", "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                      "max_tokens": 10, "temperature": 0.0})
            if r.status_code == 200:
                reply = r.json()["choices"][0]["message"]["content"]
                return JSONResponse({"ok": True, "reply": reply})
            return JSONResponse({"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)})

@app.get("/api/logs")
def api_logs(lines: int = 60, service: str = "vllm"):
    allowed = {"vllm", "vllm-admin"}
    if service not in allowed:
        return JSONResponse({"error": "unknown service"})
    try:
        result = subprocess.run(
            ["journalctl", "-u", service, f"-n{lines}", "--no-pager", "-o", "short-iso"],
            capture_output=True, text=True, timeout=8
        )
        raw = result.stdout
        clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', raw)
        return JSONResponse({"lines": clean.splitlines()})
    except Exception as e:
        return JSONResponse({"error": str(e), "lines": []})

@app.get("/api/metrics")
def api_metrics():
    global _last_latency_sum, _last_latency_count, _model_last, _model_cumulative
    try:
        with httpx.Client(timeout=5) as c:
            r = c.get(f"{VLLM_URL}/metrics",
                      headers={"Authorization": f"Bearer {VLLM_KEY}"})
            if r.status_code != 200:
                return JSONResponse({"error": f"metrics HTTP {r.status_code}", "history": list(_metric_history)})
            text = r.text

        def parse_metric(name):
            m = re.search(rf'^{re.escape(name)}(?:\{{[^}}]*\}})?\s+([\d.e+\-]+)', text, re.MULTILINE)
            return float(m.group(1)) if m else 0.0

        lat_sum   = parse_metric("vllm:e2e_request_latency_seconds_sum")
        lat_count = parse_metric("vllm:e2e_request_latency_seconds_count")
        running   = parse_metric("vllm:num_requests_running")
        waiting   = parse_metric("vllm:num_requests_waiting")

        delta_sum   = lat_sum   - _last_latency_sum
        delta_count = lat_count - _last_latency_count
        avg_ms = round((delta_sum / delta_count) * 1000, 1) if delta_count > 0 else None
        _last_latency_sum   = lat_sum
        _last_latency_count = lat_count

        # ── Per-model tracking ───────────────────────────────────────────────
        lat_sums   = parse_labeled_metric("vllm:e2e_request_latency_seconds_sum", text)
        lat_counts = parse_labeled_metric("vllm:e2e_request_latency_seconds_count", text)
        # Token metrics — try multiple naming patterns (vLLM version varies)
        tok_in  = (parse_labeled_metric("vllm:request_prompt_tokens_total", text)
                   or parse_labeled_metric("vllm:request_prompt_tokens_sum", text) or {})
        tok_out = (parse_labeled_metric("vllm:request_generation_tokens_total", text)
                   or parse_labeled_metric("vllm:request_generation_tokens_sum", text) or {})

        now_ms = int(time.time() * 1000)

        for model in set(list(lat_sums) + list(lat_counts)):
            cur_lsum = lat_sums.get(model, 0.0)
            cur_lct  = lat_counts.get(model, 0.0)
            cur_tin  = tok_in.get(model, 0.0)
            cur_tout = tok_out.get(model, 0.0)

            # Seed prev on first encounter so delta is 0 (no phantom audit entry)
            prev = _model_last.get(model, {
                "lat_sum": cur_lsum, "lat_count": cur_lct,
                "tok_in": cur_tin, "tok_out": cur_tout,
            })
            d_count = cur_lct  - prev["lat_count"]
            d_sum   = cur_lsum - prev["lat_sum"]
            d_tin   = cur_tin  - prev["tok_in"]
            d_tout  = cur_tout - prev["tok_out"]

            _model_last[model] = {
                "lat_sum": cur_lsum, "lat_count": cur_lct,
                "tok_in": cur_tin, "tok_out": cur_tout,
            }

            # Update lifetime cumulative stats
            cum = _model_cumulative.get(model, {
                "total_req": 0, "avg_ms": None, "tok_in": 0, "tok_out": 0,
            })
            cum["total_req"] = int(cur_lct)
            cum["tok_in"]    = int(cur_tin)
            cum["tok_out"]   = int(cur_tout)
            cum["avg_ms"]    = round((cur_lsum / cur_lct) * 1000, 1) if cur_lct > 0 else None
            _model_cumulative[model] = cum

            # Append audit entry only when new requests arrived in this interval
            if d_count > 0:
                _audit_log.append({
                    "ts":      now_ms,
                    "model":   model,
                    "req":     int(round(d_count)),
                    "avg_ms":  round((d_sum / d_count) * 1000, 1),
                    "tok_in":  int(round(d_tin)),
                    "tok_out": int(round(d_tout)),
                })

        point = {
            "ts": now_ms, "avg_ms": avg_ms,
            "total_requests": int(lat_count),
            "running": int(running), "waiting": int(waiting),
        }
        _metric_history.append(point)
        return JSONResponse({
            "current": point,
            "history": list(_metric_history),
            "total_requests_lifetime": int(lat_count),
        })
    except Exception as e:
        return JSONResponse({"error": str(e), "history": list(_metric_history)})

def _ollama_models():
    """List Ollama (CPU) models: installed + whether currently loaded + processor."""
    out = []
    try:
        with httpx.Client(timeout=3) as c:
            tags = c.get(f"{OLLAMA_URL}/api/tags").json().get("models", [])
            try:
                ps = c.get(f"{OLLAMA_URL}/api/ps").json().get("models", [])
            except Exception:
                ps = []
        loaded = {m.get("name"): m for m in ps}
        for m in tags:
            nm = m.get("name")
            lp = loaded.get(nm)
            processor = "CPU"
            if lp and lp.get("size_vram", 0):
                processor = "GPU"  # shouldn't happen — Ollama is CPU-locked here
            out.append({
                "model": nm,
                "engine": "Ollama (CPU)",
                "loaded": nm in loaded,
                "processor": processor,
                "size": m.get("size"),
                # Ollama exposes no per-model latency/token counters
                "total_req": None, "avg_ms": None, "tok_in": None, "tok_out": None,
            })
    except Exception:
        pass
    return out


@app.get("/api/model-stats")
def api_model_stats():
    """Per-model stats across BOTH engines: vLLM (GPU, full Prometheus stats) +
    Ollama (CPU lite models, loaded state + size; no latency/token counters)."""
    models = []
    # vLLM served model(s) — always show (even at rest), merging Prometheus stats
    # when available. _model_cumulative is delta-based so it's empty until traffic.
    vllm_names = set(_model_cumulative.keys())
    try:
        h = vllm_health()
        if h.get("model"):
            vllm_names.add(h["model"])
    except Exception:
        pass
    # Per-model activity from the agent task queue — the only stats source for the
    # lite (Ollama) models, and a fallback for vLLM when Prometheus is empty at rest.
    qstats = _queue_model_stats()

    for name in sorted(vllm_names):
        s = _model_cumulative.get(name, {})
        q = qstats.get(name, {})
        models.append({
            "model": name, "engine": "vLLM (GPU)", "loaded": True, "processor": "GPU",
            "size": None,
            # Prefer Prometheus (per-call), fall back to queue (task-level).
            "total_req": s.get("total_req") if s.get("total_req") is not None else q.get("task_count"),
            "avg_ms": s.get("avg_ms") if s.get("avg_ms") is not None else q.get("avg_ms"),
            "tok_in": s.get("tok_in"), "tok_out": s.get("tok_out"),
            "task_count": q.get("task_count"),
        })

    for m in _ollama_models():
        q = qstats.get(m["model"], {})
        # Ollama has no counters — the queue is its only activity source.
        m["total_req"] = q.get("task_count")
        m["avg_ms"] = q.get("avg_ms")
        m["tok_in"] = q.get("tokens")
        m["task_count"] = q.get("task_count")
        models.append(m)

    return JSONResponse({"models": models})

@app.get("/api/audit")
def api_audit(limit: int = 100):
    """Recent request aggregates — one entry per 10-s poll window per model."""
    entries = list(reversed(list(_audit_log)))[:limit]   # newest first
    return JSONResponse({"entries": entries, "total": len(_audit_log)})

@app.delete("/api/audit")
def api_audit_clear():
    _audit_log.clear()
    return JSONResponse({"ok": True})

@app.get("/api/requests")
def api_requests(limit: int = 80):
    """Agent task-queue jobs (Bull), topic-classified + mismatch-flagged."""
    return JSONResponse(read_bull_requests(limit))


# -- UI -----------------------------------------------------------------------

HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>AiSHA AI Server Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh}
  .hdr{background:#1a1f2e;border-bottom:1px solid #2d3748;padding:14px 24px;display:flex;align-items:center;gap:12px}
  .hdr h1{font-size:17px;font-weight:600}
  .badge{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
  .ok{background:#22543d;color:#68d391}.err{background:#742a2a;color:#fc8181}.loading{background:#2d3748;color:#a0aec0}
  /* Tab nav */
  .tab-nav{background:#1a1f2e;border-bottom:1px solid #2d3748;display:flex;gap:0;padding:0 24px}
  .tab-btn{padding:11px 20px;background:none;border:none;color:#718096;font-size:13px;font-weight:500;
            cursor:pointer;border-bottom:2px solid transparent;transition:.15s}
  .tab-btn:hover{color:#e2e8f0}
  .tab-btn.active{color:#4299e1;border-bottom-color:#4299e1}
  .tab-pane{display:none}.tab-pane.active{display:block}
  /* Cards / layout */
  .main{display:grid;grid-template-columns:1fr 1fr 2fr;gap:18px;padding:20px;max-width:1400px}
  .card{background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;padding:18px}
  .card h2{font-size:12px;font-weight:600;color:#a0aec0;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #2d3748}
  .row:last-child{border-bottom:none}
  .lbl{color:#a0aec0;font-size:13px}.val{font-weight:600;font-size:13px}
  .bar-bg{height:5px;background:#2d3748;border-radius:3px;margin-top:3px;width:110px}
  .bar{height:100%;border-radius:3px;transition:width .3s}
  .bv{background:#4299e1}.bg{background:#48bb78}.bt{background:#ed8936}
  label{display:block;font-size:12px;color:#718096;margin-bottom:3px;margin-top:11px}
  input,select{width:100%;background:#2d3748;border:1px solid #4a5568;border-radius:6px;
               padding:7px 10px;color:#e2e8f0;font-size:13px}
  input:focus,select:focus{outline:none;border-color:#4299e1}
  .btn{padding:9px 18px;border-radius:7px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:.15s}
  .bp{background:#3182ce;color:#fff}.bp:hover{background:#2b6cb0}
  .bs{background:#2d3748;color:#e2e8f0}.bs:hover{background:#4a5568}
  .acts{display:flex;gap:8px;margin-top:14px}
  .log{background:#0f1117;border-radius:6px;padding:10px;font-family:monospace;font-size:11px;
       color:#68d391;min-height:50px;max-height:100px;overflow-y:auto;margin-top:10px;white-space:pre-wrap;display:none}
  .fw{grid-column:1/-1}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 22px}
  #dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:#718096}
  .dg{background:#48bb78;box-shadow:0 0 6px #48bb78}.dr{background:#fc8181}
  .hint{background:#1a2744;border:1px solid #2d3748;border-radius:8px;padding:11px;margin-top:11px}
  .hint p{font-size:11px;color:#4a5568;margin-top:2px}
  .hint a{color:#4299e1;text-decoration:none;font-size:11px}
  .note{color:#4a5568;font-size:11px;margin-top:8px}
  .terminal{background:#0a0d14;border-radius:6px;padding:10px;font-family:'Courier New',monospace;
             font-size:11px;color:#a0aec0;height:220px;overflow-y:auto;white-space:pre-wrap;
             word-break:break-all;border:1px solid #2d3748;margin-top:10px}
  .terminal .err{color:#fc8181}.terminal .warn{color:#f6ad55}.terminal .info{color:#68d391}
  .log-controls{display:flex;gap:8px;align-items:center}
  .log-controls select{width:auto;padding:5px 8px}
  .log-controls label{font-size:12px;color:#718096;margin:0;display:flex;align-items:center;gap:4px;cursor:pointer}
  /* Data tables */
  .dtbl{width:100%;border-collapse:collapse;font-size:12px}
  .dtbl th{text-align:left;color:#718096;font-weight:600;padding:8px 10px;
            border-bottom:1px solid #2d3748;white-space:nowrap}
  .dtbl td{padding:8px 10px;border-bottom:1px solid #1a1f2e;white-space:nowrap}
  .dtbl tr:hover td{background:rgba(66,153,225,.05)}
  .dtbl .r{text-align:right}
  .dtbl .muted{color:#4a5568}
  .lat-hi{color:#fc8181}.lat-med{color:#f6ad55}
  .tab-content{padding:20px;max-width:1400px}
  .empty-row td{color:#4a5568;text-align:center;padding:28px 0;font-size:13px}
</style>
</head>
<body>
<div class="hdr">
  <span id="dot"></span>
  <h1>AiSHA AI Server Admin</h1>
  <span id="badge" class="badge loading">Loading...</span>
  <span style="margin-left:auto;color:#4a5568;font-size:12px">192.168.7.219 &bull; RTX 5070 Ti &bull; Qwen2.5-14B-AWQ</span>
</div>

<div class="tab-nav">
  <button class="tab-btn active" onclick="showTab('overview')">Overview</button>
  <button class="tab-btn" onclick="showTab('requests')">Requests</button>
  <button class="tab-btn" onclick="showTab('by-model')">By Model</button>
  <button class="tab-btn" onclick="showTab('audit')">Audit Log</button>
</div>

<!-- ══ Tab: Overview ═══════════════════════════════════════════════════════ -->
<div id="tab-overview" class="tab-pane active">
<div class="main">

  <div class="card">
    <h2>GPU</h2>
    <div id="gpu">Loading...</div>
  </div>

  <div class="card">
    <h2>vLLM Status</h2>
    <div id="status">Loading...</div>
    <div class="acts">
      <button class="btn bs" onclick="runTest()">Test inference</button>
    </div>
    <div id="test-log" class="log"></div>
  </div>

  <div class="card" style="grid-column:3;grid-row:1">
    <h2>Logs</h2>
    <div class="log-controls">
      <select id="log-lines"><option value="30">30 lines</option><option value="60" selected>60 lines</option><option value="100">100 lines</option><option value="200">200 lines</option></select>
      <select id="log-service"><option value="vllm">vllm</option><option value="vllm-admin">vllm-admin</option></select>
      <button class="btn bp" onclick="fetchLogs()" style="padding:5px 12px">Fetch</button>
      <label><input type="checkbox" id="log-auto" onchange="toggleLogAuto()"> Auto (15s)</label>
    </div>
    <div id="log-out" class="terminal">Click Fetch to load logs...</div>
  </div>

  <div class="card fw">
    <h2>Request Latency &mdash; last 5 min (10s intervals)</h2>
    <div style="position:relative;height:140px;margin-bottom:8px">
      <canvas id="latency-chart" style="width:100%;height:140px"></canvas>
      <div id="chart-empty" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
           color:#4a5568;font-size:13px">Waiting for requests...</div>
    </div>
    <div style="display:flex;gap:24px;font-size:12px;color:#a0aec0">
      <span>Avg latency: <strong id="cur-lat" style="color:#e2e8f0">--</strong></span>
      <span>In flight: <strong id="cur-run" style="color:#e2e8f0">--</strong></span>
      <span>Queue: <strong id="cur-wait" style="color:#e2e8f0">--</strong></span>
      <span>Total requests: <strong id="cur-total" style="color:#e2e8f0">--</strong></span>
    </div>
  </div>

  <div class="card fw">
    <h2>Parameters</h2>
    <div class="grid3">
      <div>
        <label>Max Model Length (tokens) &mdash; hw max: 20784</label>
        <input id="MAX_MODEL_LEN" type="number" min="4096" max="20784" step="1000">
        <label>GPU Memory Utilization (0.50&ndash;0.95)</label>
        <input id="GPU_MEMORY_UTILIZATION" type="number" min="0.5" max="0.95" step="0.01">
        <label>Default Max Output Tokens</label>
        <input id="MAX_TOKENS_DEFAULT" type="number" min="256" max="4096" step="256">
      </div>
      <div>
        <label>Model Path</label>
        <input id="MODEL" type="text">
        <label>Served Model Name (clients use this)</label>
        <input id="SERVED_MODEL_NAME" type="text">
        <label>Quantization</label>
        <select id="QUANTIZATION">
          <option value="awq_marlin">awq_marlin (GPU kernels, recommended)</option>
          <option value="awq">awq (Triton, slower on Blackwell)</option>
          <option value="none">none</option>
        </select>
      </div>
      <div>
        <label>Host</label><input id="HOST" type="text">
        <label>Port</label><input id="PORT" type="number">
        <div class="hint">
          <strong style="font-size:12px;color:#a0aec0">PR Review Token Budget</strong>
          <p>Change without editing YAML:</p>
          <a href="https://github.com/andreibyf/aishacrm-2/settings/variables/actions" target="_blank">
            GitHub &rarr; Settings &rarr; Variables &rarr; PR_AGENT_MAX_TOKENS
          </a>
          <p style="margin-top:6px">Current default: <strong style="color:#e2e8f0">18000</strong> tokens</p>
        </div>
      </div>
    </div>
    <div class="acts">
      <button class="btn bp" onclick="apply()">Apply &amp; Restart vLLM (~60s)</button>
      <button class="btn bs" onclick="reset()">Reset to saved</button>
    </div>
    <div id="apply-log" class="log"></div>
    <p class="note">Changes write ~/vllm.config and restart the systemd service.</p>
  </div>

</div>
</div>

<!-- ══ Tab: By Model ════════════════════════════════════════════════════════ -->
<div id="tab-by-model" class="tab-pane">
<div class="tab-content">
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h2 style="margin:0">Per-Model Statistics</h2>
      <span id="bm-updated" style="color:#4a5568;font-size:11px"></span>
    </div>
    <p style="color:#4a5568;font-size:11px;margin-bottom:12px">
      All served models across both engines. <strong>vLLM (GPU)</strong> shows per-call totals from
      Prometheus; <strong>Ollama (CPU)</strong> lite models have no counters, so their activity is
      sourced from the <strong>agent task queue</strong> (request count + avg <em>task</em> latency +
      tokens, across all envs). A blank means that model hasn't run a queued task yet. Updated every 10s.
    </p>
    <div style="overflow-x:auto">
      <table class="dtbl">
        <thead>
          <tr>
            <th>Model</th>
            <th>Engine</th>
            <th>State</th>
            <th class="r">Total Requests</th>
            <th class="r">Avg Latency</th>
            <th class="r">Tokens In</th>
            <th class="r">Tokens Out</th>
          </tr>
        </thead>
        <tbody id="bm-body">
          <tr class="empty-row"><td colspan="7">No data yet — polling every 10s</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
</div>

<!-- ══ Tab: Audit Log ═══════════════════════════════════════════════════════ -->
<div id="tab-audit" class="tab-pane">
<div class="tab-content">
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h2 style="margin:0">Audit Log</h2>
      <div style="display:flex;gap:10px;align-items:center">
        <span id="audit-count" style="color:#4a5568;font-size:12px">0 entries</span>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#718096;margin:0;cursor:pointer">
          <input type="checkbox" id="audit-auto" checked onchange="toggleAuditAuto()"> Auto (10s)
        </label>
        <button class="btn bs" onclick="clearAudit()" style="padding:5px 12px;font-size:12px">Clear</button>
      </div>
    </div>
    <p style="color:#4a5568;font-size:11px;margin-bottom:14px">
      One row per 10-second poll window in which new requests completed.
      Each entry shows request count, average latency, and token totals for that interval.
      Max 200 entries retained in memory.
    </p>
    <div style="overflow-x:auto">
      <table class="dtbl">
        <thead>
          <tr>
            <th>Time</th>
            <th>Model</th>
            <th class="r">Requests</th>
            <th class="r">Avg Latency</th>
            <th class="r">Tok In</th>
            <th class="r">Tok Out</th>
          </tr>
        </thead>
        <tbody id="audit-body">
          <tr class="empty-row"><td colspan="6">Waiting for requests...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
</div>

<!-- ══ Tab: Requests (agent task queue, by topic) ═══════════════════════════ -->
<div id="tab-requests" class="tab-pane">
<div class="tab-content">
  <div class="card fw">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h2 style="margin:0">Agent Requests &mdash; by topic</h2>
      <span id="req-count" style="color:#4a5568;font-size:12px"></span>
    </div>
    <p style="color:#4a5568;font-size:11px;margin-bottom:10px">
      Live jobs from the Bull <code>task-execution</code> queue on this box. <strong>Topic</strong> is derived
      from the tools the agent actually used; a <span style="color:#fc8181">mismatch</span> (highlighted row)
      means what happened didn't match what was asked, or a quality gate failed. Each row is labeled by environment.
    </p>
    <div id="req-counts" style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px;font-size:12px"></div>
    <div style="overflow-x:auto">
      <table class="dtbl">
        <thead><tr>
          <th>Time</th><th>Env</th><th>Topic</th><th>Tools used</th>
          <th>Status</th><th>Agent</th><th>Model</th><th class="r">Dur</th>
        </tr></thead>
        <tbody id="req-body">
          <tr class="empty-row"><td colspan="8">Waiting for requests...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
</div>

<script>
// ── Tab switching ─────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const btns = document.querySelectorAll('.tab-btn');
  const map = {overview:0,requests:1,'by-model':2,audit:3};
  btns[map[name]].classList.add('active');
  if (name === 'requests') fetchRequests();
}

// ── Status / config ───────────────────────────────────────────────────────
async function fetchStatus() {
  let d = null;
  try {
    const r = await fetch('/api/status');
    d = await r.json();
  } catch(e) {
    document.getElementById('gpu').innerHTML = '<div style="color:#fc8181">fetch error: ' + e.message + '</div>';
    document.getElementById('badge').textContent = 'error';
    document.getElementById('badge').className = 'badge err';
    return;
  }
  if(!d) return;

  // GPU
  const g = d.gpu;
  document.getElementById('gpu').innerHTML = g.error
    ? `<div style="color:#fc8181">${g.error}</div>`
    : `<div class="row"><span class="lbl">Model</span><span class="val">${g.name}</span></div>
       <div class="row"><span class="lbl">VRAM</span><div style="text-align:right">
         <span class="val">${g.vram_used_mb.toLocaleString()} / ${g.vram_total_mb.toLocaleString()} MB (${g.vram_pct}%)</span>
         <div class="bar-bg"><div class="bar bv" style="width:${g.vram_pct}%"></div></div></div></div>
       <div class="row"><span class="lbl">GPU Util</span><div style="text-align:right">
         <span class="val">${g.gpu_util_pct}%</span>
         <div class="bar-bg"><div class="bar bg" style="width:${g.gpu_util_pct}%"></div></div></div></div>
       <div class="row"><span class="lbl">Temperature</span><div style="text-align:right">
         <span class="val">${g.temp_c}&deg;C</span>
         <div class="bar-bg"><div class="bar bt" style="width:${Math.min(g.temp_c,100)}%"></div></div></div></div>
       ${g.power_w ? `<div class="row"><span class="lbl">Power</span><span class="val">${g.power_w.toFixed(0)} W</span></div>` : ''}`;

  // vLLM
  const v = d.vllm, ok = v.status==='running';
  document.getElementById('dot').className = ok ? 'dg' : 'dr';
  document.getElementById('badge').className = `badge ${ok?'ok':'err'}`;
  document.getElementById('badge').textContent = v.status;
  document.getElementById('status').innerHTML =
    `<div class="row"><span class="lbl">Status</span><span class="val" style="color:${ok?'#68d391':'#fc8181'}">${v.status}</span></div>`
    + (v.model ? `<div class="row"><span class="lbl">Model</span><span class="val">${v.model}</span></div>` : '')
    + (v.max_model_len ? `<div class="row"><span class="lbl">Max context</span><span class="val">${Number(v.max_model_len).toLocaleString()} tokens</span></div>` : '');

  // Config
  const c = d.config;
  ['MODEL','SERVED_MODEL_NAME','QUANTIZATION','GPU_MEMORY_UTILIZATION',
   'MAX_MODEL_LEN','MAX_TOKENS_DEFAULT','HOST','PORT'].forEach(k=>{
    const el=document.getElementById(k); if(el&&c[k]!==undefined) el.value=c[k];
  });
}

async function reset() { await fetchStatus(); }

async function apply() {
  const log = document.getElementById('apply-log');
  log.style.display='block'; log.textContent='Applying...'; log.style.color='#68d391';
  const data={};
  ['MODEL','SERVED_MODEL_NAME','QUANTIZATION','GPU_MEMORY_UTILIZATION',
   'MAX_MODEL_LEN','MAX_TOKENS_DEFAULT','HOST','PORT'].forEach(k=>{
    const el=document.getElementById(k); if(el) data[k]=el.value;
  });
  const r = await fetch('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());
  log.textContent = r.output || r.error || JSON.stringify(r);
  [5,30,65].forEach(s=>setTimeout(fetchStatus,s*1000));
}

async function runTest() {
  const log = document.getElementById('test-log');
  log.style.display='block'; log.style.color='#a0aec0'; log.textContent='Testing...';
  const r = await fetch('/api/test',{method:'POST'}).then(r=>r.json());
  log.style.color = r.ok ? '#68d391' : '#fc8181';
  log.textContent = r.ok ? `OK "${r.reply}"` : `ERR ${r.error}`;
}

// ── Latency chart ─────────────────────────────────────────────────────────
function drawChart(history) {
  const canvas = document.getElementById('latency-chart');
  const empty  = document.getElementById('chart-empty');
  const points = history.filter(p => p.avg_ms !== null);
  if (points.length < 2) { canvas.style.display='none'; empty.style.display='block'; return; }
  canvas.style.display='block'; empty.style.display='none';
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const PAD = {t:10,r:10,b:28,l:52};
  const iW = W-PAD.l-PAD.r, iH = H-PAD.t-PAD.b;
  const vals = points.map(p=>p.avg_ms);
  const minV = 0, maxV = Math.max(...vals)*1.15||1;
  const xOf = i => PAD.l+(i/(points.length-1))*iW;
  const yOf = v => PAD.t+iH-((v-minV)/(maxV-minV))*iH;
  ctx.strokeStyle='#2d3748'; ctx.lineWidth=1;
  [0,.25,.5,.75,1].forEach(f=>{
    const y=PAD.t+iH*(1-f);
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+iW,y); ctx.stroke();
    ctx.fillStyle='#4a5568'; ctx.font='10px sans-serif'; ctx.textAlign='right';
    ctx.fillText((minV+f*(maxV-minV)).toFixed(0)+'ms',PAD.l-4,y+3);
  });
  const grad=ctx.createLinearGradient(0,PAD.t,0,PAD.t+iH);
  grad.addColorStop(0,'rgba(66,153,225,0.35)'); grad.addColorStop(1,'rgba(66,153,225,0.02)');
  ctx.beginPath(); ctx.moveTo(xOf(0),yOf(vals[0]));
  points.forEach((p,i)=>{ if(i) ctx.lineTo(xOf(i),yOf(p.avg_ms)); });
  ctx.lineTo(xOf(points.length-1),PAD.t+iH); ctx.lineTo(xOf(0),PAD.t+iH);
  ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle='#4299e1'; ctx.lineWidth=2;
  points.forEach((p,i)=>i?ctx.lineTo(xOf(i),yOf(p.avg_ms)):ctx.moveTo(xOf(i),yOf(p.avg_ms)));
  ctx.stroke();
  points.forEach((p,i)=>{
    ctx.beginPath(); ctx.arc(xOf(i),yOf(p.avg_ms),3,0,Math.PI*2);
    ctx.fillStyle='#4299e1'; ctx.fill();
  });
  ctx.fillStyle='#4a5568'; ctx.font='10px sans-serif'; ctx.textAlign='center';
  const fmt=ts=>{ const d=new Date(ts); return d.getHours()+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0'); };
  ctx.fillText(fmt(points[0].ts),xOf(0),H-4);
  if(points.length>1) ctx.fillText(fmt(points[points.length-1].ts),xOf(points.length-1),H-4);
}

async function fetchMetrics() {
  const d = await fetch('/api/metrics').then(r=>r.json()).catch(()=>null);
  if(!d||d.error) return;
  const c=d.current||{};
  document.getElementById('cur-lat').textContent   = c.avg_ms!=null ? c.avg_ms+' ms' : '--';
  document.getElementById('cur-run').textContent   = c.running??'--';
  document.getElementById('cur-wait').textContent  = c.waiting??'--';
  document.getElementById('cur-total').textContent = d.total_requests_lifetime?.toLocaleString()??'--';
  drawChart(d.history||[]);
}

// ── By Model ──────────────────────────────────────────────────────────────
function latClass(ms) {
  if (ms == null) return 'muted';
  if (ms > 5000)  return 'lat-hi';
  if (ms > 3000)  return 'lat-med';
  return '';
}

function fmtBytes(n) {
  if (!n) return '--';
  const gb = n/1e9; if (gb >= 1) return gb.toFixed(1)+' GB';
  return (n/1e6).toFixed(0)+' MB';
}

async function fetchByModel() {
  const d = await fetch('/api/model-stats').then(r=>r.json()).catch(()=>null);
  if (!d) return;
  const models = (d.models||[]).slice();
  const tbody = document.getElementById('bm-body');
  if (!models.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No data yet — polling every 10s</td></tr>';
    return;
  }
  // GPU/vLLM first, then by request volume.
  models.sort((a,b)=>{
    const ea=(a.engine||'').includes('GPU')?0:1, eb=(b.engine||'').includes('GPU')?0:1;
    if (ea!==eb) return ea-eb;
    return (b.total_req||0)-(a.total_req||0);
  });
  tbody.innerHTML = models.map(s=>{
    const isGpu = (s.engine||'').includes('GPU');
    const engColor = isGpu ? '#4299e1' : '#ed8936';
    const stateLoaded = s.loaded
      ? `<span style="color:#68d391">&#9679; loaded</span>`
      : `<span class="muted">&#9675; idle</span>`;
    const sizePart = s.size ? ` <span class="muted">${fmtBytes(s.size)}</span>` : '';
    const num = v => (v!=null) ? v.toLocaleString() : '<span class="muted">--</span>';
    const lat = s.avg_ms!=null ? `<span class="${latClass(s.avg_ms)}">${s.avg_ms} ms</span>` : '<span class="muted">--</span>';
    return `<tr>
      <td><code style="font-size:11px;background:#2d3748;padding:2px 6px;border-radius:4px">${s.model}</code></td>
      <td style="color:${engColor};font-size:11px;font-weight:600">${s.engine||'?'}</td>
      <td style="font-size:11px">${stateLoaded}${sizePart}</td>
      <td class="r">${num(s.total_req)}</td>
      <td class="r">${lat}</td>
      <td class="r">${num(s.tok_in)}</td>
      <td class="r">${num(s.tok_out)}</td>
    </tr>`;
  }).join('');
  document.getElementById('bm-updated').textContent =
    'Updated ' + new Date().toLocaleTimeString();
}

// ── Audit Log ─────────────────────────────────────────────────────────────
let _auditTimer = null;

function fmtTs(ms) {
  const d = new Date(ms);
  const today = new Date();
  const t = d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return d.toDateString() === today.toDateString()
    ? t
    : d.toLocaleDateString([],{month:'short',day:'numeric'}) + ' ' + t;
}

async function fetchAudit() {
  const d = await fetch('/api/audit?limit=100').then(r=>r.json()).catch(()=>null);
  if (!d) return;
  document.getElementById('audit-count').textContent = d.total + ' entries';
  const tbody = document.getElementById('audit-body');
  if (!d.entries.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Waiting for requests...</td></tr>';
    return;
  }
  tbody.innerHTML = d.entries.map(e=>{
    const lc = latClass(e.avg_ms);
    return `<tr>
      <td class="muted" style="font-size:11px">${fmtTs(e.ts)}</td>
      <td><code style="font-size:11px;background:#2d3748;padding:2px 6px;border-radius:4px">${e.model}</code></td>
      <td class="r">${e.req}</td>
      <td class="r ${lc}">${e.avg_ms} ms</td>
      <td class="r muted">${e.tok_in ? e.tok_in.toLocaleString() : '--'}</td>
      <td class="r muted">${e.tok_out ? e.tok_out.toLocaleString() : '--'}</td>
    </tr>`;
  }).join('');
}

async function clearAudit() {
  await fetch('/api/audit',{method:'DELETE'}).catch(()=>{});
  await fetchAudit();
}

function toggleAuditAuto() {
  if (document.getElementById('audit-auto').checked) {
    fetchAudit();
    _auditTimer = setInterval(fetchAudit, 10000);
  } else {
    clearInterval(_auditTimer); _auditTimer = null;
  }
}

// ── Requests (agent task queue, by topic) ─────────────────────────────────
let _reqTimer = null;

function topicBadge(t, mismatch) {
  const color = mismatch ? '#fc8181' : '#68d391';
  const bg    = mismatch ? '#742a2a' : '#22543d';
  return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${t||'?'}</span>`;
}

async function fetchRequests() {
  const d = await fetch('/api/requests?limit=80').then(r=>r.json()).catch(()=>null);
  if (!d) return;
  const counts = d.counts || {};
  document.getElementById('req-counts').innerHTML = Object.keys(counts).length
    ? Object.keys(counts).map(env=>{
        const c = counts[env]||{};
        return `<span><strong style="color:#4299e1">${env}</strong>
          &middot; waiting ${c.waiting||0} &middot; active ${c.active||0}
          &middot; done ${c.completed||0}
          &middot; <span style="color:#fc8181">failed ${c.failed||0}</span></span>`;
      }).join('')
    : '<span style="color:#4a5568">no task-execution queues found on this Redis</span>';
  if (d.error) document.getElementById('req-counts').innerHTML =
    `<span style="color:#fc8181">${d.error}</span>`;

  const reqs = d.requests || [];
  document.getElementById('req-count').textContent = reqs.length + ' shown';
  const tbody = document.getElementById('req-body');
  if (!reqs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No queued or recent jobs.</td></tr>';
    return;
  }
  tbody.innerHTML = reqs.map(e=>{
    const tools = (e.tools_used && e.tools_used.length)
      ? e.tools_used.join(', ') : '<span class="muted">&mdash;</span>';
    const stColor = e.status==='failed' ? '#fc8181'
                  : (e.status==='completed' ? '#68d391' : '#f6ad55');
    const dur = e.duration_ms!=null
      ? (e.duration_ms<1000 ? e.duration_ms+'ms' : (e.duration_ms/1000).toFixed(1)+'s') : '--';
    const rowStyle = e.mismatch ? ' style="background:rgba(252,129,129,.08)"' : '';
    const tip = (e.mismatch_reasons && e.mismatch_reasons.length)
      ? ' title="'+e.mismatch_reasons.join('; ').replace(/"/g,'') + '"' : '';
    const arrow = (e.actual_topic && e.actual_topic!==e.requested_topic)
      ? ' <span class="muted">&rarr; '+e.actual_topic+'</span>' : '';
    const failTip = e.failed_reason
      ? ' <span class="muted" title="'+e.failed_reason.replace(/"/g,'')+'">&#9432;</span>' : '';
    return `<tr${rowStyle}${tip}>
      <td class="muted" style="font-size:11px">${e.ts?fmtTs(e.ts):'--'}</td>
      <td style="font-size:11px;color:#a0aec0">${e.env||'?'}</td>
      <td>${topicBadge(e.requested_topic, e.mismatch)}${arrow}</td>
      <td style="font-size:11px;color:#a0aec0">${tools}</td>
      <td style="color:${stColor};font-size:11px">${e.status}${failTip}</td>
      <td style="font-size:11px;color:#a0aec0">${(e.agent||'').split(':')[0]||'--'}</td>
      <td style="font-size:11px"><code style="background:#2d3748;padding:1px 5px;border-radius:4px">${e.model||'--'}</code></td>
      <td class="r muted">${dur}</td>
    </tr>`;
  }).join('');
}

// ── Logs ──────────────────────────────────────────────────────────────────
let _logTimer = null;

function colorLine(line) {
  if (/ERROR|CRITICAL/i.test(line)) return `<span class="err">${line}</span>`;
  if (/WARNING|WARN/i.test(line))   return `<span class="warn">${line}</span>`;
  if (/INFO|Started|running/i.test(line)) return `<span class="info">${line}</span>`;
  return line;
}

async function fetchLogs() {
  const lines   = document.getElementById('log-lines').value;
  const service = document.getElementById('log-service').value;
  const out     = document.getElementById('log-out');
  out.innerHTML = '<span style="color:#4a5568">Loading...</span>';
  const d = await fetch(`/api/logs?lines=${lines}&service=${service}`).then(r=>r.json()).catch(()=>null);
  if (!d) { out.textContent='Error fetching logs.'; return; }
  if (d.error) { out.innerHTML=`<span class="err">${d.error}</span>`; return; }
  out.innerHTML = d.lines.map(l=>colorLine(l.replace(/</g,'&lt;'))).join('\\n');
  out.scrollTop = out.scrollHeight;
}

function toggleLogAuto() {
  if (document.getElementById('log-auto').checked) {
    fetchLogs();
    _logTimer = setInterval(fetchLogs, 15000);
  } else {
    clearInterval(_logTimer); _logTimer = null;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────
fetchStatus();
fetchMetrics();
fetchByModel();
fetchAudit();
fetchRequests();
// Audit auto-starts checked
_auditTimer = setInterval(fetchAudit, 10000);
_reqTimer = setInterval(fetchRequests, 8000);

setInterval(fetchStatus, 10000);
setInterval(fetchMetrics, 10000);
setInterval(fetchByModel, 10000);
</script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
def index():
    return HTML

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
