/**
 * Shared supabase mock for billing service unit tests.
 *
 * Simulates a single-table in-memory store with just enough of the
 * Supabase JS query builder surface to exercise billing services.
 *
 * Supported chain shapes:
 *   from(t).select(...).eq(col, v).[maybe]Single()
 *   from(t).select(...).eq(col, v).neq(col, v).order(...).limit(n).maybeSingle()
 *   from(t).select(..., {count:'exact', head:true}).eq(col,v).gte(col,v)
 *   from(t).insert(row).select('*').single()
 *   from(t).update(row).eq(col,v).select('*').single()
 *   from(t).update(row).eq(col,v).in(col,[...])
 *   from(t).delete().eq(col,v)
 *
 * Not intended to be a general-purpose mock -- only what billing code calls.
 */

export function createBillingMock(initial = {}) {
  // Shallow-clone tables so tests can't bleed state
  const db = {};
  for (const [k, v] of Object.entries(initial)) {
    db[k] = Array.isArray(v) ? v.map((r) => ({ ...r })) : [];
  }
  const ensure = (t) => {
    if (!db[t]) db[t] = [];
    return db[t];
  };

  function applyFilters(rows, filters) {
    return rows.filter((r) => {
      for (const f of filters) {
        if (f.op === 'eq' && r[f.col] !== f.val) return false;
        if (f.op === 'neq' && r[f.col] === f.val) return false;
        if (f.op === 'in' && !f.val.includes(r[f.col])) return false;
        if (f.op === 'gte' && !(r[f.col] >= f.val)) return false;
        if (f.op === 'lte' && !(r[f.col] <= f.val)) return false;
        if (f.op === 'gt' && !(r[f.col] > f.val)) return false;
      }
      return true;
    });
  }

  function genId() {
    return 'mock-' + Math.random().toString(36).slice(2, 10);
  }

  function makeSelectChain(table, { headCount = false } = {}) {
    const filters = [];
    let orderBy = null;
    let orderDir = 'asc';
    let limit = null;

    const thenable = {
      eq(col, val) {
        filters.push({ op: 'eq', col, val });
        return thenable;
      },
      neq(col, val) {
        filters.push({ op: 'neq', col, val });
        return thenable;
      },
      in(col, val) {
        filters.push({ op: 'in', col, val });
        return thenable;
      },
      gte(col, val) {
        filters.push({ op: 'gte', col, val });
        return thenable;
      },
      lte(col, val) {
        filters.push({ op: 'lte', col, val });
        return thenable;
      },
      gt(col, val) {
        filters.push({ op: 'gt', col, val });
        return thenable;
      },
      order(col, opts = {}) {
        orderBy = col;
        orderDir = opts.ascending === false ? 'desc' : 'asc';
        return thenable;
      },
      limit(n) {
        limit = n;
        return thenable;
      },
      async single() {
        let rows = applyFilters(ensure(table), filters);
        if (rows.length === 0) return { data: null, error: { message: 'no rows' } };
        if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } };
        return { data: { ...rows[0] }, error: null };
      },
      async maybeSingle() {
        let rows = applyFilters(ensure(table), filters);
        if (orderBy) {
          rows = [...rows].sort((a, b) => (a[orderBy] > b[orderBy] ? 1 : -1));
          if (orderDir === 'desc') rows.reverse();
        }
        if (limit) rows = rows.slice(0, limit);
        return { data: rows[0] ? { ...rows[0] } : null, error: null };
      },
      async then(resolve) {
        let rows = applyFilters(ensure(table), filters);
        if (headCount) {
          return resolve({ count: rows.length, error: null });
        }
        if (orderBy) {
          rows = [...rows].sort((a, b) => (a[orderBy] > b[orderBy] ? 1 : -1));
          if (orderDir === 'desc') rows.reverse();
        }
        if (limit) rows = rows.slice(0, limit);
        return resolve({ data: rows.map((r) => ({ ...r })), error: null });
      },
    };
    return thenable;
  }

  const client = {
    db,
    from(table) {
      return {
        select(_cols, opts = {}) {
          return makeSelectChain(table, { headCount: !!opts.head });
        },
        insert(rowOrRows) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          // Enforce simple uniqueness rules that the billing code depends on
          if (table === 'billing_accounts') {
            for (const r of rows) {
              if (ensure(table).some((x) => x.tenant_id === r.tenant_id)) {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: { code: '23505', message: 'duplicate key' },
                    }),
                  }),
                };
              }
            }
          }
          if (table === 'payments') {
            for (const r of rows) {
              if (
                r.provider_payment_intent_id &&
                ensure(table).some(
                  (x) => x.provider_payment_intent_id === r.provider_payment_intent_id,
                )
              ) {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: { code: '23505', message: 'duplicate payment_intent' },
                    }),
                  }),
                };
              }
            }
          }
          const stamped = rows.map((r) => ({
            id: r.id || genId(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            amount_paid_cents: 0,
            ...r,
          }));
          ensure(table).push(...stamped);
          return {
            select: () => ({
              single: async () => ({ data: { ...stamped[0] }, error: null }),
              then: (resolve) => resolve({ data: stamped.map((r) => ({ ...r })), error: null }),
            }),
          };
        },

        update(patch) {
          const filters = [];
          const chain = {
            eq(col, val) {
              filters.push({ op: 'eq', col, val });
              return chain;
            },
            neq(col, val) {
              filters.push({ op: 'neq', col, val });
              return chain;
            },
            in(col, val) {
              filters.push({ op: 'in', col, val });
              return chain;
            },
            select: () => ({
              single: async () => {
                const rows = applyFilters(ensure(table), filters);
                if (rows.length === 0) return { data: null, error: { message: 'no rows' } };
                Object.assign(rows[0], patch, { updated_at: new Date().toISOString() });
                return { data: { ...rows[0] }, error: null };
              },
              then: (resolve) => {
                const rows = applyFilters(ensure(table), filters);
                rows.forEach((r) =>
                  Object.assign(r, patch, { updated_at: new Date().toISOString() }),
                );
                resolve({ data: rows.map((r) => ({ ...r })), error: null });
              },
            }),
            then(resolve) {
              const rows = applyFilters(ensure(table), filters);
              rows.forEach((r) =>
                Object.assign(r, patch, { updated_at: new Date().toISOString() }),
              );
              resolve({ data: null, error: null });
            },
          };
          return chain;
        },
        delete() {
          const filters = [];
          const chain = {
            eq(col, val) {
              filters.push({ op: 'eq', col, val });
              return chain;
            },
            neq(col, val) {
              filters.push({ op: 'neq', col, val });
              return chain;
            },
            in(col, val) {
              filters.push({ op: 'in', col, val });
              return chain;
            },
            is(col, val) {
              filters.push({ op: 'eq', col, val });
              return chain;
            },
            then(resolve) {
              const arr = ensure(table);
              const remaining = arr.filter((r) => !applyFilters([r], filters).length);
              db[table] = remaining;
              resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return client;
}
