# Braid Language Support for VS Code

Syntax highlighting, code snippets, and Language Server Protocol (LSP) intelligence for the Braid DSL.

## Features

- **Syntax highlighting** — keywords, types, effects, template strings, optional chaining, pipe operator
- **40+ snippets** — `@policy`, `CRMError` constructors, tool templates, control flow patterns
- **Real-time diagnostics** — parse errors, effect mismatches, security warnings, missing policies
- **Hover documentation** — function signatures, stdlib reference, IO namespace docs
- **Go-to-definition** — jump to function, type, and variable declarations
- **Auto-completion** — keywords, stdlib functions, IO methods, policies, effects
- **Signature help** — parameter hints for stdlib and user-defined functions
- **Document symbols** — outline view of functions and types

## Installation

```bash
code --install-extension braid-language-0.7.0.vsix
```

## Snippets

Type these prefixes and press Tab:

| Prefix | Expands to |
|--------|-----------|
| `fn` | Function with typed params |
| `fnnet` | Effectful function with `!net` and `@policy` |
| `match` | Match expression |
| `matchblock` | Match with block bodies |
| `errhttpfrom` | `CRMError.fromHTTP(...)` |
| `errnotfound` | `CRMError.notFound(...)` |
| `errval` | `CRMError.validation(...)` |
| `crmread` | Full READ_ONLY tool template |
| `crmwrite` | Full WRITE_OPERATIONS tool template |
| `crmdelete` | Full DELETE_OPERATIONS tool template |
| `crmsearch` | Search tool template |
| `@policy` | `@policy(...)` annotation |

## LSP Diagnostics

The language server catches issues as you type:

- **BRD010** — Effectful function without `@policy`
- **BRD011** — Invalid policy name
- **BRD020** — Effect used but not declared in signature
- **BRD021** — Effect declared but never used
- **BRD030** — Missing `tenant_id` as first parameter
- **BRD040** — Match without wildcard arm
- **SEC001** — Suspicious `__proto__`/`constructor`/`prototype` access

## Requirements

- VS Code 1.86+
- Node.js 18+ (for LSP server)

## Version History

- **0.7.0** — LSP server (diagnostics, hover, completion, go-to-definition, signature help, symbols)
- **0.6.0** — Updated snippets for CRMError.fromHTTP() pattern, @policy in all templates
- **0.5.0** — Initial syntax highlighting and snippets
