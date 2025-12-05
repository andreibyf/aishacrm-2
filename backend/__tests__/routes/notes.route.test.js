import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];
// Generate valid UUIDs for related entities (these are fake but valid format)
const TEST_CONTACT_UUID = randomUUID();
const TEST_ACCOUNT_UUID = randomUUID();

async function createNote(payload) {
  const res = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function getNote(id) {
  const res = await fetch(`${BASE_URL}/api/notes/${id}?tenant_id=${TENANT_ID}`);
  const json = await res.json();
  return { status: res.status, json };
}

async function updateNote(id, payload) {
  const res = await fetch(`${BASE_URL}/api/notes/${id}?tenant_id=${TENANT_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteNote(id) {
  const res = await fetch(`${BASE_URL}/api/notes/${id}?tenant_id=${TENANT_ID}`, { method: 'DELETE' });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;
  // Seed test notes
  const a = await createNote({ 
    title: 'Unit Test Note A',
    content: 'This is a test note for unit testing',
    related_type: 'contact',
    related_id: TEST_CONTACT_UUID
  });
  assert.ok([200, 201].includes(a.status), `create note A failed: ${JSON.stringify(a.json)}`);
  const idA = a.json?.data?.id || a.json?.data?.note?.id;
  assert.ok(idA, 'note A should have an id');
  createdIds.push(idA);

  const b = await createNote({ 
    title: 'Unit Test Note B',
    content: 'Another test note',
    related_type: 'account',
    related_id: TEST_ACCOUNT_UUID
  });
  assert.ok([200, 201].includes(b.status), `create note B failed: ${JSON.stringify(b.json)}`);
  const idB = b.json?.data?.id || b.json?.data?.note?.id;
  assert.ok(idB, 'note B should have an id');
  createdIds.push(idB);
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try { await deleteNote(id); } catch { /* ignore */ }
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/notes returns 200 with tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/notes?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200, 'expected 200 from notes list');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.notes || Array.isArray(json.data), 'expected notes array in response');
  assert.ok(Number.isInteger(json.data?.total), 'expected total count in response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/notes/:id returns specific note', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid note id');
  
  const result = await getNote(id);
  assert.equal(result.status, 200, 'expected 200 from get note by id');
  assert.equal(result.json.status, 'success');
  
  const note = result.json.data?.note || result.json.data;
  assert.ok(note, 'expected note in response');
  assert.equal(note.title, 'Unit Test Note A');
  assert.equal(note.related_type, 'contact');
});

(SHOULD_RUN ? test : test.skip)('GET /api/notes/:id enforces tenant scoping when tenant_id provided', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid note id');
  
  // Try to access with wrong tenant_id
  const res = await fetch(`${BASE_URL}/api/notes/${id}?tenant_id=wrong-tenant-999`);
  // Should return 404 due to tenant scoping
  assert.equal(res.status, 404, `expected 404 for cross-tenant access, got ${res.status}`);
});

(SHOULD_RUN ? test : test.skip)('PUT /api/notes/:id updates note', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid note id');
  
  const result = await updateNote(id, { 
    title: 'Updated Title',
    content: 'Updated content for testing'
  });
  
  assert.equal(result.status, 200, 'expected 200 from update note');
  assert.equal(result.json.status, 'success');
  
  const updated = result.json.data?.note || result.json.data;
  assert.ok(updated, 'expected updated note in response');
  assert.equal(updated.title, 'Updated Title', 'title should be updated');
  assert.equal(updated.content, 'Updated content for testing', 'content should be updated');
});

(SHOULD_RUN ? test : test.skip)('DELETE /api/notes/:id removes note', async () => {
  // Create a temporary note to delete
  const temp = await createNote({ 
    title: 'Temp Delete Note',
    content: 'This note will be deleted'
  });
  assert.ok([200, 201].includes(temp.status), `create temp note failed: ${temp.status}`);
  const tempId = temp.json?.data?.id || temp.json?.data?.note?.id;
  assert.ok(tempId, 'temp note should have an id');
  
  // Delete it
  const status = await deleteNote(tempId);
  assert.ok([200, 204].includes(status), `expected 200/204 from delete, got ${status}`);
  
  // Verify it's gone
  const verify = await getNote(tempId);
  assert.equal(verify.status, 404, 'deleted note should return 404');
});

(SHOULD_RUN ? test : test.skip)('GET /api/notes supports related_type filter', async () => {
  const res = await fetch(`${BASE_URL}/api/notes?tenant_id=${TENANT_ID}&related_type=contact`);
  assert.equal(res.status, 200, 'expected 200 from notes list with related_type filter');
  const json = await res.json();
  const notes = json.data?.notes || [];
  assert.ok(Array.isArray(notes), 'notes should be an array');
  
  // Ensure all returned notes have related_type 'contact'
  for (const n of notes) {
    assert.equal(n.related_type, 'contact', 'filtered notes should all be related to contact');
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/notes supports related_id filter', async () => {
  const res = await fetch(`${BASE_URL}/api/notes?tenant_id=${TENANT_ID}&related_id=${TEST_CONTACT_UUID}`);
  assert.equal(res.status, 200, 'expected 200 from notes list with related_id filter');
  const json = await res.json();
  const notes = json.data?.notes || [];
  assert.ok(Array.isArray(notes), 'notes should be an array');
  
  // Should find our test note with this related_id
  const found = notes.find(n => n.related_id === TEST_CONTACT_UUID);
  assert.ok(found, `should find note with related_id ${TEST_CONTACT_UUID}`);
});

(SHOULD_RUN ? test : test.skip)('POST /api/notes requires tenant_id and content', async () => {
  // Missing tenant_id
  let res = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'No tenant' })
  });
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  
  // Missing content
  res = await fetch(`${BASE_URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, title: 'No content' })
  });
  assert.equal(res.status, 400, 'expected 400 when content is missing');
});

(SHOULD_RUN ? test : test.skip)('POST /api/notes can create note with metadata', async () => {
  const result = await createNote({ 
    title: 'Note with Metadata',
    content: 'Testing metadata storage',
    metadata: { priority: 'high', tags: ['important', 'test'] }
  });
  
  assert.ok([200, 201].includes(result.status), `expected 200/201 from create note, got ${result.status}`);
  const note = result.json?.data?.note || result.json?.data;
  assert.ok(note, 'expected note in response');
  assert.ok(note.metadata, 'expected metadata in response');
  
  // Cleanup
  const id = result.json?.data?.id || result.json?.data?.note?.id;
  if (id) {
    try { await deleteNote(id); } catch { /* ignore */ }
  }
});
