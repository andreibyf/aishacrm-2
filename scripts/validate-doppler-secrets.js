#!/usr/bin/env node

/**
 * Doppler Secrets Validation Script for MCP Server
 * 
 * Validates that all required secrets are present in Doppler for the MCP server.
 * 
 * Usage:
 *   node scripts/validate-doppler-secrets.js [options]
 * 
 * Options:
 *   --project <name>   Doppler project name (default: aishacrm)
 *   --config <env>     Doppler config (default: dev)
 *   --fix              Interactive mode to add missing secrets
 *   --help             Show this help message
 * 
 * Exit codes:
 *   0 - All secrets present
 *   1 - One or more secrets missing
 */

import { execSync } from 'child_process';
import readline from 'readline';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Required secrets for MCP server
const REQUIRED_SECRETS = [
  { name: 'SUPABASE_URL', description: 'Supabase project URL' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase service role key' },
  { name: 'SUPABASE_ANON_KEY', description: 'Supabase anonymous key' },
  { name: 'OPENAI_API_KEY', description: 'OpenAI API key for LLM operations' },
  { name: 'DEFAULT_OPENAI_MODEL', description: 'Default OpenAI model to use' },
  { name: 'DEFAULT_TENANT_ID', description: 'Default tenant ID for operations' },
  { name: 'JWT_SECRET', description: 'JWT secret for signing internal service tokens (must match backend)' }
];

// Optional secrets (warn if missing, but don't fail)
const OPTIONAL_SECRETS = [
  { name: 'CRM_BACKEND_URL', description: 'CRM backend URL (can be overridden in docker-compose)' },
  { name: 'GITHUB_TOKEN', description: 'GitHub token for repository operations' },
  { name: 'GH_TOKEN', description: 'GitHub token (alternative)' }
];

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    project: 'aishacrm',
    config: 'dev',
    fix: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--project':
        options.project = args[++i];
        break;
      case '--config':
        options.config = args[++i];
        break;
      case '--fix':
        options.fix = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
${colors.cyan}Doppler Secrets Validation Script for MCP Server${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node scripts/validate-doppler-secrets.js [options]

${colors.yellow}Options:${colors.reset}
  --project <name>   Doppler project name (default: aishacrm)
  --config <env>     Doppler config (default: dev)
  --fix              Interactive mode to add missing secrets
  --help, -h         Show this help message

${colors.yellow}Examples:${colors.reset}
  # Validate dev environment
  node scripts/validate-doppler-secrets.js

  # Validate production environment
  node scripts/validate-doppler-secrets.js --config prd

  # Interactive mode to add missing secrets
  node scripts/validate-doppler-secrets.js --fix

${colors.yellow}Required Secrets:${colors.reset}
${REQUIRED_SECRETS.map(s => `  - ${s.name}: ${s.description}`).join('\n')}

${colors.yellow}Exit Codes:${colors.reset}
  0 - All required secrets present
  1 - One or more required secrets missing
`);
}

// Check if Doppler CLI is installed
function checkDopplerCLI() {
  try {
    execSync('doppler --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Check if DOPPLER_TOKEN is set
function checkDopplerToken() {
  return !!process.env.DOPPLER_TOKEN;
}

// Escape shell arguments to prevent command injection
function escapeShellArg(arg) {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Get all secrets from Doppler
function getDopplerSecrets(project, config) {
  try {
    const token = process.env.DOPPLER_TOKEN;
    if (!token) {
      throw new Error('DOPPLER_TOKEN not set in environment');
    }

    // Use proper shell escaping to prevent command injection
    const cmd = `doppler secrets download --no-file --format json --token ${escapeShellArg(token)} --project ${escapeShellArg(project)} --config ${escapeShellArg(config)}`;
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to fetch secrets from Doppler: ${error.message}`);
  }
}

// Mask secret value for display
function maskSecret(value) {
  if (!value) return '*****';
  // Show first 4 chars for secrets 8+ chars, otherwise just show asterisks
  if (value.length >= 8) {
    return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 4, 20));
  }
  return '*****'; // Don't expose short secrets
}

// Validate secrets
function validateSecrets(secrets, required = true) {
  const secretList = required ? REQUIRED_SECRETS : OPTIONAL_SECRETS;
  const results = [];
  let missingCount = 0;

  for (const secret of secretList) {
    const value = secrets[secret.name];
    const present = !!value;
    
    if (!present && required) {
      missingCount++;
    }

    results.push({
      name: secret.name,
      description: secret.description,
      present,
      maskedValue: present ? maskSecret(value) : null
    });
  }

  return { results, missingCount };
}

