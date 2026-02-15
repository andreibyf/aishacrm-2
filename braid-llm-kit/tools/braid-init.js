#!/usr/bin/env node
// braid-init.js — Project scaffolding for Braid
// Usage: node braid-init.js [project-name] [--template <name>]
//
// Templates:
//   crm-tool    — CRM tool function with @policy, !net, Result error handling
//   data-pipe   — Pure data transformation pipeline, no effects
//   web-service — HTTP service with !net + !clock effects
//   empty       — Minimal project with just main.braid + policy.json
"use strict";

import fs from 'fs';
import path from 'path';

// ============================================================================
// TEMPLATES
// ============================================================================

const TEMPLATES = {
  'crm-tool': {
    description: 'CRM tool function with @policy, !net, Result error handling',
    files: {
      'main.braid': `import { Result, CRMError } from "../../spec/types.braid"

// @policy(READ_ONLY)
fn list_items(
  tenant_id: String,
  limit: Number,
  offset: Number
) -> Result<Array, CRMError> !net {
  let url = \`/api/items?tenant_id=\${tenant_id}&limit=\${limit}&offset=\${offset}\`;
  let response = http.get(url)?;
  match response {
    Ok{data} => Ok(data),
    Err{error} => Err(CRMError.fromHTTP(error))
  }
}

// @policy(WRITE)
fn create_item(
  tenant_id: String,
  name: String,
  metadata: Object
) -> Result<Object, CRMError> !net {
  let url = "/api/items";
  let body = { tenant_id: tenant_id, name: name, metadata: metadata };
  let response = http.post(url, body)?;
  match response {
    Ok{data} => Ok(data),
    Err{error} => Err(CRMError.fromHTTP(error))
  }
}
`,
      'policy.json': `{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "policies": {
    "READ_ONLY": {
      "allowedEffects": ["net"],
      "maxExecutionMs": 5000,
      "audit": true
    },
    "WRITE": {
      "allowedEffects": ["net"],
      "maxExecutionMs": 10000,
      "audit": true,
      "requireApproval": false
    }
  }
}
`,
      'braid.toml': `[project]
name = "{{PROJECT_NAME}}"
version = "0.1.0"
target = "js"

[policy]
file = "policy.json"

[build]
entry = "main.braid"
outDir = "dist"
`,
    },
  },

  'data-pipe': {
    description: 'Pure data transformation pipeline, no effects',
    files: {
      'main.braid': `import { Result, CRMError } from "../../spec/types.braid"

type TransformResult = {
  records: Array,
  count: Number,
  skipped: Number
}

// @policy(READ_ONLY)
fn transform(
  tenant_id: String,
  records: Array,
  filter_field: String,
  filter_value: String
) -> Result<TransformResult, CRMError> {
  let filtered = records
    |> filter((r) => r[filter_field] == filter_value)
    |> map((r) => {
      { ...r, processed: true, tenant_id: tenant_id }
    });

  Ok({
    records: filtered,
    count: len(filtered),
    skipped: len(records) - len(filtered)
  })
}

// @policy(READ_ONLY)
fn summarize(
  tenant_id: String,
  records: Array,
  group_by: String
) -> Result<Object, CRMError> {
  let groups = {};
  for record in records {
    let key = record[group_by];
    let current = groups[key] ?? 0;
    groups[key] = current + 1;
  }
  Ok(groups)
}
`,
      'policy.json': `{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "policies": {
    "READ_ONLY": {
      "allowedEffects": [],
      "maxExecutionMs": 3000,
      "audit": false
    }
  }
}
`,
      'braid.toml': `[project]
name = "{{PROJECT_NAME}}"
version = "0.1.0"
target = "js"

[policy]
file = "policy.json"

[build]
entry = "main.braid"
outDir = "dist"
`,
    },
  },

  'web-service': {
    description: 'HTTP service with !net + !clock effects',
    files: {
      'main.braid': `import { Result, CRMError } from "../../spec/types.braid"

// @policy(READ_ONLY)
fn health_check(
  tenant_id: String
) -> Result<Object, CRMError> !clock {
  let now = clock.now();
  Ok({ status: "ok", timestamp: now, tenant_id: tenant_id })
}

// @policy(READ_ONLY)
fn get_status(
  tenant_id: String,
  service_name: String
) -> Result<Object, CRMError> !net,clock {
  let url = \`/api/services/\${service_name}/status\`;
  let response = http.get(url)?;
  let now = clock.now();
  match response {
    Ok{data} => Ok({ ...data, checked_at: now, tenant_id: tenant_id }),
    Err{error} => Err(CRMError.fromHTTP(error))
  }
}
`,
      'policy.json': `{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "policies": {
    "READ_ONLY": {
      "allowedEffects": ["net", "clock"],
      "maxExecutionMs": 5000,
      "audit": true
    }
  }
}
`,
      'braid.toml': `[project]
name = "{{PROJECT_NAME}}"
version = "0.1.0"
target = "js"

[policy]
file = "policy.json"

[build]
entry = "main.braid"
outDir = "dist"
`,
    },
  },

  'empty': {
    description: 'Minimal project with just main.braid + policy.json',
    files: {
      'main.braid': `// @policy(READ_ONLY)
fn hello(tenant_id: String, name: String) -> Result<String, String> {
  Ok("Hello, " + name)
}
`,
      'policy.json': `{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "policies": {
    "READ_ONLY": {
      "allowedEffects": [],
      "maxExecutionMs": 1000,
      "audit": false
    }
  }
}
`,
    },
  },
};

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`
Usage: braid init <project-name> [--template <name>]

Templates:
  crm-tool     ${TEMPLATES['crm-tool'].description}
  data-pipe    ${TEMPLATES['data-pipe'].description}
  web-service  ${TEMPLATES['web-service'].description}
  empty        ${TEMPLATES['empty'].description}

Examples:
  braid init my-crm-tool
  braid init my-crm-tool --template crm-tool
  braid init my-pipeline --template data-pipe
  braid init my-service --template web-service
`.trim());
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let projectName = null;
  let templateName = 'crm-tool';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template' || args[i] === '-t') {
      templateName = args[++i];
    } else if (!args[i].startsWith('-')) {
      projectName = args[i];
    }
  }

  if (!projectName) {
    console.error('Error: project name is required');
    printUsage();
    process.exit(1);
  }

  if (!TEMPLATES[templateName]) {
    console.error(`Error: unknown template "${templateName}"`);
    console.error(`Available: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  const template = TEMPLATES[templateName];
  const targetDir = path.resolve(projectName);

  if (fs.existsSync(targetDir)) {
    console.error(`Error: directory "${projectName}" already exists`);
    process.exit(1);
  }

  console.log(`Creating Braid project: ${projectName}`);
  console.log(`Template: ${templateName} — ${template.description}`);
  console.log();

  fs.mkdirSync(targetDir, { recursive: true });

  for (const [filename, content] of Object.entries(template.files)) {
    const filePath = path.join(targetDir, filename);
    const expanded = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.writeFileSync(filePath, expanded, 'utf8');
    console.log(`  ✓ ${filename}`);
  }

  console.log();
  console.log(`Done! Next steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  # Edit main.braid`);
  console.log(`  node ../core/braid-check.js main.braid`);
  console.log();
}

main();
