const base = 'http://localhost:3001/api/activities';
const tenant_id = 'local-tenant-001';

async function main() {
  try {
    // Create
    const subject = `E2E API Create Test ${Date.now()}`;
    const createRes = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'task', subject, description: 'via node script', status: 'scheduled', tenant_id })
    });
    const created = await createRes.json();
    console.log('Create status:', createRes.status, created);

    // Search
    const or = encodeURIComponent(JSON.stringify([{ subject: { $regex: subject, $options: 'i' } }]));
    const getRes = await fetch(`${base}?tenant_id=${tenant_id}&$or=${or}`);
    const list = await getRes.json();
    console.log('Search total:', list?.data?.total);
    console.log('First matched:', list?.data?.activities?.[0]);

    if (list?.data?.activities?.[0]?.id) {
      const delId = list.data.activities[0].id;
      const delRes = await fetch(`${base}/${delId}`, { method: 'DELETE' });
      const delJson = await delRes.json();
      console.log('Delete status:', delRes.status, delJson);
    }
  } catch (e) {
    console.error('Test error:', e);
  }
}

main();
