/**
 * Braid AI Integration Module
 * Post-tool summarization for better LLM data comprehension
 */

/**
 * Enhanced system prompt with explicit field guidance (matches actual database schema)
 */
export const BRAID_SYSTEM_PROMPT = `
You are an AI assistant with access to CRM data through Braid-powered tools.

**Data Structure Guide (CRITICAL - Read Carefully):**
- Accounts: {id, name, annual_revenue, industry, website, email, phone, assigned_to, tenant_id, metadata (JSONB), created_at, updated_at}
- Leads: {id, first_name, last_name, email, company, status, source, phone, job_title, assigned_to, tenant_id, metadata (JSONB), created_at}
- Contacts: {id, first_name, last_name, email, phone, job_title, account_id, assigned_to, tenant_id, metadata (JSONB), created_at, updated_at}
- Opportunities: {id, name, description, amount, stage, probability, close_date, account_id, contact_id, assigned_to, tenant_id, metadata (JSONB), created_at, updated_at}
- Activities: {id, type, subject, body, status, due_date, assigned_to, tenant_id, metadata (JSONB), created_at}

**When analyzing accounts:**
1. Revenue data is in annual_revenue (top-level NUMBER field, NOT in metadata)
2. Industry classification is in industry (top-level TEXT field)
3. Additional flexible data may be in metadata (JSONB)
4. Assignment is in assigned_to (employee/user email string)

**When analyzing revenue:**
- Sum the annual_revenue field across accounts
- annual_revenue is a numeric value, may be null
- Example: account.annual_revenue = 1500000 means $1.5M

**Best Practices:**
- Always use fetch_tenant_snapshot before answering data questions
- Check both the raw data AND the summarization provided after tool execution
- For revenue analysis, sum annual_revenue field (NOT metadata.revenue_actual)
- When creating/updating records, validate inputs before API calls
- All operations are tenant-isolated - you can only access current tenant's data

**Error Handling:**
- Braid tools return Result<T,E> types
- Check result.tag === 'Ok' for success, 'Err' for failure
- Common errors: ValidationError, NotFound, PermissionDenied, NetworkError
`;

/**
 * Post-tool summarization layer to help LLM parse data
 * @param {Object} result - Tool execution result
 * @param {string} toolName - Name of executed tool
 * @returns {string} Human-readable summary
 */
export function summarizeToolResult(result, toolName) {
  if (!result || typeof result !== 'object') {
    return `${toolName} returned: ${String(result)}`;
  }
  
  // Handle Braid Result<T,E> type
  if (result.tag === 'Err') {
    return `Error executing ${toolName}: ${result.error?.message || JSON.stringify(result.error)}`;
  }
  
  const data = result.tag === 'Ok' ? result.value : result;
  
  // Snapshot-specific summarization
  if (toolName === 'fetch_tenant_snapshot' && data.accounts) {
    const accountCount = data.accounts.length;
    const totalRevenue = data.accounts.reduce((sum, acc) => 
      sum + (acc.annual_revenue || 0), 0
    );
    
    let summary = `Snapshot loaded: ${accountCount} accounts found. `;
    
    if (accountCount > 0) {
      const sampleAccount = data.accounts[0];
      const fields = Object.keys(sampleAccount);
      summary += `Fields available: ${fields.join(', ')}. `;
      summary += `Total revenue across all accounts: $${totalRevenue.toLocaleString()}. `;
      
      // Top accounts by revenue
      const topAccounts = [...data.accounts]
        .filter(a => a.annual_revenue > 0)
        .sort((a, b) => (b.annual_revenue || 0) - (a.annual_revenue || 0))
        .slice(0, 3);
      
      if (topAccounts.length > 0) {
        summary += `Top accounts by revenue: ${topAccounts.map(a => 
          `${a.name} ($${(a.annual_revenue || 0).toLocaleString()})`
        ).join(', ')}. `;
      }
    }
    
    summary += `Leads: ${data.leads?.length || 0}, Contacts: ${data.contacts?.length || 0}, Opportunities: ${data.opportunities?.length || 0}.`;
    return summary;
  }
  
  // Generic summarization
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return `${toolName} returned empty object`;
    }
    return `${toolName} result with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
  }
  
  return `${toolName} result: ${data}`;
}
