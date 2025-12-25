#!/usr/bin/env node

/**
 * GitHub Secrets Audit Script
 * 
 * Scans all workflow files for ${{ secrets.* }} references and compares them
 * against configured GitHub Actions secrets to identify:
 * - Secrets referenced in workflows but not configured
 * - Secrets configured but never used in any workflow
 * - Usage statistics for each secret
 * 
 * Usage:
 *   node scripts/audit-github-secrets.js
 *   node scripts/audit-github-secrets.js --format json > audit-report.json
 *   node scripts/audit-github-secrets.js --check-only  # Exit 1 if missing secrets found
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  format: args.includes('--format') ? args[args.indexOf('--format') + 1] : 'text',
  checkOnly: args.includes('--check-only'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help
if (options.help) {
  console.log(`
${colors.cyan}GitHub Secrets Audit Script${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node scripts/audit-github-secrets.js [options]

${colors.yellow}Options:${colors.reset}
  --format <type>    Output format: text (default), json, markdown
  --check-only       Exit with code 1 if missing secrets found
  --verbose, -v      Show detailed information
  --help, -h         Show this help message

${colors.yellow}Examples:${colors.reset}
  # Interactive audit with colored output
  node scripts/audit-github-secrets.js

  # Generate JSON report
  node scripts/audit-github-secrets.js --format json > audit-report.json

  # Generate markdown report for docs
  node scripts/audit-github-secrets.js --format markdown > SECRETS_AUDIT.md

  # CI validation (fail if missing secrets)
  node scripts/audit-github-secrets.js --check-only

${colors.yellow}Exit Codes:${colors.reset}
  0 - All workflow secrets are configured
  1 - Missing secrets found (or error occurred)
`);
  process.exit(0);
}

/**
 * Get all workflow files from .github/workflows directory
 */
function getWorkflowFiles() {
  const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
  
  if (!fs.existsSync(workflowsDir)) {
    throw new Error(`Workflows directory not found: ${workflowsDir}`);
  }

  return fs.readdirSync(workflowsDir)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map(file => path.join(workflowsDir, file));
}

/**
 * Extract all secrets.* references from a workflow file
 */
function extractSecretsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  
  // Regex to match ${{ secrets.SECRET_NAME }}
  const secretRegex = /\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/gi;
  const matches = [];
  let match;

  while ((match = secretRegex.exec(content)) !== null) {
    const secretName = match[1];
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    matches.push({
      name: secretName,
      file: fileName,
      line: lineNumber,
      context: content.split('\n')[lineNumber - 1].trim()
    });
  }

  return matches;
}

/**
 * Extract all vars.* references from a workflow file
 */
function extractVariablesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  
  // Regex to match ${{ vars.VARIABLE_NAME }}
  const variableRegex = /\$\{\{\s*vars\.([A-Z_][A-Z0-9_]*)\s*\}\}/gi;
  const matches = [];
  let match;

  while ((match = variableRegex.exec(content)) !== null) {
    const variableName = match[1];
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    matches.push({
      name: variableName,
      file: fileName,
      line: lineNumber,
      context: content.split('\n')[lineNumber - 1].trim()
    });
  }

  return matches;
}

/**
 * Scan all workflow files for secret references
 */
function scanWorkflows() {
  const workflowFiles = getWorkflowFiles();
  const allSecrets = new Map(); // secretName -> [{ file, line, context }]

  for (const filePath of workflowFiles) {
    const secrets = extractSecretsFromFile(filePath);
    
    for (const secret of secrets) {
      if (!allSecrets.has(secret.name)) {
        allSecrets.set(secret.name, []);
      }
      allSecrets.get(secret.name).push({
        file: secret.file,
        line: secret.line,
        context: secret.context
      });
    }
  }

  return allSecrets;
}

/**
 * Scan all workflow files for variable references
 */
