/**
 * processAICommand
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Detect phrases like "go to", "open", "show me", "activities", etc. and map to pages
function detectNavigationIntent(prompt = "") {
  const p = (prompt || "").toLowerCase().trim();

  const navVerbs = ["go to", "goto", "open", "show me", "take me to", "navigate to", "bring me to", "view", "see"];
  const hasNavVerb = navVerbs.some(v => p.includes(v));

  // Avoid misfiring on creation/update verbs
  const prohibitedVerbs = ["create", "add", "new ", "schedule", "log ", "update", "make "];
  if (prohibitedVerbs.some(v => p.includes(v))) return null;

  const pageAliases = {
    "dashboard": "Dashboard",
    "home": "Dashboard",

    "contacts": "Contacts",
    "contact": "Contacts",

    "accounts": "Accounts",
    "account": "Accounts",
    "companies": "Accounts",

    "leads": "Leads",
    "lead": "Leads",

    "opportunities": "Opportunities",
    "opportunity": "Opportunities",
    "deals": "Opportunities",

    "activities": "Activities",
    "activity": "Activities",
    "tasks": "Activities",

    "cash flow": "CashFlow",
    "cashflow": "CashFlow",
    "finances": "CashFlow",

    "document processing": "DocumentProcessing",
    "documents": "DocumentProcessing",
    "docs processing": "DocumentProcessing",

    "document management": "DocumentManagement",
    "files": "DocumentManagement",

    "ai campaigns": "AICampaigns",
    "campaigns": "AICampaigns",

    "agent": "Agent",
    "ai agent": "Agent",

    "employees": "Employees",
    "team": "Employees",
    "staff": "Employees",

    "reports": "Reports",
    "analytics": "Reports",

    "integrations": "Integrations",

    "payment portal": "PaymentPortal",
    "payment": "PaymentPortal",
    "billing": "PaymentPortal",

    "settings": "Settings",

    "documentation": "Documentation",
    "docs": "Documentation",
    "help": "Documentation",

    "audit log": "AuditLog",
    "audit": "AuditLog"
  };

  let matchedPage = null;
  for (const key of Object.keys(pageAliases)) {
    if (p.includes(key)) {
      matchedPage = pageAliases[key];
      break;
    }
  }
  if (!matchedPage) return null;

  if (!hasNavVerb) {
    const wc = p.split(/\s+/).filter(Boolean).length;
    if (wc > 3) return null;
  }

  return matchedPage;
}

// Detect "tell me / summarize / list / how many" and pick the target entity + hints
function detectInfoIntent(prompt = '') {
  const p = (prompt || '').toLowerCase();

  const infoVerbs = ['tell me', 'summarize', 'list', 'how many', 'count', 'what are', 'give me', 'show list of'];
  const isInfo = infoVerbs.some(v => p.includes(v));
  if (!isInfo) return null;

  const entityAliases = {
    activity: 'Activity', activities: 'Activity', task: 'Activity', tasks: 'Activity',
    lead: 'Lead', leads: 'Lead',
    contact: 'Contact', contacts: 'Contact',
    account: 'Account', accounts: 'Account', company: 'Account', companies: 'Account',
    opportunity: 'Opportunity', opportunities: 'Opportunity', deal: 'Opportunity', deals: 'Opportunity',
  };

  let entity = null;
  for (const key of Object.keys(entityAliases)) {
    if (p.includes(key)) {
      entity = entityAliases[key];
      break;
    }
  }
  if (!entity) return null;

  const mine = /\b(my|for me|assigned to me|owned by me|mine)\b/.test(p);

  const hints = {
    status: null,
    stage: null,
    openOnly: /\b(open|active|pending|in progress|in-progress)\b/.test(p),
    closedOnly: /\b(closed|completed|done|cancelled|lost|won)\b/.test(p),
    topN: (() => {
      const m = p.match(/\btop\s+(\d+)|last\s+(\d+)|first\s+(\d+)\b/);
      const n = Number((m && (m[1] || m[2] || m[3])) || '');
      return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : null;
    })(),
  };

  const statusMatch = p.match(/completed|cancelled|scheduled|in[-\s]?progress/);
  if (statusMatch) {
    hints.status = statusMatch[0].replace(/\s/g, '-');
  }

  const stageMatch = p.match(/prospecting|qualification|proposal|negotiation|closed[-\s]?won|closed[-\s]?lost/);
  if (stageMatch) {
    hints.stage = stageMatch[0].replace(/\s/g, '_');
  }

  return { entity, mine, hints };
}

// NEW: Function to handle AI agent commands using tools
async function runAgentWithTools(prompt, base44, tenantId, userEmail, userRole, startedAt) {
  const tools = [
    {
      type: "function",
      function: {
        name: "search_leads",
        description: "Search for leads in the CRM by name, company, email, phone, or status. Returns lead details including unique ID, contact info, and current status.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query - can be a name (first, last, or full), company name, email, phone, or status (new, contacted, qualified, etc.)"
            },
            status: {
              type: "string",
              description: "Optional: Filter by status (new, contacted, qualified, unqualified, converted, lost)"
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return (default: 10)"
            }
          },
          required: ["query"]
        }
      }
    },
    // More tools can be added here for other entities/actions if the AI agent is expanded.
  ];

  // In a real scenario, this would involve calling an LLM service (e.g., OpenAI, Google Gemini)
  // with the prompt and the 'tools' defined above. The LLM would then decide which tool to call.
  // For this exercise, we'll simulate the LLM choosing to call 'search_leads' based on prompt heuristics.
  let simulatedToolCall = null;
  const pLower = prompt.toLowerCase();

  // Simple heuristic to trigger search_leads based on common lead search phrases
  if (pLower.includes("search leads") || pLower.includes("find leads") || pLower.includes("look up leads")) {
    let query = "";
    // Attempt to extract a query from the prompt
    const queryMatch = pLower.match(/(search|find|look up) leads (for|named|with) "([^"]+)"/) ||
                       pLower.match(/(search|find|look up) leads (for|named|with) ([a-zA-Z0-9\s.@-]+)/); // Catch words after "for" without quotes
    if (queryMatch) {
      query = queryMatch[3] || queryMatch[4];
    } else {
      // Fallback: if no specific query pattern, just try to use the last significant phrase if it seems like a name/company
      const lastPhraseMatch = pLower.match(/(?:last name|first name|company|email|phone) (?:is|of|for) ([a-zA-Z0-9\s.@-]+)$/);
      if (lastPhraseMatch) query = lastPhraseMatch[1];
      else if (pLower.match(/leads (about|regarding) (.+)/)) query = pLower.match(/leads (about|regarding) (.+)/)[2];
      else { // If nothing specific, just take everything after "leads"
        const genericQueryMatch = pLower.match(/leads\s+(.+)/);
        if (genericQueryMatch) query = genericQueryMatch[1];
      }
    }

    if (query) { // Only simulate tool call if we found a potential query
      const args = { query: query.trim() };

      const statusMatch = pLower.match(/status (new|contacted|qualified|unqualified|converted|lost)/);
      if (statusMatch) args.status = statusMatch[1];

      const limitMatch = pLower.match(/(top|last|first)\s+(\d+)/);
      if (limitMatch) args.limit = parseInt(limitMatch[2]);

      simulatedToolCall = {
        function: {
          name: "search_leads",
          arguments: JSON.stringify(args)
        }
      };
      console.log('[runAgentWithTools] Simulated tool call:', simulatedToolCall);
    }
  }

  if (!simulatedToolCall) {
    return null; // No tool call determined, let other intents handle it
  }

  const toolName = simulatedToolCall.function.name;
  let args;
  try {
    args = JSON.parse(simulatedToolCall.function.arguments);
  } catch (e) {
    console.error(`[runAgentWithTools] Failed to parse tool arguments for ${toolName}:`, simulatedToolCall.function.arguments, e);
    return {
      summaryMessage: `AI encountered an error parsing tool arguments.`,
      intent: "error",
      data: {}
    };
  }

  const tenantFilter = {};
  if (tenantId) tenantFilter.tenant_id = tenantId;

  // Execute the tool
  switch (toolName) {
    case "search_leads": {
      console.log('[processAICommand] Executing search_leads:', args);
      const query = (args.query || '').toLowerCase();
      const statusFilter = args.status?.toLowerCase();
      const limit = args.limit || 10;

      // Build initial filter based on tenant and status
      let filter = { ...tenantFilter };
      if (statusFilter) {
        filter.status = statusFilter;
      }

      console.log('[processAICommand] search_leads filter:', filter);

      // Fetch all leads that match the status and tenant filters.
      // IMPORTANT: If `base44.entities.Lead.filter` supported partial string matching across multiple fields,
      // it would be more efficient to push the query directly to the database.
      // Assuming it does not, we fetch by tenant/status and then filter in-memory for the `query`.
      const allLeads = await base44.entities.Lead.filter(filter);
      console.log('[processAICommand] search_leads found', allLeads.length, 'leads before search');

      // IMPROVED: Search across multiple fields with partial matching
      const matchedLeads = allLeads.filter(lead => {
        const firstName = (lead.first_name || '').toLowerCase();
        const lastName = (lead.last_name || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        const company = (lead.company || '').toLowerCase();
        const email = (lead.email || '').toLowerCase();
        const phone = (lead.phone || '').toLowerCase();
        const status = (lead.status || '').toLowerCase();

        // Check if query (partial match) is present in any relevant field
        return firstName.includes(query) ||
               lastName.includes(query) ||
               fullName.includes(query) ||
               company.includes(query) ||
               email.includes(query) ||
               phone.includes(query) ||
               status.includes(query);
      }).slice(0, limit);

      console.log('[processAICommand] search_leads matched', matchedLeads.length, 'leads');

      const leadResults = matchedLeads.map(lead => ({
        id: lead.id,
        unique_id: lead.unique_id,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        first_name: lead.first_name,
        last_name: lead.last_name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        score: lead.score,
        source: lead.source,
        assigned_to: lead.assigned_to
      }));

      const summaryMessage = leadResults.length > 0
        ? `Found ${leadResults.length} leads matching your criteria:\n${leadResults.map(l => `• ${l.name} (${l.company || 'N/A'}) - ${l.status}`).join('\n')}`
        : `No leads found matching "${query}" with status "${statusFilter || 'any'}".`;

      return {
        summaryMessage: summaryMessage,
        intent: 'query', // Generic 'query' intent for data retrieval
        data: {
          entity: 'Lead',
          count: leadResults.length,
          records: leadResults
        },
        uiActions: leadResults.slice(0, Math.min(leadResults.length, 5)).map((r) => ({
          action: 'viewDetails',
          entityType: 'Lead',
          record: r
        })),
        // meta will be added by the main Deno.serve handler
      };
    }
    default:
      return {
        summaryMessage: `AI identified an unsupported tool: ${toolName}.`,
        intent: "error",
        data: {}
      };
  }
}


Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const prompt = (payload && payload.prompt ? String(payload.prompt) : '').trim();
    const tenantId = (payload && payload.tenantId) || user.tenant_id || null;
    const userEmail = (payload && payload.userEmail) || user.email || null;
    const userRole = user.role || 'user';

    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }
    if (!userEmail) {
      return Response.json({ error: 'Missing userEmail' }, { status: 400 });
    }

    // 1) Navigation intent (simple heuristic, prioritize first)
    const navPage = detectNavigationIntent(prompt);
    if (navPage) {
      return Response.json({
        summaryMessage: `Navigating to ${navPage}.`,
        intent: 'navigate',
        data: {},
        uiActions: [{ action: 'navigate', pageName: navPage }],
        meta: { duration_ms: Date.now() - startedAt, userEmail, tenantId }
      }, { status: 200 });
    }

    // 2) NEW: AI Agent tool-calling capabilities (more complex queries)
    // Superadmins need to select a tenant for data-specific queries by the AI agent.
    // If agent needs tenant context, ensure it's provided.
    if (userRole === 'superadmin' && !tenantId) {
      return Response.json({
        summaryMessage: "Please select a client first to scope your AI query.",
        intent: "help",
        data: {},
        uiActions: [{ action: "notify", level: "warning", message: "Select a client in the header, then try again." }],
        meta: { duration_ms: Date.now() - startedAt, userEmail, tenantId: null }
      }, { status: 200 });
    }

    const agentResult = await runAgentWithTools(prompt, base44, tenantId, userEmail, userRole, startedAt);
    if (agentResult) { // If agent successfully processed a tool call and returned a result
      return Response.json({
        ...agentResult,
        meta: {
          duration_ms: Date.now() - startedAt,
          userEmail,
          tenantId: tenantId || null
        }
      }, { status: 200 });
    }

    // 3) Fallback to existing Info/query intent (heuristic, for non-tool-calling queries)
    const info = detectInfoIntent(prompt);
    if (info) {
      // Existing superadmin tenant check for InfoIntent
      if (!tenantId && userRole === 'superadmin') {
        return Response.json({
          summaryMessage: "Please select a client first to scope your AI query.",
          intent: "help",
          data: {},
          uiActions: [{ action: "notify", level: "warning", message: "Select a client in the header, then try again." }],
          meta: { duration_ms: Date.now() - startedAt, userEmail, tenantId: null }
        }, { status: 200 });
      }

      const entity = info.entity;
      const mine = info.mine;
      const hints = info.hints;
      const limit = hints.topN || 5;

      const filter = {};
      if (tenantId) filter.tenant_id = tenantId;
      if (mine && ['Activity', 'Lead', 'Opportunity', 'Account', 'Contact'].includes(entity)) {
        filter.assigned_to = userEmail;
      }

      if (entity === 'Activity') {
        if (hints.status) filter.status = hints.status;
        else if (hints.openOnly) filter.status = { $in: ['scheduled', 'in-progress'] };
        else if (hints.closedOnly) filter.status = { $in: ['completed', 'cancelled'] };
      }
      if (entity === 'Opportunity') {
        if (hints.stage) filter.stage = hints.stage;
        else if (hints.openOnly) filter.stage = { $nin: ['closed_won', 'closed_lost'] };
        else if (hints.closedOnly) filter.stage = { $in: ['closed_won', 'closed_lost'] };
      }
      if (entity === 'Lead') {
        // NOTE: The new 'search_leads' tool is generally better for lead queries.
        // This block handles simpler 'list my open leads' type queries not caught by the agent.
        if (hints.openOnly) filter.status = { $in: ['new', 'contacted', 'qualified'] };
        if (hints.closedOnly) filter.status = { $in: ['unqualified', 'converted', 'lost'] };
      }

      const models = {
        Activity: base44.entities.Activity,
        Lead: base44.entities.Lead,
        Contact: base44.entities.Contact,
        Account: base44.entities.Account,
        Opportunity: base44.entities.Opportunity
      };
      const model = models[entity];
      if (!model) {
        return Response.json({ error: `Unsupported entity: ${entity}` }, { status: 400 });
      }

      const order = entity === 'Opportunity' ? '-updated_date' : '-created_date';
      const items = await model.filter(filter, order, limit + 5);
      const top = Array.isArray(items) ? items.slice(0, limit) : [];

      const formatters = {
        Activity: (a) => `• ${a.subject || 'No subject'} — ${a.type || 'activity'}, ${a.status || 'status'}${a.due_date ? `, due ${a.due_date}${a.due_time ? ' ' + a.due_time : ''}` : ''}`,
        Lead: (l) => `• ${(l.first_name || '')} ${(l.last_name || '')} ${(l.company ? ' @ ' + l.company : '')} — ${l.status || ''}`.trim(),
        Contact: (c) => `• ${(c.first_name || '')} ${(c.last_name || '')}${c.email ? ' <' + c.email + '>' : ''}`.trim(),
        Account: (a) => `• ${a.name || 'Account'}${a.type ? ' — ' + a.type : ''}`,
        Opportunity: (o) => {
          const amt = o.amount ? `, $${Number(o.amount).toLocaleString()}` : '';
          const close = o.close_date ? `, close ${o.close_date}` : '';
          return `• ${o.name || 'Opportunity'} — ${o.stage || ''}${amt}${close}`;
        }
      };

      const lines = top.map((r) => formatters[entity](r));
      const scopeText = mine ? 'your' : 'the';
      const qualifier = hints.openOnly ? 'open ' : (hints.closedOnly ? 'closed ' : '');
      const header = top.length
        ? `Here ${top.length === 1 ? 'is' : 'are'} ${top.length} ${qualifier}${entity.toLowerCase()} record${top.length === 1 ? '' : 's'} from ${scopeText} ${entity.toLowerCase()}s:`
        : `I couldn't find ${qualifier}${scopeText} ${entity.toLowerCase()}s that match your request.`;

      return Response.json({
        summaryMessage: top.length ? `${header}\n\n${lines.join('\n')}` : header,
        intent: 'query',
        data: { entity, count: top.length, records: top },
        uiActions: top.slice(0, Math.min(top.length, 5)).map((r) => ({
          action: 'viewDetails',
          entityType: entity,
          record: r
        })),
        meta: { duration_ms: Date.now() - startedAt, userEmail, tenantId: tenantId || null }
      }, { status: 200 });
    }

    // 4) Fallback help if no intent was matched
    return Response.json({
      summaryMessage: "I can navigate or summarize tenant-scoped CRM data, or search for leads. Try: 'List my open activities today', 'Summarize open opportunities', or 'Search leads for John Doe'.",
      intent: 'help',
      data: {}
    }, { status: 200 });

  } catch (error) {
    console.error('Error in Deno handler:', error);
    return Response.json({ error: (error && error.message) || 'Internal error' }, { status: 500 });
  }
});


----------------------------

export default processAICommand;
