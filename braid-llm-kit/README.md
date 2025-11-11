# Braid LLM Kit (Extended)

This kit gives LLMs rails to generate consistent Braid code: grammar, specs, schemas,
mock CLI tools with deterministic JSON diagnostics, a VS Code extension scaffold,
examples, tests, and templates, plus two helper scripts (`agent_stub.py`, `llm_autofix.py`).

## Quick use
```bash
cd braid-llm-kit

# format
node tools/braid-fmt < examples/03_result_effects.braid > /tmp/out.braid

# check (JSONL diagnostics, nonzero exit on errors)
node tools/braid-check examples/03_result_effects.braid

# build manifest (mock)
node tools/braid-build templates/web-service

# run (mock event stream)
node tools/braid-run templates/web-service/out/app.wasm --policy templates/web-service/policy.json
```

## LLM self-correction loop
Use `tools/llm_autofix.py` to apply checker-suggested edits automatically:
```bash
python3 tools/llm_autofix.py examples/03_result_effects.braid
```

## Stub generator (hosted LLM)
`tools/agent_stub.py` calls a hosted LLM to produce a Braid file then runs the checker:
```bash
export OPENAI_API_KEY=sk-...   # or set in PowerShell
python3 tools/agent_stub.py "Create a /time endpoint returning epoch" examples/time.braid || true
python3 tools/llm_autofix.py examples/time.braid
```
