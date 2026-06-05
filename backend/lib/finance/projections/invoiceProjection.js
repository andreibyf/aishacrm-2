/**
 * invoiceProjection.js
 *
 * Phase 4-1 persistent reads+writes migration — the draft-invoice projection.
 * Materializes draft invoices from the event stream so the persistent-mode
 * invoice read matches the in-memory `bucket.invoices` array, mirroring
 * journalEntriesProjection.js.
 *
 * Event sources (see financeDomainService.js): both
 * `finance.invoice.draft_created` and `finance.invoice.draft_updated` carry a
 * `{ invoice: {...} }` payload with the FULL post-transition invoice (with an
 * `id`). We upsert the full snapshot by `invoice.id` — Map.set on an existing
 * key updates in place, preserving insertion order to mirror the in-memory
 * array.
 */

export const INVOICE_PROJECTION_NAME = 'finance.projection.invoices';

// Both events create-or-update the same invoice aggregate; their payloads carry
// the authoritative post-transition invoice snapshot.
const CONSUMED_EVENTS = ['finance.invoice.draft_created', 'finance.invoice.draft_updated'];

// The invoice snapshot lives under `payload.invoice` for both event types.
function invoiceFromEvent(event) {
  const payload = event?.payload || {};
  return payload.invoice || null;
}

function applyEvent(event, store) {
  const invoice = invoiceFromEvent(event);
  if (invoice && invoice.id) {
    // Upsert the full invoice snapshot — Map.set on an existing key updates in
    // place, preserving insertion order to mirror the in-memory array.
    store.set(invoice.id, invoice);
  }
}

export function createInvoiceProjectionWorker() {
  return {
    projectionName: INVOICE_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,

    handleEvent(event, store) {
      applyEvent(event, store);
    },

    replay(events, store) {
      for (const event of events) {
        applyEvent(event, store);
      }
    },

    // Returns the invoice list in insertion order, mirroring the in-memory
    // `bucket.invoices` array.
    getProjection(_tenantId, _opts, store) {
      return store.keys().map((key) => store.get(key));
    },
  };
}

export default createInvoiceProjectionWorker;
