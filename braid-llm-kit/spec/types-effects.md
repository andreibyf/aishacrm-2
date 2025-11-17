# Types and Effects

- Static types with inference.
- No nulls. Use `Option[T]`.
- Errors via `Result[T,E]` and `?` propagation.
- Effects annotate functions: `fn read() -> Data !fs,net`.
- Missing declared effects when used is an error.
- Capabilities (e.g., `fs`, `http`, `clock`) are explicit parameters.
