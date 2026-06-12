# AI-server ops scripts

Source-of-truth copies of the tools that run **on the AI server** (`192.168.7.219`).
These are version-controlled here but **deployed manually** to the box — editing
this folder does not update the server.

| File                  | Deployed to                       | Run by                             |
| --------------------- | --------------------------------- | ---------------------------------- |
| `vllm_admin.py`       | `/home/aisha/vllm_admin.py`       | systemd `vllm-admin` (port 7860)   |
| `inject_demo_jobs.py` | `/home/aisha/inject_demo_jobs.py` | on demand (Requests-tab demo data) |

See [`docs/ai-server/monitor.md`](../../docs/ai-server/monitor.md) for what the monitor does.

## Deploying a change

```bash
# from this folder, with the AI server's SSH set up
pscp ops/ai-server/vllm_admin.py aisha@192.168.7.219:/home/aisha/vllm_admin.py
ssh aisha@192.168.7.219 "/home/aisha/vllm-env/bin/python -m py_compile /home/aisha/vllm_admin.py && sudo systemctl restart vllm-admin"
```

A backup of the previous version lives at `/home/aisha/vllm_admin.py.bak` on the box.

## Secrets

`vllm_admin.py` reads `VLLM_KEY` (the vLLM API key) from the environment — it is
**not** hardcoded. The systemd unit provides it via a drop-in:

```ini
# /etc/systemd/system/vllm-admin.service.d/env.conf
[Service]
Environment="VLLM_KEY=<the LOCAL_LLM_API_KEY value>"
```

After changing the drop-in: `sudo systemctl daemon-reload && sudo systemctl restart vllm-admin`.

## Runtime notes

- Use `/home/aisha/vllm-env/bin/python` — there is no `python` on PATH and the deps
  (fastapi, httpx, redis) live only in the vLLM venv.
- The monitor reads the Bull task queue from local Redis `6381` (bound to localhost),
  which works because it runs on the same box.
