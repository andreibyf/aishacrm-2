"""Inject clearly-labeled [demo] Bull jobs to demonstrate the Requests monitor.
Ids 90000x won't collide with real jobs. Remove with: python inject_demo_jobs.py clear
"""
import sys
import json
import time

import redis

r = redis.Redis(host="127.0.0.1", port=6381, decode_responses=True)
now = int(time.time() * 1000)
DEMO_IDS = ["900001", "900002", "900003"]


def clear():
    for env in ("dev", "prd"):
        p = f"bull:task-execution:{env}"
        for jid in DEMO_IDS:
            r.delete(f"{p}:{jid}")
            r.zrem(f"{p}:completed", jid)
            r.zrem(f"{p}:failed", jid)
    print("cleared demo jobs")


def add(jid, env, desc, meta, processed, finished, status="completed", failed=None):
    p = f"bull:task-execution:{env}"
    h = {
        "name": "execute-task",
        "timestamp": str(now - 6000),
        "processedOn": str(processed),
        "attemptsMade": "1",
        "data": json.dumps({"task_id": f"task:{jid}", "description": desc}),
    }
    if status == "completed":
        h["finishedOn"] = str(finished)
        h["returnvalue"] = json.dumps({"status": "completed", "result": "(demo)", "meta": meta})
        r.hset(f"{p}:{jid}", mapping=h)
        r.zadd(f"{p}:completed", {jid: finished})
    else:
        h["finishedOn"] = str(finished)
        h["failedReason"] = failed or "demo failure"
        r.hset(f"{p}:{jid}", mapping=h)
        r.zadd(f"{p}:failed", {jid: finished})


def seed():
    add("900001", "dev", "[demo] Draft an introductory email to Sarah Chen at Brightwave",
        {"env": "dev", "agent": "customer_service_manager:dev", "role": "customer_service_manager",
         "model": "aisha-task-lite", "tier": "lite",
         "requested_topic": "email", "requested_intents": ["email"],
         "actual_topic": "email", "actual_facets": ["email"],
         "tools_used": ["draft_email"], "mismatch": False, "mismatch_reasons": [],
         "gate_pass": True, "total_tokens": 140},
        now - 4000, now - 100)
    add("900002", "dev", "[demo] Draft an email to Sarah and add a note to her contact",
        {"env": "dev", "agent": "customer_service_manager:dev", "role": "customer_service_manager",
         "model": "aisha-task-lite", "tier": "lite",
         "requested_topic": "email+note", "requested_intents": ["email", "note"],
         "actual_topic": "email", "actual_facets": ["email"],
         "tools_used": ["draft_email"], "mismatch": True,
         "mismatch_reasons": ["requested note but no note tool ran"],
         "gate_pass": True, "total_tokens": 160},
        now - 3000, now - 200)
    add("900003", "prd", "[demo] Summarize the latest call notes",
        {}, now - 2000, now - 150, status="failed", failed="tool timeout after 30s")
    print("injected 3 demo jobs (2 dev completed, 1 prd failed)")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "clear":
        clear()
    else:
        seed()
