import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import { createInvoiceProjectionWorker } from '../../../../lib/finance/projections/invoiceProjection.js';

const T = '00000000-0000-4000-8000-000000000011';

describe('invoiceProjection', () => {
  test('projectionName and consumedEvents cover both invoice draft event types', () => {
    const worker = createInvoiceProjectionWorker();
    assert.equal(worker.projectionName, 'finance.projection.invoices');
    assert.ok(worker.consumedEvents.includes('finance.invoice.draft_created'));
    assert.ok(worker.consumedEvents.includes('finance.invoice.draft_updated'));
  });

  test('replaying draft_created x2 then draft_updated upserts in insertion order with updated fields', async () => {
    const worker = createInvoiceProjectionWorker();
    const provider = createMemoryProjectionStoreProvider();
    const store = await provider.getLiveStore(worker.projectionName, T);

    const events = [
      {
        id: 'evt_dc1',
        tenant_id: T,
        event_type: 'finance.invoice.draft_created',
        created_at: '2026-06-01T00:00:01Z',
        payload: {
          invoice: {
            id: 'inv1',
            tenant_id: T,
            status: 'draft',
            total_cents: 1000,
            currency: 'usd',
          },
        },
      },
      {
        id: 'evt_dc2',
        tenant_id: T,
        event_type: 'finance.invoice.draft_created',
        created_at: '2026-06-01T00:00:02Z',
        payload: {
          invoice: {
            id: 'inv2',
            tenant_id: T,
            status: 'draft',
            total_cents: 2000,
            currency: 'usd',
          },
        },
      },
      {
        id: 'evt_du1',
        tenant_id: T,
        event_type: 'finance.invoice.draft_updated',
        created_at: '2026-06-01T00:00:03Z',
        payload: {
          invoice: {
            id: 'inv1',
            tenant_id: T,
            status: 'draft',
            total_cents: 1500,
            currency: 'usd',
            updated_at: '2026-06-01T00:00:03Z',
          },
        },
      },
    ];

    worker.replay(events, store);

    const rows = worker.getProjection(T, {}, store);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'inv1');
    assert.equal(rows[1].id, 'inv2');
    // First invoice reflects the UPDATED fields (upsert in place).
    assert.equal(rows[0].total_cents, 1500);
    assert.equal(rows[0].updated_at, '2026-06-01T00:00:03Z');
  });
});
