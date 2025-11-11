// Quick test script for /api/utils/generate-unique-id
// Usage: node backend/test-generate-unique-id.js
// Requires backend running on http://localhost:4001

import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';

async function run() {
  const tenant_id = process.env.TEST_TENANT_ID || 'local-tenant-001';
  const types = ['Lead', 'Contact', 'Account'];
  for (const entity_type of types) {
    const res = await fetch(`${BACKEND_URL}/api/utils/generate-unique-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type, tenant_id })
    });
    const json = await res.json();
    console.log(entity_type, res.status, json);
  }
}

run().catch(err => {
  console.error('Test failed', err);
  process.exit(1);
});
