import { Page, APIRequestContext } from '@playwright/test';

export const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
export const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
export const TENANT_ID = 'local-tenant-001';
export const E2E_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// ============== BizDev Source Helpers ==============

export async function createBizDevSource(request: APIRequestContext, data: {
  source_name: string;  // Required field
  company_name?: string;
  contact_person?: string;
  contact_email: string;
  contact_phone?: string;
  source_type?: string;
  address_line_1?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  website?: string;
  industry?: string;
}, tenantId = E2E_TENANT_ID) {
  const res = await request.post(`${BACKEND_URL}/api/bizdevsources`, {
    data: { 
      tenant_id: tenantId, 
      status: 'Active', 
      source: data.source_name,  // API requires 'source' field
      ...data 
    },
  });
  if (!res.ok()) throw new Error(`createBizDevSource failed: ${await res.text()}`);
  return res.json();
}

export async function promoteBizDevSource(request: APIRequestContext, sourceId: string, clientType: 'B2B' | 'B2C' = 'B2B', tenantId = E2E_TENANT_ID) {
  const res = await request.post(`${BACKEND_URL}/api/bizdevsources/${sourceId}/promote`, {
    data: { tenant_id: tenantId, performed_by: 'e2e@example.com', delete_source: false, client_type: clientType },
  });
  if (!res.ok()) throw new Error(`promoteBizDevSource failed: ${await res.text()}`);
  return res.json();
}

export async function getBizDevSource(request: APIRequestContext, sourceId: string, tenantId = E2E_TENANT_ID) {
  const res = await request.get(`${BACKEND_URL}/api/bizdevsources/${sourceId}?tenant_id=${tenantId}`);
  if (!res.ok()) throw new Error(`getBizDevSource failed: ${await res.text()}`);
  return res.json();
}

// ============== Lead Helpers ==============

export async function createLead(request: APIRequestContext, data: {
  first_name: string; last_name: string; email: string; phone?: string; company?: string; job_title?: string; status?: string; source?: string;
}, tenantId = TENANT_ID) {
  const res = await request.post(`${BACKEND_URL}/api/leads`, { data: { tenant_id: tenantId, status: 'new', ...data } });
  if (!res.ok()) throw new Error(`createLead failed: ${await res.text()}`);
  return res.json();
}

export async function getLead(request: APIRequestContext, leadId: string, tenantId = E2E_TENANT_ID) {
  const res = await request.get(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${tenantId}`);
  if (!res.ok()) throw new Error(`getLead failed: ${await res.text()}`);
  return res.json();
}

export async function convertLead(request: APIRequestContext, leadId: string, args: {
  account_name?: string;
  opportunity_name?: string;
  opportunity_amount?: number;
  create_account?: boolean;
  create_opportunity?: boolean;
  selected_account_id?: string | null;
}, tenantId = E2E_TENANT_ID) {
  const res = await request.post(`${BACKEND_URL}/api/leads/${leadId}/convert`, {
    data: {
      tenant_id: tenantId,
      // Note: performed_by expects UUID if provided, omit for E2E tests
      create_account: args.create_account ?? true,
      create_opportunity: args.create_opportunity ?? true,
      ...args
    }
  });
  if (!res.ok()) throw new Error(`convertLead failed: ${await res.text()}`);
  return res.json();
}

// ============== Contact Helpers ==============

export async function getContact(request: APIRequestContext, contactId: string, tenantId = E2E_TENANT_ID) {
  const res = await request.get(`${BACKEND_URL}/api/contacts/${contactId}?tenant_id=${tenantId}`);
  if (!res.ok()) throw new Error(`getContact failed: ${await res.text()}`);
  return res.json();
}

// ============== Account Helpers ==============

export async function getAccount(request: APIRequestContext, accountId: string, tenantId = E2E_TENANT_ID) {
  const res = await request.get(`${BACKEND_URL}/api/accounts/${accountId}?tenant_id=${tenantId}`);
  if (!res.ok()) throw new Error(`getAccount failed: ${await res.text()}`);
  return res.json();
}

// ============== Opportunity Helpers ==============

export async function getOpportunity(request: APIRequestContext, opportunityId: string, tenantId = E2E_TENANT_ID) {
  const res = await request.get(`${BACKEND_URL}/api/opportunities/${opportunityId}?tenant_id=${tenantId}`);
  if (!res.ok()) throw new Error(`getOpportunity failed: ${await res.text()}`);
  return res.json();
}

// ============== Note Helpers ==============

export async function createNote(request: APIRequestContext, entity_type: 'Lead'|'Opportunity'|'Account'|'Contact', entity_id: string, content: string, tenantId = E2E_TENANT_ID) {
  // Note: API expects related_type and related_id, not entity_type and entity_id
  const res = await request.post(`${BACKEND_URL}/api/notes`, { data: { tenant_id: tenantId, related_type: entity_type, related_id: entity_id, content, is_pinned: false } });
  if (!res.ok()) throw new Error(`createNote failed: ${await res.text()}`);
  return res.json();
}

// ============== Activity Helpers ==============

export async function createActivity(request: APIRequestContext, data: {
  type: 'call'|'meeting'|'email'; subject: string; status: 'scheduled'|'completed'; due_date?: string; related_to_type?: 'Lead'|'Opportunity'|'Account'|'Contact'; related_to_id?: string; body?: string;
}, tenantId = E2E_TENANT_ID) {
  const res = await request.post(`${BACKEND_URL}/api/activities`, { data: { tenant_id: tenantId, ...data } });
  if (!res.ok()) throw new Error(`createActivity failed: ${await res.text()}`);
  return res.json();
}

export async function updateActivityStatus(request: APIRequestContext, activityId: string, status: 'scheduled'|'completed', tenantId = E2E_TENANT_ID) {
  const res = await request.put(`${BACKEND_URL}/api/activities/${activityId}`, { data: { tenant_id: tenantId, status } });
  if (!res.ok()) throw new Error(`updateActivityStatus failed: ${await res.text()}`);
  return res.json();
}

export async function updateOpportunityStage(request: APIRequestContext, opportunityId: string, stage: string, tenantId = E2E_TENANT_ID) {
  const res = await request.put(`${BACKEND_URL}/api/opportunities/${opportunityId}`, { data: { tenant_id: tenantId, stage } });
  if (!res.ok()) throw new Error(`updateOpportunityStage failed: ${await res.text()}`);
  return res.json();
}

export async function navigate(page: Page, path: string) {
  const url = path.startsWith('http') ? path : `${FRONTEND_URL}${path}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(500);
}

export async function initE2EUi(page: Page) {
  await page.context().addInitScript(() => {
    localStorage.setItem('E2E_TEST_MODE', 'true');
    localStorage.setItem('tenant_id', 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
    localStorage.setItem('selected_tenant_id', 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
    (window as any).__e2eUser = {
      id: 'e2e-test-user',
      email: 'e2e@example.com',
      role: 'superadmin',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
    };
  });
}
