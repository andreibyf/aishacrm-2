# Contracts, Holes, Intents

- Contracts: `requires(...)` and `ensures(...)` (documented here, not enforced by mock tools).
- Holes: `?? "prompt"` appear at source locations the LLM can fill.
- Intents: `@ai(intent: {...})` metadata the agent can exploit for generation.
