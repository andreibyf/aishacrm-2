/**
 * GitHub Issue Creator - Autonomous issue creation from health monitoring
 * Creates issues with AI-generated diagnostics and triggers Copilot review
 */

import { BACKEND_URL } from '../api/entities';

/**
 * Create a GitHub issue for health monitoring failures
 * @param {Object} params - Issue parameters
 * @param {string} params.type - 'api' | 'mcp' | 'system'
 * @param {string} params.title - Issue title
 * @param {string} params.description - Problem description
 * @param {Object} params.context - Diagnostic context
 * @param {string} params.suggestedFix - AI-generated fix suggestion
 * @param {string} params.severity - 'critical' | 'high' | 'medium' | 'low'
 * @param {string} params.component - Component name (e.g., 'backend', 'mcp-server')
 * @param {boolean} params.assignCopilot - Whether to trigger Copilot review
 * @returns {Promise<Object>} Created issue details
 */
export async function createHealthIssue({
  type,
  title,
  description,
  context,
  suggestedFix,
  severity = 'medium',
  component,
  assignCopilot = true
}) {
  try {
    // Create the issue
    const response = await fetch(`${BACKEND_URL}/api/github-issues/create-health-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type,
        title,
        description,
        context,
        suggestedFix,
        severity,
        component
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create GitHub issue');
    }

    const result = await response.json();
    
    // Optionally assign Copilot for automated fix
    if (assignCopilot && result.success) {
      await assignCopilotToIssue(result.issue.number);
    }

    return result;
  } catch (error) {
    console.error('[GitHub Issue Creator] Error:', error);
    throw error;
  }
}

/**
 * Assign GitHub Copilot to review and fix an issue
 * @param {number} issueNumber - GitHub issue number
 * @param {string} additionalContext - Optional additional context
 * @returns {Promise<Object>} Comment details
 */
export async function assignCopilotToIssue(issueNumber, additionalContext) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/github-issues/assign-copilot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        issueNumber,
        additionalContext
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to assign Copilot');
    }

    return await response.json();
  } catch (error) {
    console.error('[GitHub Issue Creator] Error assigning Copilot:', error);
    throw error;
  }
}

/**
 * Generate suggested fix for API endpoint errors
 * @param {Object} error - Error details
 * @returns {string} Suggested fix markdown
 */
export function generateAPIFixSuggestion(error) {
  const { endpoint, errorInfo } = error;
  
  let fix = `### Suggested Fix\n\n`;
  
  if (errorInfo.type === '404') {
    fix += `**Missing Endpoint**: \`${endpoint}\`\n\n`;
    fix += `1. Create route handler in appropriate file (e.g., \`backend/routes/${inferRouteFile(endpoint)}\`)\n`;
    fix += `2. Add route registration in \`backend/server.js\`:\n`;
    fix += `\`\`\`javascript\n`;
    fix += `import create${inferRouteName(endpoint)}Routes from "./routes/${inferRouteFile(endpoint)}";\n`;
    fix += `app.use("/api/${inferRouteBase(endpoint)}", create${inferRouteName(endpoint)}Routes(measuredPgPool));\n`;
    fix += `\`\`\`\n\n`;
    fix += `3. Implement endpoint handler with tenant validation:\n`;
    fix += `\`\`\`javascript\n`;
    fix += `router.get('${inferRoutePath(endpoint)}', async (req, res) => {\n`;
    fix += `  try {\n`;
    fix += `    const { tenant_id } = req.query;\n`;
    fix += `    // Implementation here\n`;
    fix += `    res.json({ success: true, data: [] });\n`;
    fix += `  } catch (error) {\n`;
    fix += `    res.status(500).json({ error: error.message });\n`;
    fix += `  }\n`;
    fix += `});\n`;
    fix += `\`\`\`\n`;
  } else if (errorInfo.type === '500') {
    fix += `**Server Error**: \`${endpoint}\`\n\n`;
    fix += `1. Check server logs for stack trace\n`;
    fix += `2. Verify database connection and query syntax\n`;
    fix += `3. Add error handling:\n`;
    fix += `\`\`\`javascript\n`;
    fix += `try {\n`;
    fix += `  // Existing code\n`;
    fix += `} catch (error) {\n`;
    fix += `  console.error('[Route] Error:', error);\n`;
    fix += `  res.status(500).json({ error: 'Internal server error', details: error.message });\n`;
    fix += `}\n`;
    fix += `\`\`\`\n`;
  } else if (errorInfo.type === '403') {
    fix += `**Authorization Error**: \`${endpoint}\`\n\n`;
    fix += `1. Check tenant access validation\n`;
    fix += `2. Verify RLS policies in database\n`;
    fix += `3. Add middleware:\n`;
    fix += `\`\`\`javascript\n`;
    fix += `import { validateTenantAccess } from '../middleware/tenantValidation.js';\n`;
    fix += `router.get('...', validateTenantAccess, async (req, res) => { ... });\n`;
    fix += `\`\`\`\n`;
  }
  
  return fix;
}

/**
 * Generate suggested fix for MCP adapter errors
 * @param {Object} test - Test details
 * @returns {string} Suggested fix markdown
 */
export function generateMCPFixSuggestion(test) {
  const { name, error } = test;
  
  let fix = `### Suggested Fix\n\n`;
  
  if (error?.includes('token') || error?.includes('API key')) {
    fix += `**Missing Credentials**: ${name}\n\n`;
    fix += `1. Add environment variable to \`braid-mcp-node-server/.env\`:\n`;
    fix += `\`\`\`bash\n`;
    if (name.includes('GitHub')) {
      fix += `GITHUB_TOKEN=ghp_your_github_personal_access_token\n`;
    } else if (name.includes('LLM')) {
      fix += `OPENAI_API_KEY=sk-your_openai_api_key\n`;
    }
    fix += `\`\`\`\n\n`;
    fix += `2. Restart MCP server:\n`;
    fix += `\`\`\`bash\n`;
    fix += `docker-compose restart braid-mcp-node-server\n`;
    fix += `\`\`\`\n`;
  } else if (error?.includes('Redis') || error?.includes('ECONNREFUSED')) {
    fix += `**Redis Connection**: ${name}\n\n`;
    fix += `1. Verify Redis container is running:\n`;
    fix += `\`\`\`bash\n`;
    fix += `docker ps | grep redis\n`;
    fix += `\`\`\`\n\n`;
    fix += `2. Check Redis connection string in \`.env\`:\n`;
    fix += `\`\`\`bash\n`;
    fix += `REDIS_URL=redis://redis:6379\n`;
    fix += `\`\`\`\n\n`;
    fix += `3. Test connection:\n`;
    fix += `\`\`\`bash\n`;
    fix += `docker exec -it aishacrm-redis redis-cli ping\n`;
    fix += `\`\`\`\n`;
  } else {
    fix += `**Adapter Error**: ${name}\n\n`;
    fix += `1. Check adapter implementation in \`braid-mcp-node-server/src/braid/adapters/\`\n`;
    fix += `2. Verify payload structure matches adapter requirements\n`;
    fix += `3. Review MCP server logs:\n`;
    fix += `\`\`\`bash\n`;
    fix += `docker logs braid-mcp-node-server\n`;
    fix += `\`\`\`\n`;
  }
  
  return fix;
}

// Helper functions to infer route details from endpoint path
function inferRouteFile(endpoint) {
  const parts = endpoint.replace('/api/', '').split('/');
  return parts[0] + '.js';
}

function inferRouteName(endpoint) {
  const parts = endpoint.replace('/api/', '').split('/');
  const name = parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function inferRouteBase(endpoint) {
  const parts = endpoint.replace('/api/', '').split('/');
  return parts[0];
}

function inferRoutePath(endpoint) {
  const parts = endpoint.replace('/api/', '').split('/');
  return '/' + parts.slice(1).join('/');
}
