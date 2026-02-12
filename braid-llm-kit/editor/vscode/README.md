# Braid Language Support for VS Code

**Type-safe, capability-controlled language for AI tool definitions.**

## Features

### Syntax Highlighting
- Keywords: `fn`, `type`, `enum`, `match`, `let`, `const`, `actor`, `spawn`, etc.
- Types: `Result`, `Option`, `String`, `Number`, `Boolean`, and all CRM entity types
- Effects: `!net`, `!clock`, `!fs`, `!db`, `!notify`, and compound effects like `!db.write`
- CRM Types: `Account`, `Lead`, `Contact`, `Opportunity`, `Activity`, `Employee`, `BizDevSource`
- Error Types: `NotFound`, `ValidationError`, `NetworkError`, `CRMError`, `APIError`
- HTTP methods: `http.get`, `http.post`, `http.put`, `http.patch`, `http.delete`
- Result constructors: `Ok`, `Err`
- Doc comments: `///`
- String interpolation: `${expr}` inside double-quoted strings
- Capability types: `Http`, `Clock`, `Fs`, `Notify`, `Addr`

### Document Formatting (NEW in v0.4.0)
- **Format Document** (Shift+Alt+F) — auto-indents, normalizes spacing, cleans up whitespace
- **Format Selection** — format only selected lines
- **On-Type Formatting** — auto-dedent when typing `}`
- Configurable indent size (default: 2 spaces)
- Collapses multiple blank lines
- Inserts blank line separators between top-level `fn` declarations
- Trailing whitespace removal
- String-aware (doesn't modify content inside string literals)

### Snippets

| Prefix | Description |
|--------|-------------|
| `fn` | Pure function |
| `fnnet` | Function with network effect |
| `fneffects` | Function with multiple effects |
| `match` | Pattern match expression |
| `matchres` | Match a Result type |
| `type` | Type alias |
| `typerec` | Record type definition |
| `enum` | Enum type definition |
| `let` | Let binding |
| `httpget` | HTTP GET request |
| `httppost` | HTTP POST request |
| `ok` | Ok result constructor |
| `err` | Err result constructor |
| `crmtool` | Complete CRM tool template |
| `searchtool` | Search tool template |
| `validate` | Validation function template |

### Language Configuration
- Auto-closing pairs for `{}`, `[]`, `()`, `<>`, `""`
- Bracket matching including angle brackets
- Comment toggling (line `//` and block `/* */`)
- Code folding via bracket matching and `// #region` markers
- Smart indentation rules

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `braid.format.indentSize` | `2` | Spaces per indent level |
| `braid.format.insertFinalNewline` | `true` | Add newline at end of file |
| `braid.format.maxLineLength` | `120` | Soft limit for formatting hints |

## Installation

### From VSIX
```bash
code --install-extension braid-language-0.4.0.vsix
```

### From Source (Development)
```bash
cd braid-llm-kit/editor/vscode
npx @vscode/vsce package
code --install-extension braid-language-0.4.0.vsix
```

### Manual Installation
1. Copy this folder to `~/.vscode/extensions/braid-language`
2. Restart VS Code

## Example

```braid
// Search leads by name or email
import { Result, Lead, CRMError } from "../../spec/types.braid"

fn searchLeads(query: String) -> Result<Array<Lead>, CRMError> !net {
  let url = "/api/v2/leads/search?q=" + query;
  let response = http.get(url);
  
  return match response {
    Ok{value} => Ok(value.data),
    Err{error} => Err(NetworkError{ url: url, code: error.status }),
    _ => Err(NetworkError{ url: url, code: 500 })
  };
}
```

## Language Reference

See [BRAID_SPEC.md](../../BRAID_SPEC.md) for the full language specification.

## Contributing

Braid is an evolving language. Contributions welcome!

- Report issues
- Submit syntax improvements
- Add new snippets
- Improve documentation
