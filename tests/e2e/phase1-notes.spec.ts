import { test, expect } from '@playwright/test';
import { BACKEND_URL, TENANT_ID, createLead, createNote } from './helpers';

test.describe('@phase1 Notes', () => {
  test('add qualification note to lead and verify linkage', async ({ request }) => {
    const ts = Date.now();
    const email = `lead.notes.${ts}@acmecorp.test`;
    const lead = await createLead(request, { first_name: 'Notes', last_name: `Lead-${ts}`, email });
    const leadId = lead?.data?.lead?.id || lead?.data?.id || lead?.id;
    expect(leadId).toBeTruthy();

    const content = 'Qualification note: budget approved; timeline Q1.';
    const note = await createNote(request, 'Lead', leadId, content);
    const noteId = note?.data?.note?.id || note?.data?.id || note?.id;
    expect(noteId).toBeTruthy();

    // Fetch notes for lead
    const res = await request.get(`${BACKEND_URL}/api/notes?tenant_id=${TENANT_ID}&entity_type=Lead&entity_id=${leadId}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const notes = json?.data?.notes || json?.data || [];
    expect(Array.isArray(notes)).toBeTruthy();
    expect(notes.some((n:any)=> (n.content||'').includes('Qualification'))).toBeTruthy();
  });
});
