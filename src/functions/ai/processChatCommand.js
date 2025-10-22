/**
 * processChatCommand
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

function getEffectiveTenantFilter(user, selectedTenantId) {
  if ((user?.role === 'superadmin' || user?.role === 'admin') && selectedTenantId) {
    return { tenant_id: selectedTenantId };
  }
  if (user?.tenant_id) {
    return { tenant_id: user.tenant_id };
  }
  return {};
}

function includesAny(str, arr) {
  return arr.some((k) => str.includes(k));
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9@.\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function contactMatchScore(promptLower, c) {
  // Score by name/email presence in the prompt
  const first = normalize(c.first_name);
  const last = normalize(c.last_name);
  const full = `${first} ${last}`.trim();
  const email = normalize(c.email);

  let score = 0;
  if (full && promptLower.includes(full)) score += 5;
  if (first && promptLower.includes(first)) score += 2;
  if (last && promptLower.includes(last)) score += 2;
  if (email && promptLower.includes(email)) score += 3;

  // Tiny boost if initials pattern like "Mark T" occurs
  if (first && last && promptLower.includes(`${first} ${last.charAt(0)}`)) score += 1;

  return score;
}

// Lead scoring
const leadMatchScore = (promptLower, l) => {
  const first = normalize(l.first_name);
  const last = normalize(l.last_name);
  const full = `${first} ${last}`.trim();
  const email = normalize(l.email);
  const company = normalize(l.company);
  let score = 0;
  if (full && promptLower.includes(full)) score += 6;
  if (first && promptLower.includes(first)) score += 3;
  if (last && promptLower.includes(last)) score += 3;
  if (email && promptLower.includes(email)) score += 2;
  if (company && promptLower.includes(company)) score += 1;
  if (first && last && promptLower.includes(`${first} ${last.charAt(0)}`)) score += 1;
  return score;
};

// Extract explicit person name from raw text
const extractExplicitName = (raw) => {
  const patterns = [
    /\b(?:called|named|name is|is)\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3})/,
    /\bfor\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3})/ // "phone for Mark Twain"
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
};

// Guess "First Last" from raw
const guessPersonName = (raw) => {
  const m = raw.match(/([A-Z][a-zA-Z.'-]+)\s+([A-Z][a-zA-Z.'-]+)/);
  return m ? `${m[1]} ${m[2]}` : null;
};

// Gated online search: require both a search verb and a web keyword
const shouldSearchOnline = (promptLower) => {
  const actionWords = ['search', 'find', 'lookup', 'look up', 'research', 'google', 'check'];
  const webWords = ['online', 'internet', 'web', 'google'];
  const hasAction = actionWords.some((w) => promptLower.includes(w));
  const hasWeb = webWords.some((w) => promptLower.includes(w));
  return hasAction && hasWeb;
};

// Add lightweight filter intent parsing and navigation action

// Map page synonyms
const pageSynonymsMap = [
  { page: 'Activities', synonyms: ['activities', 'activity', 'tasks', 'calls', 'meetings', 'emails'] },
  { page: 'Leads', synonyms: ['leads', 'lead'] },
  { page: 'Contacts', synonyms: ['contacts', 'contact'] },
  { page: 'Accounts', synonyms: ['accounts', 'account', 'companies', 'customers'] },
  { page: 'Opportunities', synonyms: ['opportunities', 'opportunity', 'deals', 'pipeline', 'opps'] },
];

// Detect page by keywords in prompt
const detectTargetPage = (promptLower) => {
  for (const item of pageSynonymsMap) {
    if (item.synonyms.some(s => promptLower.includes(s))) return item.page;
  }
  return null;
};

// Extract simple filters from natural language
const extractFilters = (promptLower, page) => {
  const qp = new URLSearchParams();

  // "my" => assigned=me for every page that supports assignment
  if (/\bmy\b/.test(promptLower) || /\bfor me\b/.test(promptLower)) {
    qp.set('assigned', 'me');
  }

  // Common search term capture: after "show me", "find", "search", use as q
  const qMatch = promptLower.match(/\b(?:search|find|look up|show(?: me)?)\s+(?:for\s+)?(.+?)$/);
  if (qMatch && qMatch[1]) {
    const qv = qMatch[1].trim();
    if (qv && qv.length > 2) qp.set('q', qv);
  }

  if (page === 'Activities') {
    if (promptLower.includes('overdue')) qp.set('status', 'overdue');
    else if (promptLower.includes('scheduled')) qp.set('status', 'scheduled');
    else if (promptLower.includes('in progress') || promptLower.includes('in-progress')) qp.set('status', 'in-progress');
    else if (promptLower.includes('completed') || promptLower.includes('done')) qp.set('status', 'completed');
    else if (promptLower.includes('cancelled') || promptLower.includes('canceled')) qp.set('status', 'cancelled');

    if (promptLower.includes('call')) qp.set('type', 'call');
    else if (promptLower.includes('email')) qp.set('type', 'email');
    else if (promptLower.includes('meeting')) qp.set('type', 'meeting');
    else if (promptLower.includes('task')) qp.set('type', 'task');

    if (promptLower.includes('high priority')) qp.set('priority', 'high');
    else if (promptLower.includes('urgent')) qp.set('priority', 'urgent');
    else if (promptLower.includes('low priority')) qp.set('priority', 'low');
    else if (promptLower.includes('normal priority')) qp.set('priority', 'normal');

    if (promptLower.includes('card view') || promptLower.includes('cards')) qp.set('view', 'cards');
    if (promptLower.includes('table view') || promptLower.includes('table')) qp.set('view', 'table');
  }

  if (page === 'Leads') {
    if (promptLower.includes('new')) qp.set('status', 'new');
    else if (promptLower.includes('contacted')) qp.set('status', 'contacted');
    else if (promptLower.includes('qualified')) qp.set('status', 'qualified');
    else if (promptLower.includes('unqualified')) qp.set('status', 'unqualified');
    else if (promptLower.includes('converted')) qp.set('status', 'converted');
    else if (promptLower.includes('lost')) qp.set('status', 'lost');
  }

  if (page === 'Contacts') {
    if (promptLower.includes('active')) qp.set('status', 'active');
    else if (promptLower.includes('inactive')) qp.set('status', 'inactive');
    else if (promptLower.includes('prospect')) qp.set('status', 'prospect');
    else if (promptLower.includes('customer')) qp.set('status', 'customer');
  }

  if (page === 'Accounts') {
    if (promptLower.includes('prospect')) qp.set('type', 'prospect');
    else if (promptLower.includes('customer')) qp.set('type', 'customer');
    else if (promptLower.includes('partner')) qp.set('type', 'partner');
    else if (promptLower.includes('competitor')) qp.set('type', 'competitor');
    else if (promptLower.includes('vendor')) qp.set('type', 'vendor');
  }

  if (page === 'Opportunities') {
    if (promptLower.includes('prospecting')) qp.set('stage', 'prospecting');
    else if (promptLower.includes('qualification')) qp.set('stage', 'qualification');
    else if (promptLower.includes('proposal')) qp.set('stage', 'proposal');
    else if (promptLower.includes('negotiation')) qp.set('stage', 'negotiation');
    else if (promptLower.includes('closed won') || promptLower.includes('won')) qp.set('stage', 'closed_won');
    else if (promptLower.includes('closed lost') || promptLower.includes('lost')) qp.set('stage', 'closed_lost');
  }

  return qp;
};

Deno.serve(async (req) => {
  const startTime = Date.now();
  let base44 = null;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Helper to log and return consistently to populate AI Execution Logs
    const logAndReturn = async (logStatus, responseObj, httpStatus = 200) => {
      const duration = Date.now() - startTime;
      try {
        await base44.entities.PerformanceLog.create({
          function_name: "processAICommand",
          response_time_ms: duration,
          status: logStatus,
          payload: {
            prompt: String(body?.prompt || "").trim(), // Use the raw prompt from the original request body
            selectedTenantId: body?.selectedTenantId || null,
            includeTestData: !!body?.includeTestData,
            intent: responseObj?.intent || null
          },
          response: responseObj
        });
      } catch (_e) {
        // non-fatal log failure
      }
      return Response.json(responseObj, { status: httpStatus });
    };

    const body = await req.json().catch(() => ({}));
    const promptRaw = String(body?.prompt || "").trim();
    const prompt = normalize(promptRaw);
    const selectedTenantId = body?.selectedTenantId || null;
    const includeTestData = !!body?.includeTestData;

    if (!user) {
      const resp = { handled: false, reply: "You must be logged in.", error: "unauthorized" };
      return await logAndReturn('unauthorized', resp, 401);
    }

    if (!prompt) {
      const resp = { handled: false, reply: "Please provide a question.", uiActions: [] };
      return await logAndReturn('bad_request', resp, 400);
    }

    const baseFilter = getEffectiveTenantFilter(user, selectedTenantId);
    const effectiveFilter = includeTestData ? { ...baseFilter } : { ...baseFilter, is_test_data: { $ne: true } };

    // 1) Block unintended online search unless gated
    if (shouldSearchOnline(prompt)) {
      // Your app could integrate web search here; for now, acknowledge the intent
      return await logAndReturn('success', { handled: true, reply: "Understood. I can look that up online when enabled.", uiActions: [], intent: 'search_online' });
    }

    // NEW: If the prompt references a core page and includes filterable words, return a navigate uiAction
    const targetPage = typeof detectTargetPage === 'function' ? detectTargetPage(prompt) : null;

    if (targetPage) {
      const qp = typeof extractFilters === 'function' ? extractFilters(prompt, targetPage) : new URLSearchParams();
      const qs = qp.toString();
      const pageWithQuery = qs ? `${targetPage}?${qs}` : targetPage;

      // Build a human-friendly sentence instead of echoing raw query string
      const parts = [];
      if (qp.get('assigned') === 'me') parts.push('assigned to you');
      if (qp.get('status')) parts.push(qp.get('status').replace(/_/g, ' '));
      if (qp.get('type')) parts.push(qp.get('type'));
      if (qp.get('priority')) parts.push(`${qp.get('priority')} priority`);
      if (qp.get('stage')) parts.push(`stage: ${qp.get('stage').replace(/_/g, ' ')}`);
      const friendly = parts.length ? ` with ${parts.join(', ')}` : '';

      const responseObj = {
        handled: true,
        intent: 'navigate',
        reply: `Opening ${targetPage}${friendly}.`,
        uiActions: [{ action: 'navigate', pageName: pageWithQuery }]
      };
      return await logAndReturn('success', responseObj);
    }

    // ===== INTENTS: COUNTS / SNAPSHOT =====
    const asksHowMany = includesAny(prompt, ['how many', 'number of', 'count of', 'do i have', 'what is my count', 'total']);
    // These 'mentions' variables are used for the COUNT intents.
    const mentionsLeadsForCount = includesAny(prompt, ['lead', 'leads']);
    const mentionsContactsForCount = includesAny(prompt, ['contact', 'contacts']);
    const mentionsOppsForCount = includesAny(prompt, ['opportunity', 'opportunities', 'pipeline']);
    const mentionsAccountsForCount = includesAny(prompt, ['account', 'accounts', 'company', 'companies', 'customers']);
    const mentionsPipelineValue = includesAny(prompt, ['pipeline value', 'total pipeline', 'sum of opportunities', 'value of opportunities']);

    if (asksHowMany && mentionsLeadsForCount) {
      const leads = await base44.entities.Lead.filter(effectiveFilter);
      const reply = `You have ${leads.length} lead${leads.length === 1 ? '' : 's'}.`;
      return await logAndReturn('success', { handled: true, reply, uiActions: [], intent: 'count_leads' });
    }

    if (asksHowMany && mentionsContactsForCount) {
      const contacts = await base44.entities.Contact.filter(effectiveFilter);
      const reply = `You have ${contacts.length} contact${contacts.length === 1 ? '' : 's'}.`;
      return await logAndReturn('success', { handled: true, reply, uiActions: [], intent: 'count_contacts' });
    }

    if (asksHowMany && mentionsAccountsForCount) {
      const accounts = await base44.entities.Account.filter(effectiveFilter);
      const reply = `You have ${accounts.length} account${accounts.length === 1 ? '' : 's'}.`;
      return await logAndReturn('success', { handled: true, reply, uiActions: [], intent: 'count_accounts' });
    }

    if (asksHowMany && mentionsOppsForCount && !mentionsPipelineValue) {
      const opps = await base44.entities.Opportunity.filter(effectiveFilter);
      const reply = `You have ${opps.length} opportunit${opps.length === 1 ? 'y' : 'ies'}.`;
      return await logAndReturn('success', { handled: true, reply, uiActions: [], intent: 'count_opportunities' });
    }

    if (mentionsPipelineValue || (asksHowMany && includesAny(prompt, ['pipeline']))) {
      const opps = await base44.entities.Opportunity.filter(effectiveFilter);
      const value = opps.reduce((sum, o) => sum + (o?.amount || 0), 0);
      const reply = `Your current total pipeline value is $${Number(value).toLocaleString()}.`;
      return await logAndReturn('success', { handled: true, reply, value, uiActions: [], intent: 'pipeline_value' });
    }

    // ===== List names for core components (Contacts, Leads, Accounts, Opportunities, Activities) =====
    const asksForNames = includesAny(prompt, ["names of", "lead names", "names", "list", "who are", "show"]);
    const mentionsContacts = includesAny(prompt, ["contact", "contacts"]); // Reused from previous logic
    const mentionsLeads = includesAny(prompt, ["lead", "leads"]); // Reused from previous logic
    const mentionsAccounts = includesAny(prompt, ["account", "accounts", "company", "companies", "customers"]);
    const mentionsOpps = includesAny(prompt, ["opportunity", "opportunities", "pipeline", "deals", "opps"]);
    const mentionsActivities = includesAny(prompt, ["activity", "activities", "tasks", "calls", "meetings", "emails"]);

    const previewReplyObj = (title, items, limit = 20) => { // Renamed to avoid confusion with `Response.json`
      const names = items.slice(0, limit);
      const count = items.length;
      const more = count > names.length ? ` (showing ${names.length} of ${count})` : "";
      const reply = `${title}${more}: ${names.join(", ")}`;
      return { handled: true, reply, names, count, uiActions: [] };
    };

    if (asksForNames && mentionsContacts) {
      const contacts = await base44.entities.Contact.filter(effectiveFilter);
      if (!contacts?.length) {
        return await logAndReturn('success', { handled: true, reply: "You don't have any contacts yet.", names: [], count: 0, uiActions: [], intent: 'list_contacts_empty' });
      }
      const items = contacts.map((c) => {
        const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
        return full || c.email || "Unnamed contact";
      });
      return await logAndReturn('success', { ...previewReplyObj("Contact names", items), intent: 'list_contacts' });
    }

    if (asksForNames && mentionsLeads) {
      const leads = await base44.entities.Lead.filter(effectiveFilter);
      if (!leads?.length) {
        return await logAndReturn('success', { handled: true, reply: "You don't have any leads yet.", names: [], count: 0, uiActions: [], intent: 'list_leads_empty' });
      }
      const items = leads.map((l) => {
        const full = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
        return full || l.company || l.email || "Unnamed lead";
      });
      return await logAndReturn('success', { ...previewReplyObj("Lead names", items), intent: 'list_leads' });
    }

    if (asksForNames && mentionsAccounts) {
      const accounts = await base44.entities.Account.filter(effectiveFilter);
      if (!accounts?.length) {
        return await logAndReturn('success', { handled: true, reply: "You don't have any accounts yet.", names: [], count: 0, uiActions: [], intent: 'list_accounts_empty' });
      }
      const items = accounts.map((a) => a.name || a.website || "Unnamed account");
      return await logAndReturn('success', { ...previewReplyObj("Account names", items), intent: 'list_accounts' });
    }

    if (asksForNames && mentionsOpps) {
      const opps = await base44.entities.Opportunity.filter(effectiveFilter);
      if (!opps?.length) {
        return await logAndReturn('success', { handled: true, reply: "You don't have any opportunities yet.", names: [], count: 0, uiActions: [], intent: 'list_opportunities_empty' });
      }
      const items = opps.map((o) => o.name || "Unnamed opportunity");
      return await logAndReturn('success', { ...previewReplyObj("Opportunity names", items), intent: 'list_opportunities' });
    }

    if (asksForNames && mentionsActivities) {
      const acts = await base44.entities.Activity.filter(effectiveFilter);
      if (!acts?.length) {
        return await logAndReturn('success', { handled: true, reply: "You don't have any activities yet.", names: [], count: 0, uiActions: [], intent: 'list_activities_empty' });
      }
      const items = acts.map((a) => a.subject || `${a.type || "activity"} on ${a.due_date || a.created_date || ""}`.trim());
      return await logAndReturn('success', { ...previewReplyObj("Activity names", items), intent: 'list_activities' });
    }

    // Lead-first Q&A helpers
    const wantsPhone = includesAny(prompt, ["phone number", "phone", "mobile", "cell"]);
    const explicitName = extractExplicitName(promptRaw);
    const guessedName = explicitName || guessPersonName(promptRaw);

    // Helper: lead-first search (then contacts)
    const findBestLeadThenContact = async () => {
      let best = null;
      let type = null;

      const leads = await base44.entities.Lead.filter(effectiveFilter);
      let topL = null, topLScore = 0;
      for (const l of leads) {
        const sc = leadMatchScore(prompt, l);
        if (sc > topLScore) { topL = l; topLScore = sc; }
      }
      if (topL && topLScore >= 3) { best = topL; type = "Lead"; }

      if (!best) {
        const contacts = await base44.entities.Contact.filter(effectiveFilter);
        let topC = null, topCScore = 0;
        for (const c of contacts) {
          const sc = contactMatchScore(prompt, c);
          if (sc > topCScore) { topC = c; topCScore = sc; }
        }
        if (topC && topCScore >= 3) { best = topC; type = "Contact"; }
      }
      return { best, type };
    };

    // Explicit type override
    const findBestByExplicitType = async () => {
      if (mentionsContacts && !mentionsLeads) {
        const contacts = await base44.entities.Contact.filter(effectiveFilter);
        let topC = null, topCScore = 0;
        for (const c of contacts) {
          const sc = contactMatchScore(prompt, c);
          if (sc > topCScore) { topC = c; topCScore = sc; }
        }
        if (topC && topCScore >= 3) return { best: topC, type: "Contact" };
        return { best: null, type: "Contact" };
      }
      if (mentionsLeads && !mentionsContacts) {
        const leads = await base44.entities.Lead.filter(effectiveFilter);
        let topL = null, topLScore = 0;
        for (const l of leads) {
          const sc = leadMatchScore(prompt, l);
          if (sc > topLScore) { topL = l; topLScore = sc; }
        }
        if (topL && topLScore >= 3) return { best: topL, type: "Lead" };
        return { best: null, type: "Lead" };
      }
      return null; // ambiguous
    };

    // Record navigation intents like "open lead Mark Twain", "show contact Jane Doe"
    const navVerbs = ['go to', 'goto', 'open', 'navigate', 'show', 'take me to', 'view']; // Kept for record navigation
    const wantsOpenRecord = navVerbs.some(v => prompt.includes(v)) &&
      (mentionsLeads || mentionsContacts || (explicitName && includesAny(prompt, [explicitName.toLowerCase()])) || (guessedName && includesAny(prompt, [guessedName.toLowerCase()])));

    if (wantsOpenRecord) {
      const explicit = await findBestByExplicitType();
      const found = explicit || await findBestLeadThenContact();

      if (found?.best && found?.type) {
        const pageName = found.type === 'Lead' ? 'Leads' : 'Contacts';
        const nameText =
          found.type === 'Lead'
            ? [found.best.first_name, found.best.last_name].filter(Boolean).join(' ') || (found.best.company || 'the lead')
            : [found.best.first_name, found.best.last_name].filter(Boolean).join(' ') || (found.best.email || 'the contact');

        return await logAndReturn('success', {
          handled: true,
          reply: `Opening ${found.type.toLowerCase()} ${nameText}...`,
          uiActions: [
            { action: 'navigate', pageName },
            { action: 'viewRecord', entityType: found.type, record: found.best }
          ],
          intent: 'navigate_record'
        });
      }
      return await logAndReturn('success', { handled: true, reply: "I couldn't find a matching lead or contact.", uiActions: [], intent: 'navigate_record_not_found' });
    }

    // Phone lookup: lead-first, and if missing say it doesn't exist in CRM
    if (wantsPhone && (guessedName || mentionsLeads || mentionsContacts)) {
      const explicit = await findBestByExplicitType();
      const found = explicit || await findBestLeadThenContact();

      if (!found?.best || !found?.type) {
        return await logAndReturn('success', { handled: true, reply: "I couldn't find a matching lead or contact for that name.", uiActions: [], intent: 'lookup_phone_not_found' });
      }

      const phoneNum = found.best.phone || found.best.mobile;
      if (!phoneNum) {
        const nameText =
        [found.best.first_name, found.best.last_name].filter(Boolean).join(' ') ||
        found.best.company || found.best.email || (found.type === 'Lead' ? 'this lead' : 'this contact');
        return await logAndReturn('success', {
          handled: true,
          reply: `It appears the phone number for ${nameText} does not exist in the CRM.`,
          uiActions: [
            { action: 'navigate', pageName: found.type === 'Lead' ? 'Leads' : 'Contacts' },
            { action: 'viewRecord', entityType: found.type, record: found.best }
          ],
          intent: 'lookup_phone_no_number'
        });
      }

      const nameText =
        [found.best.first_name, found.best.last_name].filter(Boolean).join(' ') ||
        found.best.company || found.best.email || (found.type === 'Lead' ? 'lead' : 'contact');

      return await logAndReturn('success', {
        handled: true,
        reply: `${nameText}'s phone number is ${phoneNum}.`,
        uiActions: [
          { action: 'navigate', pageName: found.type === 'Lead' ? 'Leads' : 'Contacts' },
          { action: 'viewRecord', entityType: found.type, record: found.best }
        ],
        intent: 'lookup_phone_success'
      });
    }

    // Example: “Do I have a lead called Mark Twain?”
    if (mentionsLeads && includesAny(prompt, ["called", "named", "have a lead"])) {
      const leads = await base44.entities.Lead.filter(effectiveFilter);
      const nameStr = (explicitName || guessedName || "").toLowerCase();
      const match = leads.find((l) =>
        `${(l.first_name || "").toLowerCase()} ${(l.last_name || "").toLowerCase()}`.trim().includes(nameStr)
      );
      if (match) {
        return await logAndReturn('success', {
          handled: true,
          reply: `Yes, you have a lead named ${[match.first_name, match.last_name].filter(Boolean).join(' ') || match.company || match.email}.`,
          entity_type: "lead",
          entity_id: match.id,
          uiActions: [],
          intent: 'check_lead_exists'
        });
      }
      const reply = `I couldn't find a lead by that name.`;
      return await logAndReturn('success', { handled: true, reply, uiActions: [], intent: 'check_lead_exists_not_found' });
    }

    // “What is the name of that lead?” — if only one lead exists, answer it directly (stateless best-effort)
    if (mentionsLeads && includesAny(prompt, ["name of that lead", "that lead", "the name of that"])) {
      const leads = await base44.entities.Lead.filter(effectiveFilter);
      if (leads.length === 1) {
        const l = leads[0];
        const full = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
        const reply = `The name of that lead is ${full || l.company || l.email || 'Unnamed lead'}.`;
        return await logAndReturn('success', { handled: true, reply, entity_type: "lead", entity_id: l.id, uiActions: [], intent: 'get_lead_name_single' });
      }
      // Best-effort: return top-scoring
      if (leads.length > 0) {
        let top = null, topScore = -1;
        for (const l of leads) {
          const sc = leadMatchScore(prompt, l);
          if (sc > topScore) { top = l; topScore = sc; }
        }
        if (top) {
          const full = [top.first_name, top.last_name].filter(Boolean).join(" ").trim();
          const reply = `The name of that lead is ${full || top.company || top.email || 'Unnamed lead'}.`;
          return await logAndReturn('success', { handled: true, reply, entity_type: "lead", entity_id: top.id, uiActions: [], intent: 'get_lead_name_top_scoring' });
        }
      }
      return await logAndReturn('success', { handled: true, reply: "I couldn't determine which lead you meant.", uiActions: [], intent: 'get_lead_name_ambiguous' });
    }

    // ===== Default fallback =====
    return await logAndReturn('success', {
      handled: false,
      reply: "I couldn't access that information.",
      uiActions: [],
      intent: 'unhandled'
    });
  } catch (error) {
    // Log errors for the AI Execution Logs viewer
    const duration = Date.now() - startTime;
    try {
      if (base44) {
        await base44.entities.PerformanceLog.create({
          function_name: "processAICommand",
          response_time_ms: duration,
          status: "error",
          error_message: error?.message || String(error),
          payload: { prompt: String(body?.prompt || "").trim(), note: "unhandled exception in processChatCommand" }
        });
      }
    } catch (_e) { /* non-fatal log failure */ }
    return Response.json({ handled: false, reply: "An error occurred while processing your request.", error: error?.message || 'server_error', uiActions: [] }, { status: 500 });
  }
});


----------------------------

export default processChatCommand;