function scanVariables() {
  const workflowFiles = getWorkflowFiles();
  const allVariables = new Map(); // variableName -> [{ file, line, context }]

  for (const filePath of workflowFiles) {
    const variables = extractVariablesFromFile(filePath);
    
    for (const variable of variables) {
      if (!allVariables.has(variable.name)) {
        allVariables.set(variable.name, []);
      }
      allVariables.get(variable.name).push({
        file: variable.file,
        line: variable.line,
        context: variable.context
      });
    }
  }

  return allVariables;
}

/**
 * Get configured secrets from GitHub (requires gh CLI or API token)
 */
function getConfiguredSecrets() {
  try {
    // Try using GitHub CLI
    const result = execSync('gh secret list --json name', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const secrets = JSON.parse(result);
    return new Set(secrets.map(s => s.name));
  } catch (error) {
    if (options.verbose) {
      console.error(`${colors.yellow}Warning: Could not fetch configured secrets from GitHub${colors.reset}`);
      console.error(`${colors.gray}Install GitHub CLI (gh) and authenticate to enable this feature${colors.reset}`);
      console.error(`${colors.gray}Run: gh auth login${colors.reset}\n`);
    }
    return null;
  }
}

/**
 * Get configured variables from GitHub (requires gh CLI)
 */
function getConfiguredVariables() {
  try {
    // Try using GitHub CLI
    const result = execSync('gh variable list --json name', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const variables = JSON.parse(result);
    return new Set(variables.map(v => v.name));
  } catch (error) {
    if (options.verbose) {
      console.error(`${colors.yellow}Warning: Could not fetch configured variables from GitHub${colors.reset}`);
      console.error(`${colors.gray}Install GitHub CLI (gh) and authenticate to enable this feature${colors.reset}`);
    }
    return null;
  }
}

/**
 * Categorize secrets into standard GitHub secrets vs custom ones
 */
function categorizeSecret(name) {
  // Standard GitHub-provided secrets
  const standardSecrets = new Set([
    'GITHUB_TOKEN',
    'GITHUB_ACTOR',
    'GITHUB_REPOSITORY',
    'GITHUB_REF',
    'GITHUB_SHA',
    'GITHUB_WORKFLOW',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_NUMBER',
    'GITHUB_EVENT_NAME',
    'GITHUB_EVENT_PATH',
    'GITHUB_WORKSPACE'
  ]);

  if (standardSecrets.has(name)) {
    return 'standard';
  }
  
  // Infer category from prefix
  if (name.startsWith('VITE_')) return 'frontend';
  if (name.startsWith('PROD_')) return 'deployment';
  if (name.includes('VPS')) return 'deployment';
  if (name.includes('SUPABASE')) return 'database';
  if (name.includes('DOPPLER')) return 'secrets-manager';
  if (name.includes('API_KEY') || name.includes('TOKEN')) return 'api-credentials';
  
  return 'other';
}

/**
 * Determine if a value should be a variable instead of a secret
 * Returns true if this should be a GitHub Variable (non-sensitive)
 */
function shouldBeVariable(name) {
  // Public/non-sensitive values that should be variables
  const variableCandidates = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_AISHACRM_BACKEND_URL',
    'SUPABASE_URL',
    'TENANT_ID'
  ];
  
  return variableCandidates.includes(name);
}

/**
 * Detect misconfigurations:
 * - Values in secrets that should be variables
 * - Values in variables that should be secrets
 */
function detectMisconfigurations(workflowSecrets, workflowVariables, configuredSecrets, configuredVariables) {
  const misconfigurations = {
    shouldBeVariables: [],  // In secrets but should be variables
    shouldBeSecrets: [],    // In variables but should be secrets
  };
  
  // Check secrets that should be variables
  if (configuredSecrets) {
    for (const [name, usages] of workflowSecrets.entries()) {
      if (shouldBeVariable(name) && configuredSecrets.has(name)) {
        misconfigurations.shouldBeVariables.push({ name, usages });
      }
    }
  }
  
  // Check variables that should be secrets (sensitive data in variables)
  if (configuredVariables) {
    for (const [name, usages] of workflowVariables.entries()) {
      // If it contains sensitive keywords, it probably should be a secret
      const sensitiveKeywords = ['SERVICE_ROLE_KEY', 'SECRET', 'PASSWORD', 'PRIVATE_KEY', 'API_KEY', 'DATABASE_URL'];
      const isSensitive = sensitiveKeywords.some(keyword => name.includes(keyword));
      
      if (isSensitive && configuredVariables.has(name)) {
        misconfigurations.shouldBeSecrets.push({ name, usages });
      }
    }
  }
  
  return misconfigurations;
}

/**
 * Generate text report
 */
function generateTextReport(workflowSecrets, configuredSecrets, workflowVariables, configuredVariables, misconfigurations) {
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}     GitHub Actions Secrets & Variables Audit Report${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  // Summary
  const totalSecrets = workflowSecrets.size;
  const totalVariables = workflowVariables.size;
  const standardSecrets = Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) === 'standard');
  const customSecrets = Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) !== 'standard');
  
  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  Secrets referenced:       ${colors.cyan}${totalSecrets}${colors.reset} (${standardSecrets.length} standard, ${customSecrets.length} custom)`);
  console.log(`  Variables referenced:     ${colors.cyan}${totalVariables}${colors.reset}`);
  if (configuredSecrets) {
    console.log(`  Secrets configured:       ${colors.cyan}${configuredSecrets.size}${colors.reset}`);
  }
  if (configuredVariables) {
    console.log(`  Variables configured:     ${colors.cyan}${configuredVariables.size}${colors.reset}`);
  }
  console.log();

  // Misconfigurations
  if (misconfigurations.shouldBeVariables.length > 0) {
    console.log(`${colors.bold}${colors.red}⚠️  MISCONFIGURATIONS DETECTED:${colors.reset}`);
    console.log(`${colors.red}The following values are in SECRETS but should be VARIABLES (non-sensitive):${colors.reset}\n`);
    
    for (const { name, usages } of misconfigurations.shouldBeVariables) {
      console.log(`  ${colors.red}✗ ${name}${colors.reset} ${colors.yellow}(should be a variable)${colors.reset}`);
      console.log(`    Used in: ${usages.map(u => u.file).join(', ')}`);
      console.log(`    ${colors.gray}This is public/non-sensitive and should use vars.${name}${colors.reset}`);
    }
    console.log();
  }
  
  if (misconfigurations.shouldBeSecrets.length > 0) {
    console.log(`${colors.bold}${colors.red}⚠️  SECURITY WARNING:${colors.reset}`);
    console.log(`${colors.red}The following values are in VARIABLES but appear sensitive:${colors.reset}\n`);
    
    for (const { name, usages } of misconfigurations.shouldBeSecrets) {
      console.log(`  ${colors.red}✗ ${name}${colors.reset} ${colors.yellow}(should be a secret)${colors.reset}`);
      console.log(`    Used in: ${usages.map(u => u.file).join(', ')}`);
    }
    console.log();
  }

  // Group secrets by category
  const categories = {};
  for (const [name, usages] of workflowSecrets.entries()) {
    const category = categorizeSecret(name);
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({ name, usages });
  }

  // Display secrets by category
  const categoryOrder = ['standard', 'frontend', 'database', 'api-credentials', 'secrets-manager', 'deployment', 'other'];
  const categoryLabels = {
    standard: '🔧 Standard GitHub Secrets',
    frontend: '🎨 Frontend Configuration',
    database: '🗄️  Database & Supabase',
    'api-credentials': '🔑 API Keys & Tokens',
    'secrets-manager': '🔐 Secrets Management',
    deployment: '🚀 Deployment Credentials',
    other: '📦 Other Secrets'
  };

  console.log(`${colors.bold}Secrets Referenced in Workflows:${colors.reset}\n`);

  for (const category of categoryOrder) {
    if (!categories[category] || categories[category].length === 0) continue;

    console.log(`${colors.bold}${categoryLabels[category] || category}:${colors.reset}`);
    
    for (const { name, usages } of categories[category].sort((a, b) => a.name.localeCompare(b.name))) {
      const isStandard = categorizeSecret(name) === 'standard';
      const isConfigured = configuredSecrets ? configuredSecrets.has(name) : null;
      const shouldBeVar = shouldBeVariable(name);
      
      let status = '';
      if (isStandard) {
        status = `${colors.gray}(auto-provided)${colors.reset}`;
      } else if (shouldBeVar) {
        status = `${colors.red}⚠ should be variable${colors.reset}`;
      } else if (isConfigured === true) {
        status = `${colors.green}✓ configured${colors.reset}`;
      } else if (isConfigured === false) {
        status = `${colors.red}✗ MISSING${colors.reset}`;
      } else {
        status = `${colors.yellow}? unknown${colors.reset}`;
      }

      console.log(`  ${colors.cyan}${name}${colors.reset} ${status}`);
      console.log(`    Used in ${colors.yellow}${usages.length}${colors.reset} location(s):`);
      
      for (const usage of usages) {
        console.log(`      • ${colors.gray}${usage.file}:${usage.line}${colors.reset}`);
        if (options.verbose) {
          console.log(`        ${colors.gray}${usage.context}${colors.reset}`);
        }
      }
      console.log();
    }
  }

  // Display variables
  if (workflowVariables.size > 0) {
    console.log(`${colors.bold}Variables Referenced in Workflows:${colors.reset}\n`);
    
    for (const [name, usages] of Array.from(workflowVariables.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const isConfigured = configuredVariables ? configuredVariables.has(name) : null;
      
      let status = '';
      if (isConfigured === true) {
        status = `${colors.green}✓ configured${colors.reset}`;
      } else if (isConfigured === false) {
        status = `${colors.red}✗ MISSING${colors.reset}`;
      } else {
        status = `${colors.yellow}? unknown${colors.reset}`;
      }

      console.log(`  ${colors.cyan}${name}${colors.reset} ${status}`);
      console.log(`    Used in ${colors.yellow}${usages.length}${colors.reset} location(s):`);
      
      for (const usage of usages) {
        console.log(`      • ${colors.gray}${usage.file}:${usage.line}${colors.reset}`);
        if (options.verbose) {
          console.log(`        ${colors.gray}${usage.context}${colors.reset}`);
        }
      }
      console.log();
    }
  }

  // Missing secrets warning
  if (configuredSecrets) {
    const missingSecrets = customSecrets.filter(s => !configuredSecrets.has(s) && !shouldBeVariable(s));
    
    if (missingSecrets.length > 0) {
      console.log(`${colors.bold}${colors.red}⚠️  MISSING SECRETS (${missingSecrets.length}):${colors.reset}`);
      for (const secret of missingSecrets) {
        const usages = workflowSecrets.get(secret);
        console.log(`  ${colors.red}✗ ${secret}${colors.reset}`);
        console.log(`    Required by: ${usages.map(u => u.file).join(', ')}`);
      }
      console.log();
    } else {
      console.log(`${colors.green}✓ All required secrets are configured!${colors.reset}\n`);
    }

    // Unused secrets
    const usedSecrets = new Set(customSecrets);
    const unusedSecrets = Array.from(configuredSecrets).filter(s => !usedSecrets.has(s));
    
    if (unusedSecrets.length > 0) {
      console.log(`${colors.bold}${colors.yellow}📋 CONFIGURED BUT UNUSED SECRETS (${unusedSecrets.length}):${colors.reset}`);
      for (const secret of unusedSecrets.sort()) {
        console.log(`  ${colors.yellow}• ${secret}${colors.reset}`);
      }
      console.log(`\n${colors.gray}These secrets are configured but not referenced in any workflow.${colors.reset}`);
      console.log(`${colors.gray}They may be used in production .env files or injected at runtime.${colors.reset}\n`);
    }
  }

  // Missing variables warning
  if (configuredVariables && workflowVariables.size > 0) {
    const missingVariables = Array.from(workflowVariables.keys()).filter(v => !configuredVariables.has(v));
    
    if (missingVariables.length > 0) {
      console.log(`${colors.bold}${colors.red}⚠️  MISSING VARIABLES (${missingVariables.length}):${colors.reset}`);
      for (const variable of missingVariables) {
        const usages = workflowVariables.get(variable);
        console.log(`  ${colors.red}✗ ${variable}${colors.reset}`);
        console.log(`    Required by: ${usages.map(u => u.file).join(', ')}`);
      }
      console.log();
    }
  }

  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);
  
  const missingCount = configuredSecrets ? 
    customSecrets.filter(s => !configuredSecrets.has(s) && !shouldBeVariable(s)).length : 0;
  const misconfigCount = misconfigurations.shouldBeVariables.length;
  
  return missingCount + misconfigCount;
}

/**
 * Generate JSON report
 */
function generateJSONReport(workflowSecrets, configuredSecrets, workflowVariables, configuredVariables, misconfigurations) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      secretsReferenced: workflowSecrets.size,
      variablesReferenced: workflowVariables.size,
      secretsConfigured: configuredSecrets ? configuredSecrets.size : null,
      variablesConfigured: configuredVariables ? configuredVariables.size : null,
      standardSecrets: Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) === 'standard').length,
      customSecrets: Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) !== 'standard').length
    },
    secrets: {},
    variables: {},
    misconfigurations: {
      shouldBeVariables: misconfigurations.shouldBeVariables.map(m => m.name),
      shouldBeSecrets: misconfigurations.shouldBeSecrets.map(m => m.name)
    },
    missing: {
      secrets: [],
      variables: []
    },
    unused: {
      secrets: [],
      variables: []
    }
  };

  // Build secrets object
  for (const [name, usages] of workflowSecrets.entries()) {
    report.secrets[name] = {
      category: categorizeSecret(name),
      configured: configuredSecrets ? configuredSecrets.has(name) : null,
      isStandard: categorizeSecret(name) === 'standard',
      shouldBeVariable: shouldBeVariable(name),
      usageCount: usages.length,
      usages: usages.map(u => ({
        file: u.file,
        line: u.line,
        context: u.context
      }))
    };
  }

  // Build variables object
  for (const [name, usages] of workflowVariables.entries()) {
    report.variables[name] = {
      configured: configuredVariables ? configuredVariables.has(name) : null,
      usageCount: usages.length,
      usages: usages.map(u => ({
        file: u.file,
        line: u.line,
        context: u.context
      }))
    };
  }

  // Missing secrets and variables
  if (configuredSecrets) {
    const customSecrets = Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) !== 'standard');
    report.missing.secrets = customSecrets.filter(s => !configuredSecrets.has(s) && !shouldBeVariable(s));
    
    const usedSecrets = new Set(customSecrets);
    report.unused.secrets = Array.from(configuredSecrets).filter(s => !usedSecrets.has(s));
  }

  if (configuredVariables) {
    report.missing.variables = Array.from(workflowVariables.keys()).filter(v => !configuredVariables.has(v));
    
    const usedVariables = new Set(workflowVariables.keys());
    report.unused.variables = Array.from(configuredVariables).filter(v => !usedVariables.has(v));
  }

  console.log(JSON.stringify(report, null, 2));
  
  return report.missing.secrets.length + misconfigurations.shouldBeVariables.length;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(workflowSecrets, configuredSecrets, workflowVariables, configuredVariables, misconfigurations) {
  const lines = [];
  
  lines.push('# GitHub Actions Secrets & Variables Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Secrets referenced | ${workflowSecrets.size} |`);
  lines.push(`| Variables referenced | ${workflowVariables.size} |`);
  if (configuredSecrets) {
    lines.push(`| Secrets configured | ${configuredSecrets.size} |`);
  }
  if (configuredVariables) {
    lines.push(`| Variables configured | ${configuredVariables.size} |`);
  }
  lines.push(`| Standard GitHub secrets | ${Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) === 'standard').length} |`);
  lines.push(`| Custom secrets | ${Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) !== 'standard').length} |`);
  lines.push('');

  // Misconfigurations
  if (misconfigurations.shouldBeVariables.length > 0) {
    lines.push('## ⚠️ Misconfigurations');
    lines.push('');
    lines.push('**The following values are in SECRETS but should be VARIABLES (non-sensitive):**');
    lines.push('');
    for (const { name, usages } of misconfigurations.shouldBeVariables) {
      lines.push(`- **\`${name}\`** - Used in: ${usages.map(u => u.file).join(', ')}`);
      lines.push(`  - Should use \`vars.${name}\` instead of \`secrets.${name}\``);
    }
    lines.push('');
  }

  if (misconfigurations.shouldBeSecrets.length > 0) {
    lines.push('## 🔐 Security Warning');
    lines.push('');
    lines.push('**The following values are in VARIABLES but appear sensitive:**');
    lines.push('');
    for (const { name, usages } of misconfigurations.shouldBeSecrets) {
      lines.push(`- **\`${name}\`** - Used in: ${usages.map(u => u.file).join(', ')}`);
    }
    lines.push('');
  }

  // Secrets by category
  lines.push('## Secrets Referenced in Workflows');
  lines.push('');

  const categories = {};
  for (const [name, usages] of workflowSecrets.entries()) {
    const category = categorizeSecret(name);
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({ name, usages });
  }

  const categoryLabels = {
    standard: 'Standard GitHub Secrets',
    frontend: 'Frontend Configuration',
    database: 'Database & Supabase',
    'api-credentials': 'API Keys & Tokens',
    'secrets-manager': 'Secrets Management',
    deployment: 'Deployment Credentials',
    other: 'Other Secrets'
  };

  for (const [category, secrets] of Object.entries(categories)) {
    lines.push(`### ${categoryLabels[category] || category}`);
    lines.push('');
    lines.push('| Secret Name | Status | Used In |');
    lines.push('|-------------|--------|---------|');
    
    for (const { name, usages } of secrets.sort((a, b) => a.name.localeCompare(b.name))) {
      const isStandard = categorizeSecret(name) === 'standard';
      const isConfigured = configuredSecrets ? configuredSecrets.has(name) : null;
      const shouldBeVar = shouldBeVariable(name);
      
      let status = '';
      if (isStandard) {
        status = '🔧 Auto-provided';
      } else if (shouldBeVar) {
        status = '⚠️ Should be variable';
      } else if (isConfigured === true) {
        status = '✅ Configured';
      } else if (isConfigured === false) {
        status = '❌ MISSING';
      } else {
        status = '❓ Unknown';
      }

      const files = usages.map(u => `\`${u.file}\``).join(', ');
      lines.push(`| \`${name}\` | ${status} | ${files} |`);
    }
    lines.push('');
  }

  // Variables
  if (workflowVariables.size > 0) {
    lines.push('## Variables Referenced in Workflows');
    lines.push('');
    lines.push('| Variable Name | Status | Used In |');
    lines.push('|---------------|--------|---------|');
    
    for (const [name, usages] of Array.from(workflowVariables.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const isConfigured = configuredVariables ? configuredVariables.has(name) : null;
      
      let status = '';
      if (isConfigured === true) {
        status = '✅ Configured';
      } else if (isConfigured === false) {
        status = '❌ MISSING';
      } else {
        status = '❓ Unknown';
      }

      const files = usages.map(u => `\`${u.file}\``).join(', ');
      lines.push(`| \`${name}\` | ${status} | ${files} |`);
    }
    lines.push('');
  }

  // Missing secrets
  if (configuredSecrets) {
    const customSecrets = Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) !== 'standard');
    const missingSecrets = customSecrets.filter(s => !configuredSecrets.has(s) && !shouldBeVariable(s));
    
    if (missingSecrets.length > 0) {
      lines.push('## ⚠️ Missing Secrets');
      lines.push('');
      lines.push('The following secrets are referenced in workflows but not configured:');
      lines.push('');
      for (const secret of missingSecrets) {
        const usages = workflowSecrets.get(secret);
        lines.push(`- **\`${secret}\`** - Required by: ${usages.map(u => u.file).join(', ')}`);
      }
      lines.push('');
    }

    // Unused secrets
    const usedSecrets = new Set(customSecrets);
    const unusedSecrets = Array.from(configuredSecrets).filter(s => !usedSecrets.has(s));
    
    if (unusedSecrets.length > 0) {
      lines.push('## 📋 Configured But Unused Secrets');
      lines.push('');
      lines.push('These secrets are configured but not referenced in any workflow:');
      lines.push('');
      for (const secret of unusedSecrets.sort()) {
        lines.push(`- \`${secret}\``);
      }
      lines.push('');
      lines.push('> **Note:** These may be used in production .env files or injected at runtime.');
      lines.push('');
    }
  }

  // Missing variables
  if (configuredVariables && workflowVariables.size > 0) {
    const missingVariables = Array.from(workflowVariables.keys()).filter(v => !configuredVariables.has(v));
    
    if (missingVariables.length > 0) {
      lines.push('## ⚠️ Missing Variables');
      lines.push('');
      lines.push('The following variables are referenced in workflows but not configured:');
      lines.push('');
      for (const variable of missingVariables) {
        const usages = workflowVariables.get(variable);
        lines.push(`- **\`${variable}\`** - Required by: ${usages.map(u => u.file).join(', ')}`);
      }
      lines.push('');
    }
  }

  console.log(lines.join('\n'));
  
  const customSecrets = Array.from(workflowSecrets.keys()).filter(s => categorizeSecret(s) !== 'standard');
  const missingCount = configuredSecrets ? customSecrets.filter(s => !configuredSecrets.has(s) && !shouldBeVariable(s)).length : 0;
  return missingCount + misconfigurations.shouldBeVariables.length;
}