// Display validation results
function displayResults(results, title, required = true) {
  console.log(`\n${colors.yellow}${title}:${colors.reset}`);
  
  for (const result of results) {
    const status = result.present 
      ? `${colors.green}✓${colors.reset}` 
      : `${colors.red}✗${colors.reset}`;
    
    const value = result.present 
      ? `${colors.gray}(${result.maskedValue})${colors.reset}`
      : `${colors.red}(missing)${colors.reset}`;
    
    console.log(`${status} ${result.name} ${value}`);
  }
}

// Prompt user for secret value
async function promptForSecret(secretName, description) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\nEnter value for ${colors.cyan}${secretName}${colors.reset} (${description}):\n> `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Add secret to Doppler
function addSecretToDoppler(project, config, name, value) {
  try {
    const token = process.env.DOPPLER_TOKEN;
    // Use proper shell escaping to prevent command injection
    const cmd = `doppler secrets set ${escapeShellArg(name)}=${escapeShellArg(value)} --token ${escapeShellArg(token)} --project ${escapeShellArg(project)} --config ${escapeShellArg(config)}`;
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error(`${colors.red}Failed to add secret: ${error.message}${colors.reset}`);
    return false;
  }
}

// Interactive mode to fix missing secrets
async function interactiveFix(missingSecrets, project, config) {
  console.log(`\n${colors.yellow}Interactive mode: Add missing secrets${colors.reset}`);
  console.log(`${colors.gray}Press Ctrl+C to cancel at any time${colors.reset}\n`);

  for (const secret of missingSecrets) {
    const value = await promptForSecret(secret.name, secret.description);
    
    if (!value) {
      console.log(`${colors.yellow}Skipped ${secret.name}${colors.reset}`);
      continue;
    }

    console.log(`Adding ${secret.name} to Doppler...`);
    const success = addSecretToDoppler(project, config, secret.name, value);
    
    if (success) {
      console.log(`${colors.green}✓ Added ${secret.name}${colors.reset}`);
    }
  }
}

// Main function
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`\n${colors.cyan}🔍 Validating Doppler secrets for MCP server...${colors.reset}\n`);
  console.log(`${colors.blue}Project:${colors.reset} ${options.project}`);
  console.log(`${colors.blue}Config:${colors.reset} ${options.config}`);

  // Check Doppler CLI
  if (!checkDopplerCLI()) {
    console.error(`\n${colors.red}❌ Doppler CLI not found${colors.reset}`);
    console.error(`${colors.yellow}Install it from: https://docs.doppler.com/docs/install-cli${colors.reset}`);
    process.exit(1);
  }

  // Check DOPPLER_TOKEN
  if (!checkDopplerToken()) {
    console.error(`\n${colors.red}❌ DOPPLER_TOKEN not set in environment${colors.reset}`);
    console.error(`${colors.yellow}Set it with: export DOPPLER_TOKEN=your_token${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ DOPPLER_TOKEN set${colors.reset}`);

  // Fetch secrets from Doppler
  let secrets;
  try {
    secrets = getDopplerSecrets(options.project, options.config);
  } catch (error) {
    console.error(`\n${colors.red}❌ ${error.message}${colors.reset}`);
    process.exit(1);
  }

  // Validate required secrets
  const { results: requiredResults, missingCount } = validateSecrets(secrets, true);
  displayResults(requiredResults, 'Required Secrets', true);

  // Validate optional secrets
  const { results: optionalResults } = validateSecrets(secrets, false);
  displayResults(optionalResults, 'Optional Secrets', false);

  // Summary
  console.log('');
  if (missingCount === 0) {
    console.log(`${colors.green}✅ All required secrets are configured!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ ${missingCount} required secret(s) missing.${colors.reset}`);
    
    if (options.fix) {
      const missingSecrets = requiredResults.filter(r => !r.present);
      await interactiveFix(missingSecrets, options.project, options.config);
      
      console.log(`\n${colors.cyan}Re-validating secrets...${colors.reset}`);
      secrets = getDopplerSecrets(options.project, options.config);
      const { missingCount: newMissingCount } = validateSecrets(secrets, true);
      
      if (newMissingCount === 0) {
        console.log(`${colors.green}✅ All required secrets are now configured!${colors.reset}`);
        process.exit(0);
      } else {
        console.log(`${colors.red}❌ ${newMissingCount} secret(s) still missing.${colors.reset}`);
        process.exit(1);
      }
    } else {
      console.log(`${colors.yellow}Run with --fix to add missing secrets interactively.${colors.reset}`);
      process.exit(1);
    }
  }
}

// Run main function
main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
