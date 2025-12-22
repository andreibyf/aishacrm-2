# Braid Language Support for VS Code

**Type-safe, capability-controlled language for AI tool definitions.**

## Features

### Syntax Highlighting
- Keywords: `fn`, `type`, `enum`, `match`, `let`, etc.
- Types: `Result`, `Option`, `String`, `Number`, `Boolean`
- Effects: `!net`, `!clock`, `!fs`
- CRM Types: `Account`, `Lead`, `Contact`, `Opportunity`, `Activity`
- Error Types: `NotFound`, `ValidationError`, `NetworkError`
- HTTP methods: `http.get`, `http.post`, `http.put`, `http.delete`
- Result constructors: `Ok`, `Err`

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

## Installation

### From Source (Development)
```bash
cd braid-llm-kit/editor/vscode
code --install-extension .
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
