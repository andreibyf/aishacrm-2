# Braid LLM Kit (Extended)

Language version: 0.3.0

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

## Versioning and Changelog

We follow semantic versioning for the language and kit materials. Minor bumps (0.x → 0.(x+1)) are backward-compatible additions or clarifications; patch bumps fix bugs/omissions in specs/grammar without changing meaning.

- 0.3.0
	- Add formal attributes syntax (`@name(...)`) parsed and surfaced to HIR
	- Policy enforcement in checker: `braid-check --policy policy.json` errors on forbidden effects (BRAD201)
	- HIR extractor tool: `tools/braid-hir` emits functions, attributes, routes as JSON
	- VS Code grammar: add `state`, `spawn` keywords and `@attribute` highlighting
	- Grammar tweaks: allow `async` before or after `fn` temporarily; actor state inline form

- 0.2.0
	- Align formal grammar with existing examples/docs:
		- Added `async` on function signatures and `await` as a unary expression
		- Added actor syntax: `actor Name { state { … } fn … }`, `spawn Name { … }`
		- Added Result propagation operator `?` (postfix) to match examples
		- Added member access and method call chaining: `a.b`, `a.b()`, `obj.method(args)`
		- Added assignment and compound assignment statements: `=`, `+=`, `-=`, `*=`, `/=`
		- Documented line (`//`) and block (`/* … */`) comments as lexically ignored
	- These changes are additive and backward-compatible with previously valid programs.

- 0.1.0
	- Initial public kit with grammar, examples, mock tools, and VS Code scaffolding

## Syntax quick reference

- Types: `type Alias = { field: T }`, `Option[T]`, `Result[T,E]`, generics `Ident[T,U]`
- Functions: `fn name(args) -> T !eff1,eff2 { … }` or `async fn name(...) -> T { await … }`
- Errors: `Ok(x)`, `Err(e)`, propagate with postfix `?`
- Match: `match expr { Pattern => expr, … }` (exhaustive on enums)
- Records: literals `{ k: v }`, access `obj.k`
- Actors: `actor Counter { state { value: u64 } fn inc(by: u64) { self.value += by; } }`
	- Spawn: `let c = spawn Counter { value: 0 };`
	- Messages: `await c.inc(1); let v = await c.get();`
- Holes: `?? "explain what belongs here"`
- Attributes: `@ai(intent: {"service":"crm","action":"lead_create"})` on `fn`, `actor`, etc. (inert in mock tools)

Notes
- Capabilities and effects are explicit (`!fs, net, clock`); the checker validates declared usage
- Contracts/holes/intents exist in docs; enforcement is stubbed in mock tools

## Migration notes (0.2.0)
## Tools

- Check with optional policy:
	- `node tools/braid-check examples/03_result_effects.braid --policy templates/web-service/policy.json`
- Export HIR JSON (functions/attributes/routes):
	- `node tools/braid-hir examples/03_result_effects.braid > /tmp/hir.json`

### Adapter pipeline (check + HIR)

Use `braid-adapter` to run the checker (with optional policy) and, only if it passes, emit HIR JSON to stdout. Non‑zero exit codes propagate diagnostics from the checker.

Basic usage:

```bash
node tools/braid-adapter --file examples/06_attributes_policy.braid > /tmp/hir.json
```

With a policy (for effect allowlist / denylist):

```bash
node tools/braid-adapter --file examples/06_attributes_policy.braid --policy templates/web-service/policy.json > /tmp/hir.json
```

Exit codes:
- 0: success, HIR JSON written to stdout
- 2: bad invocation (missing --file)
- other: checker or HIR extraction failed; diagnostics written to stderr

This script is intended for backend integration pipelines: first enforce safety/policy, then consume structured HIR for routing, intent indexing, or AI planning.

Existing code should continue to parse. If you implemented your own parser from the earlier EBNF:
- Add support for `async`/`await`, postfix `?`, actor/state/spawn forms
- Allow compound assignments and member access/method calls
- Treat `//` and `/* … */` as comments (lexically ignored)

Editor support
- The VS Code `tmLanguage` may lag these additions; syntax highlighting for new forms can be updated separately without impacting compilation/checking.
