import { Page, APIRequestContext } from '@playwright/test';

export const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
export const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
export const TENANT_ID = 'local-tenant-001';

export async function createLead(request: APIRequestContext, data: {
  first_name: string; last_name: string; email: string; phone?: string; company?: string; job_title?: string; status?: string; source?: string;
}) {
  const res = await request.post(`${BACKEND_URL}/api/leads`, { data: { tenant_id: TENANT_ID, status: 'new', ...data } });
  if (!res.ok()) throw new Error(`createLead failed: ${await res.text()}`);
  return res.json();
}

export async function convertLead(request: APIRequestContext, leadId: string, args: { account_name: string; opportunity_name: string; opportunity_amount: number; }) {
  const res = await request.post(`${BACKEND_URL}/api/leads/${leadId}/convert`, { data: { tenant_id: TENANT_ID, performed_by: 'e2e@example.com', create_account: true, create_opportunity: true, ...args } });
  if (!res.ok()) throw new Error(`convertLead failed: ${await res.text()}`);
  return res.json();
}

export async function createNote(request: APIRequestContext, entity_type: 'Lead'|'Opportunity'|'Account'|'Contact', entity_id: string, content: string) {
  const res = await request.post(`${BACKEND_URL}/api/notes`, { data: { tenant_id: TENANT_ID, entity_type, entity_id, content, is_pinned: false } });
  if (!res.ok()) throw new Error(`createNote failed: ${await res.text()}`);
  return res.json();
}

export async function createActivity(request: APIRequestContext, data: {
  type: 'call'|'meeting'|'email'; subject: string; status: 'scheduled'|'completed'; due_date?: string; related_to_type?: 'Lead'|'Opportunity'|'Account'|'Contact'; related_to_id?: string; body?: string;
}) {
  const res = await request.post(`${BACKEND_URL}/api/activities`, { data: { tenant_id: TENANT_ID, ...data } });
  if (!res.ok()) throw new Error(`createActivity failed: ${await res.text()}`);
  return res.json();
}

export async function updateActivityStatus(request: APIRequestContext, activityId: string, status: 'scheduled'|'completed') {
  const res = await request.put(`${BACKEND_URL}/api/activities/${activityId}`, { data: { tenant_id: TENANT_ID, status } });
  if (!res.ok()) throw new Error(`updateActivityStatus failed: ${await res.text()}`);
  return res.json();
}

export async function updateOpportunityStage(request: APIRequestContext, opportunityId: string, stage: string) {
  const res = await request.put(`${BACKEND_URL}/api/opportunities/${opportunityId}`, { data: { tenant_id: TENANT_ID, stage } });
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
    localStorage.setItem('tenant_id', 'local-tenant-001');
    localStorage.setItem('selected_tenant_id', 'local-tenant-001');
    (window as any).__e2eUser = {
      id: 'e2e-test-user-id',
      email: 'e2e@example.com',
      role: 'superadmin',
      tenant_id: 'local-tenant-001'
    };
  });
}
