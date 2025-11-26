// Lightweight Dashboard Stats fetch (local)
// Uses backend /api/reports/dashboard-stats to quickly retrieve counts
// without pulling full entity lists. Safe to use in browser.

import { BACKEND_URL } from '@/api/entities';

export async function getDashboardStats(params = {}) {
	const { tenant_id } = params;
	const url = new URL(`${BACKEND_URL}/api/reports/dashboard-stats`);
	if (tenant_id) url.searchParams.set('tenant_id', tenant_id);

	const resp = await fetch(url.toString(), {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
	});
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`dashboard-stats ${resp.status}: ${text || 'request failed'}`);
	}
	const json = await resp.json();
	// Expect shape { status, data }
	return json?.data || json;
}

export default getDashboardStats;
