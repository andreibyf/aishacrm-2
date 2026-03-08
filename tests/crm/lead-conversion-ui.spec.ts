import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

// Tenant used in E2E mock user (see auth.setup.js)
const E2E_TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

// Helper to fetch a lead by email by scanning the most recent leads
async function findLeadByEmail(request: any, email: string, { limit = 200 } = {}) {
  const url = new URL(`${BACKEND_URL}/api/leads`);
  url.searchParams.set('tenant_id', E2E_TENANT_ID);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', '0');
  const res = await request.get(url.toString());
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to list leads (${res.status()}): ${body}`);
  }
  const json = await res.json();
  const leads = json?.data?.leads || json?.data || json || [];
  return Array.isArray(leads) ? leads.find((l) => (l.email || '').toLowerCase() === email.toLowerCase()) : null;
}

// Helper to convert lead via backend API
async function convertLead(request: any, leadId: string, options: {
  create_account?: boolean,
  account_name?: string,
  selected_account_id?: string | null,
  create_opportunity?: boolean,
  opportunity_name?: string,
  opportunity_amount?: number,
} = {}) {
  const res = await request.post(`${BACKEND_URL}/api/leads/${leadId}/convert`, {
    data: {
      tenant_id: E2E_TENANT_ID,
      performed_by: 'e2e@example.com',
      ...options,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Convert lead failed (${res.status()}): ${body}`);
  }
  return res.json();
}

// Creates a new unique lead via backend API (faster and avoids UI flakiness)
async function createLeadViaAPI(request: any, data: { first: string; last: string; email: string; company?: string; job?: string }) {
  const res = await request.post(`${BACKEND_URL}/api/leads`, {
    data: {
      tenant_id: E2E_TENANT_ID,
      first_name: data.first,
      last_name: data.last,
      email: data.email,
      phone: null,
      company: data.company || null,
      job_title: data.job || null,
      status: 'new',
      source: 'website',
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Create lead failed (${res.status()}): ${body}`);
  }
  return res.json();
}

// Verify a lead row shows status badge with specific value
async function expectLeadStatus(page: any, email: string, status: string) {
  const row = page.locator(`[data-testid="lead-row-${email}"]`).first();
  await row.waitFor({ timeout: 30000 });
  await expect(row.getByText(/converted|new|contacted|qualified|unqualified|lost/i)).toBeVisible();
  await expect(row.getByText(new RegExp(`^${status}$`, 'i'))).toBeVisible();
}

// Main E2E
test.describe('Lead conversion - UI list reflects conversion', () => {
  test('create lead (API) -> convert (API) -> see converted in UI', async ({ page, request }) => {
    // Unique test data
    const now = Date.now();
    const email = `e2e.${now}@playwright.test`;
    const first = 'E2E';
    const last = `Lead-${now}`;

  // Create via API for stability
  await createLeadViaAPI(request, { first, last, email, company: 'E2E Co', job: 'QA' });

  // Load Leads UI and filter by email to find the row
  await page.goto(`${FRONTEND_URL}/Leads`, { waitUntil: 'domcontentloaded' });
  const searchInput = page.getByPlaceholder('Search leads by name, email, phone, company, or job title...');
  await searchInput.waitFor({ timeout: 30000 });
  await searchInput.fill(email);
  await expectLeadStatus(page, email, 'new');

    // Fetch lead id via backend
    const lead = await findLeadByEmail(request, email, { limit: 200 });
    expect(lead?.id).toBeTruthy();

    // Convert via backend API to create account + opportunity
    await convertLead(request, lead.id, {
      create_account: true,
      account_name: `E2E Account ${now}`,
      create_opportunity: true,
      opportunity_name: `E2E Opp ${now}`,
      opportunity_amount: 1234,
    });

    // Reload UI to pick up changes
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Expect status to be converted
    await expectLeadStatus(page, email, 'converted');
  });
});