/**
 * Main execution
 */
function main() {
  try {
    // Scan workflows for secret and variable references
    const workflowSecrets = scanWorkflows();
    const workflowVariables = scanVariables();

    // Get configured secrets and variables from GitHub
    const configuredSecrets = getConfiguredSecrets();
    const configuredVariables = getConfiguredVariables();
    
    // Detect misconfigurations
    const misconfigurations = detectMisconfigurations(
      workflowSecrets, 
      workflowVariables, 
      configuredSecrets, 
      configuredVariables
    );

    // Generate report based on format
    let missingCount = 0;
    
    switch (options.format) {
      case 'json':
        missingCount = generateJSONReport(workflowSecrets, configuredSecrets, workflowVariables, configuredVariables, misconfigurations);
        break;
      case 'markdown':
      case 'md':
        missingCount = generateMarkdownReport(workflowSecrets, configuredSecrets, workflowVariables, configuredVariables, misconfigurations);
        break;
      default:
        missingCount = generateTextReport(workflowSecrets, configuredSecrets, workflowVariables, configuredVariables, misconfigurations);
    }

    // Exit with error if check-only mode and missing secrets found or misconfigurations detected
    if (options.checkOnly && (missingCount > 0 || misconfigurations.shouldBeVariables.length > 0)) {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { 
  scanWorkflows, 
  scanVariables,
  getConfiguredSecrets, 
  getConfiguredVariables,
  categorizeSecret,
  shouldBeVariable,
  detectMisconfigurations
};
