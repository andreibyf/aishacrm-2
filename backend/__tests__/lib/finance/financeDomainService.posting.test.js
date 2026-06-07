import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';
const actor = { id: 'u1', type: 'human' };

const postedEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.journal.posted');

describe('financeDomainService — journal posting on approval (Cash Flow Slice 2)', () => {
  test('approving a journal-entry approval posts the journal + emits finance.journal.posted + populates the ledger', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulateDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 250000 },
    });
    assert.equal(service.listJournalEntries(TENANT)[0].status, 'pending_approval');

    const res = await service.approveFinanceAction({
      tenantId: TENANT,
      approvalId: sim.approval.id,
      actor,
    });

    const entry = service.listJournalEntries(TENANT).find((e) => e.id === sim.journal_entry.id);
    assert.equal(entry.status, 'posted');
    assert.ok(entry.posted_at);
    assert.equal(entry.posted_by, 'u1');
    assert.ok(res.posted_entry);
    assert.equal(res.posted_entry.status, 'posted');

    const posted = await postedEvents(service);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].payload.journal_entry.status, 'posted');
    assert.equal(posted[0].aggregate_type, 'journal_entry');

    // ledger now reflects the posted entry (AR + Revenue accounts, balanced)
    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 250000);
    assert.equal(ledger.totals.credit_cents, 250000);
    assert.ok(ledger.accounts.find((a) => a.classification === 'Asset'));
    assert.ok(ledger.accounts.find((a) => a.classification === 'Revenue'));
  });

  test('posting is idempotent — re-approving does not double-post', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulateDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 100000 },
    });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor });
    // approval already approved → a second call still emits no second posted event
    // (entry is already 'posted', guarded by status !== 'posted')
    const before = (await postedEvents(service)).length;
    const entry = service.listJournalEntries(TENANT).find((e) => e.id === sim.journal_entry.id);
    assert.equal(entry.status, 'posted');
    assert.equal(before, 1);
  });

  test('posting a reversal marks the source entry reversed → it cannot be reversed again (Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulatePostedDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 250000 },
    });
    const originalId = sim.posted_entry.id;

    // request a reversal of the posted entry, then approve it (posts the reversal)
    const rev = await service.reverseJournalEntry({
      tenantId: TENANT,
      journalEntryId: originalId,
      actor,
    });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: rev.approval.id, actor });

    // the source entry is now 'reversed' (+ a finance.journal.reversed event)
    const original = service.listJournalEntries(TENANT).find((e) => e.id === originalId);
    assert.equal(original.status, 'reversed');
    const reversedEvents = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.journal.reversed',
    );
    assert.equal(reversedEvents.length, 1);
    assert.equal(reversedEvents[0].payload.journal_entry.id, originalId);

    // a SECOND reversal of the same source is now rejected (not posted anymore)
    await assert.rejects(
      () => service.reverseJournalEntry({ tenantId: TENANT, journalEntryId: originalId, actor }),
      (err) => err.statusCode === 409,
    );
  });

  test('two reversals raced from the same posted source — approving the SECOND is rejected, no double-reverse (Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulatePostedDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 250000 },
    });
    const originalId = sim.posted_entry.id;

    // TWO reversal requests created BEFORE either is approved. Both pass the
    // request-time guard because the source is still 'posted' (it only flips to
    // 'reversed' at approval) — so two distinct reversal entries + approvals exist.
    const rev1 = await service.reverseJournalEntry({
      tenantId: TENANT,
      journalEntryId: originalId,
      actor,
    });
    const rev2 = await service.reverseJournalEntry({
      tenantId: TENANT,
      journalEntryId: originalId,
      actor,
    });
    assert.notEqual(rev1.reversal_entry.id, rev2.reversal_entry.id);

    // approve the first → posts rev1, marks the source reversed (reversed_by=rev1)
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: rev1.approval.id, actor });
    const postedAfter1 = (await postedEvents(service)).length;

    // approving the SECOND is rejected — the source is already reversed by rev1
    await assert.rejects(
      () => service.approveFinanceAction({ tenantId: TENANT, approvalId: rev2.approval.id, actor }),
      (err) => err.statusCode === 409,
    );

    // no second posted reversal, source reversed exactly once, ledger nets to zero
    assert.equal((await postedEvents(service)).length, postedAfter1);
    const reversedEvents = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.journal.reversed',
    );
    assert.equal(reversedEvents.length, 1);
    assert.equal(reversedEvents[0].payload.journal_entry.id, originalId);
    // ledger = the sale (250000) + exactly ONE reversal (250000) = 500000, NOT
    // 750000 (a second posted reversal would balance too, so assert the total).
    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 500000);
    assert.equal(ledger.totals.credit_cents, 500000);
  });

  test('CONCURRENT in-memory approvals of two reversals for one source — exactly one posts (synchronous claim, Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulatePostedDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 250000 },
    });
    const originalId = sim.posted_entry.id;
    const rev1 = await service.reverseJournalEntry({
      tenantId: TENANT,
      journalEntryId: originalId,
      actor,
    });
    const rev2 = await service.reverseJournalEntry({
      tenantId: TENANT,
      journalEntryId: originalId,
      actor,
    });

    // Approve BOTH concurrently on the SAME in-memory bucket. The synchronous claim
    // (set before the first await) means whichever approval runs its guard first
    // stakes the source; the other sees the claim and is rejected (409) — neither
    // can post a second reversal.
    const results = await Promise.allSettled([
      service.approveFinanceAction({ tenantId: TENANT, approvalId: rev1.approval.id, actor }),
      service.approveFinanceAction({ tenantId: TENANT, approvalId: rev2.approval.id, actor }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.statusCode, 409);

    // exactly ONE posted reversal (+ the sale), source reversed once, ledger not doubled
    assert.equal((await postedEvents(service)).length, 2);
    const reversed = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.journal.reversed',
    );
    assert.equal(reversed.length, 1);
    assert.equal(service.getLedger(TENANT).totals.debit_cents, 500000);
  });

  test('CROSS-PROCESS reversals of one source — the second APPROVAL collides on the durable PK → 409, no orphaned approved approval (deterministic-id CAS, Codex PR #650 P1)', async () => {
    // Simulate the PERSISTENT race: two requests hydrate SEPARATE buckets (so neither
    // sees the other's in-flight reversal) but append to ONE durable store. The store
    // enforces id-uniqueness like Postgres, so the second reversal's DETERMINISTIC
    // finance.approval.approved id (keyed on the source) collides and is rejected
    // BEFORE the approval is durably recorded — so the loser is never advanced into the
    // approval_queue as "approved" while its reversal stays unpostable. The in-memory
    // claim alone could not catch this (the buckets are independent).
    const seenIds = new Set();
    const events = [];
    const sharedStore = {
      append: async (env) => {
        if (seenIds.has(env.id)) {
          const e = new Error(`duplicate event id ${env.id}`);
          e.code = 'FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID';
          throw e;
        }
        seenIds.add(env.id);
        events.push(env);
        return Object.freeze({ ...env });
      },
      query: async () => events.slice(),
      replay: async () => events.slice(),
    };

    const mkSource = () => ({
      id: 'je_src',
      tenant_id: TENANT,
      status: 'posted',
      currency: 'usd',
      lines: [
        {
          account_id: 'a_cash',
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 250000,
          credit_cents: 0,
        },
        {
          account_id: 'a_rev',
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 250000,
        },
      ],
    });
    const mkReversal = (id) => ({
      id,
      tenant_id: TENANT,
      status: 'pending_approval',
      reversal_of: 'je_src',
      currency: 'usd',
      lines: [
        {
          account_id: 'a_cash',
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 0,
          credit_cents: 250000,
        },
        {
          account_id: 'a_rev',
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 250000,
          credit_cents: 0,
        },
      ],
    });

    // Two independent services (separate buckets) sharing ONE durable store.
    const svcA = createFinanceDomainService({ eventStore: sharedStore });
    const svcB = createFinanceDomainService({ eventStore: sharedStore });
    svcA.seedJournalEntry(mkSource());
    svcA.seedJournalEntry(mkReversal('rev_a'));
    svcA.seedApproval({
      id: 'appr_a',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'rev_a',
      status: 'pending',
    });
    svcB.seedJournalEntry(mkSource());
    svcB.seedJournalEntry(mkReversal('rev_b'));
    svcB.seedApproval({
      id: 'appr_b',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'rev_b',
      status: 'pending',
    });

    // A approves first → approves appr_a (deterministic id = f('je_src')), posts rev_a,
    // reverses source.
    await svcA.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_a', actor });
    // B's bucket still shows je_src posted (independent) → its in-memory claim passes,
    // but the approval-approved append collides on the shared store's PK → 409, BEFORE
    // any approval/posting is durably recorded for appr_b.
    await assert.rejects(
      () => svcB.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_b', actor }),
      (err) => err.statusCode === 409,
    );

    // exactly ONE finance.journal.posted reversal of je_src is durable
    const postedReversals = events.filter(
      (e) =>
        e.event_type === 'finance.journal.posted' &&
        e.payload?.journal_entry?.reversal_of === 'je_src',
    );
    assert.equal(postedReversals.length, 1);
    // and NO orphaned approved approval for the losing reversal: exactly one
    // finance.approval.approved was recorded across both reversal approvals
    const approvedReversalApprovals = events.filter(
      (e) =>
        e.event_type === 'finance.approval.approved' &&
        ['rev_a', 'rev_b'].includes(e.payload?.approval?.target_id),
    );
    assert.equal(approvedReversalApprovals.length, 1);
    assert.equal(approvedReversalApprovals[0].payload.approval.target_id, 'rev_a');
  });

  test('re-approving a fully-posted reversal is idempotent — no second approval event, no error (Codex PR #650 P1)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulatePostedDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 250000 },
    });
    const rev = await service.reverseJournalEntry({
      tenantId: TENANT,
      journalEntryId: sim.posted_entry.id,
      actor,
    });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: rev.approval.id, actor });

    const approvedBefore = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.approval.approved',
    ).length;
    // re-approve the SAME (already-approved) reversal approval — skip-if-approved means
    // no second finance.approval.approved (which would self-collide on the durable id)
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: rev.approval.id, actor });
    const approvedAfter = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.approval.approved',
    ).length;
    assert.equal(approvedAfter, approvedBefore);
    const reversed = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.journal.reversed',
    );
    assert.equal(reversed.length, 1); // still exactly one reversal
  });

  test('re-approving a reversal HEALS the source after a partial append left it posted (Codex PR #650 P2 follow-up)', async () => {
    const service = createFinanceDomainService();
    // Simulate the partial-failure state: the reversal entry is already durably
    // 'posted' (finance.journal.posted landed) but the source is still 'posted'
    // (the finance.journal.reversed append had failed). The reversal approval is
    // still pending → a retry re-approves it.
    service.seedJournalEntry({
      id: 'je_orig',
      tenant_id: TENANT,
      status: 'posted',
      currency: 'usd',
      lines: [
        {
          account_id: 'a_cash',
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 100000,
          credit_cents: 0,
        },
      ],
    });
    service.seedJournalEntry({
      id: 'je_rev',
      tenant_id: TENANT,
      status: 'posted',
      reversal_of: 'je_orig',
      currency: 'usd',
      lines: [
        {
          account_id: 'a_cash',
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 0,
          credit_cents: 100000,
        },
      ],
    });
    service.seedApproval({
      id: 'appr_rev',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'je_rev',
      status: 'pending',
    });

    await service.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_rev', actor });

    // healed: the source is now reversed even though the reversal was already posted (step 1 skipped)
    const orig = service.listJournalEntries(TENANT).find((e) => e.id === 'je_orig');
    assert.equal(orig.status, 'reversed');
    const reversedEvents = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.journal.reversed',
    );
    assert.equal(reversedEvents.length, 1);
  });

  test('a posted journal against a Bank account IS recognized in cash flow (Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    // Debit Bank / Credit Revenue — resolves to the seeded Bank account (type Bank),
    // then approve → posts.
    const sim = await service.simulateDealWon({
      tenantId: TENANT,
      actor,
      payload: {
        amount_cents: 90000,
        lines: [
          { account_name: 'Bank', classification: 'Asset', debit_cents: 90000, credit_cents: 0 },
          {
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 90000,
          },
        ],
      },
    });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor });

    const cf = service.getCashFlow(TENANT);
    assert.equal(cf.totals.inflow_cents, 90000); // bank receipt recognized as cash inflow
    assert.ok(cf.cash_account_codes.includes('1050')); // the seeded Bank account
  });

  test('approving a NON-journal approval does not emit finance.journal.posted', async () => {
    const service = createFinanceDomainService();
    service.seedApproval({
      id: 'approval_x',
      tenant_id: TENANT,
      target_type: 'adapter_job',
      target_id: 'adapter_job_1',
      status: 'pending',
    });
    const res = await service.approveFinanceAction({
      tenantId: TENANT,
      approvalId: 'approval_x',
      actor,
    });
    assert.equal(res.posted_entry, null);
    assert.equal((await postedEvents(service)).length, 0);
  });

  test('an AI actor cannot post (approval is blocked first)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulateDealWon({
      tenantId: TENANT,
      actor,
      payload: { amount_cents: 100000 },
    });
    await assert.rejects(
      () =>
        service.approveFinanceAction({
          tenantId: TENANT,
          approvalId: sim.approval.id,
          actor: { id: 'bot', type: 'ai_agent' },
        }),
      (err) => err.statusCode === 403,
    );
    assert.equal((await postedEvents(service)).length, 0);
    assert.equal(service.listJournalEntries(TENANT)[0].status, 'pending_approval');
  });

  test('approving refreshes the LINKED adapter-job payload from the re-canonicalized entry (Codex PR #651 P2)', async () => {
    const service = createFinanceDomainService();
    const acct = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Stripe', classification: 'Asset', account_type: 'Bank' },
    });
    const sim = await service.simulateDealWon({
      tenantId: TENANT,
      actor,
      payload: {
        amount_cents: 5000,
        lines: [
          {
            account_id: acct.id,
            account_name: 'Stripe',
            classification: 'Asset',
            debit_cents: 5000,
            credit_cents: 0,
          },
          {
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 5000,
          },
        ],
      },
    });
    // rename the account while the simulated deal is still pending (no posted history)
    await service.updateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { name: 'Stripe Payouts' },
    });

    await service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor });

    // the queued adapter job's canonical payload (carried on finance.adapter.sync_queued)
    // reflects the CURRENT account name, not the draft snapshot
    const queued = (await service.listAuditEvents(TENANT)).find(
      (e) => e.event_type === 'finance.adapter.sync_queued',
    );
    assert.ok(queued, 'a linked adapter job was queued');
    const lines = queued.payload.adapter_job.payload.lines;
    assert.ok(
      lines.some((l) => l.account_ref?.name === 'Stripe Payouts'),
      'adapter payload carries the renamed account',
    );
    assert.ok(
      !lines.some((l) => l.account_ref?.name === 'Stripe'),
      'no stale draft-time account name in the adapter payload',
    );
  });

  test('HEAL-RETRY: re-approving an ALREADY-posted entry still refreshes a stranded draft adapter job (Codex PR #651 P2)', async () => {
    // Partial-failure state: the journal posted durably (entry is already 'posted'
    // with canonical lines) but the process crashed BEFORE the promoter ran, so the
    // linked adapter job is still 'draft' carrying its PRE-EDIT payload. The retry
    // re-approves the (still-pending) approval. The fix must refresh the stranded
    // draft from the posted entry — keyed off the posted entry, not the this-call
    // `postedEntry` (null here, since step 1 is skipped) — before the unconditional
    // promoter queues it. Otherwise the provider would sync the stale account name.
    const service = createFinanceDomainService();
    service.seedJournalEntry({
      id: 'je_heal',
      tenant_id: TENANT,
      status: 'posted', // already posted (step 1 will be skipped on re-approval)
      currency: 'usd',
      lines: [
        // canonical lines reflect the CURRENT (renamed) account, as the posted event would
        {
          account_id: 'acct_pay',
          account_name: 'Stripe Payouts',
          classification: 'Asset',
          debit_cents: 5000,
          credit_cents: 0,
        },
        {
          account_id: 'acct_rev',
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 5000,
        },
      ],
    });
    // the stranded draft adapter job still carries the PRE-EDIT account name
    service.seedAdapterJob({
      id: 'job_heal',
      tenant_id: TENANT,
      provider: 'quickbooks',
      aggregate_type: 'journal_entry',
      aggregate_id: 'je_heal',
      operation: 'create',
      mode: 'test',
      status: 'draft',
      payload: {
        lines: [{ account_ref: { id: 'acct_pay', name: 'Stripe' }, classification: 'Asset' }],
      },
    });
    service.seedApproval({
      id: 'appr_heal',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'je_heal',
      status: 'pending',
    });

    const res = await service.approveFinanceAction({
      tenantId: TENANT,
      approvalId: 'appr_heal',
      actor,
    });
    // step 1 was skipped (already posted), so this call posted nothing
    assert.equal(res.posted_entry, null, 'no fresh post on the heal-retry');

    const queued = (await service.listAuditEvents(TENANT)).find(
      (e) => e.event_type === 'finance.adapter.sync_queued',
    );
    assert.ok(queued, 'the stranded draft was promoted on the heal-retry');
    const lines = queued.payload.adapter_job.payload.lines;
    assert.ok(
      lines.some((l) => l.account_ref?.name === 'Stripe Payouts'),
      'refreshed from the posted entry',
    );
    assert.ok(
      !lines.some((l) => l.account_ref?.name === 'Stripe'),
      'no stale pre-edit account name survives the heal-retry',
    );
  });

  test('refreshes EVERY linked draft (multi-provider) — the re-map loop covers all, not just the first (Codex PR #651 P2)', async () => {
    // A journal entry can have more than one linked adapter job (e.g. one per
    // provider). The re-canonicalization loop must refresh ALL of them, and each
    // must own a CLONE of the canonical payload (no shared reference that a later
    // in-place mutation on one job could leak into the others). Reference identity
    // isn't observable through the cloning read APIs, so this asserts the observable
    // half: BOTH linked drafts are queued carrying the renamed account.
    const service = createFinanceDomainService();
    service.seedJournalEntry({
      id: 'je_multi',
      tenant_id: TENANT,
      status: 'posted',
      currency: 'usd',
      lines: [
        {
          account_id: 'acct_pay',
          account_name: 'Stripe Payouts',
          classification: 'Asset',
          debit_cents: 5000,
          credit_cents: 0,
        },
        {
          account_id: 'acct_rev',
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 5000,
        },
      ],
    });
    for (const provider of ['quickbooks', 'xero']) {
      service.seedAdapterJob({
        id: `job_${provider}`,
        tenant_id: TENANT,
        provider,
        aggregate_type: 'journal_entry',
        aggregate_id: 'je_multi',
        operation: 'create',
        mode: 'test',
        status: 'draft',
        payload: {
          lines: [{ account_ref: { id: 'acct_pay', name: 'Stripe' }, classification: 'Asset' }],
        },
      });
    }
    service.seedApproval({
      id: 'appr_multi',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'je_multi',
      status: 'pending',
    });

    await service.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_multi', actor });

    const queued = (await service.listAuditEvents(TENANT)).filter(
      (e) => e.event_type === 'finance.adapter.sync_queued',
    );
    assert.equal(queued.length, 2, 'both linked drafts were promoted');
    for (const ev of queued) {
      const lines = ev.payload.adapter_job.payload.lines;
      assert.ok(
        lines.some((l) => l.account_ref?.name === 'Stripe Payouts'),
        `${ev.payload.adapter_job.provider} refreshed to the renamed account`,
      );
      assert.ok(
        !lines.some((l) => l.account_ref?.name === 'Stripe'),
        `${ev.payload.adapter_job.provider} carries no stale name`,
      );
    }
  });

  test('approving a pending journal RE-CANONICALIZES line metadata against the current account (Codex PR #651 P2)', async () => {
    const service = createFinanceDomainService();
    const acct = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Foo', classification: 'Asset', account_type: 'Asset' },
    });
    service.seedJournalEntry({
      id: 'je_meta',
      tenant_id: TENANT,
      status: 'pending_approval',
      currency: 'usd',
      lines: [
        {
          account_id: acct.id,
          account_code: acct.account_code,
          account_name: 'Foo',
          classification: 'Asset',
          debit_cents: 5000,
          credit_cents: 0,
        },
        {
          account_id: 'a_rev',
          account_code: '4000',
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 5000,
        },
      ],
    });
    service.seedApproval({
      id: 'appr_meta',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'je_meta',
      status: 'pending',
    });

    // no posted history → full edit allowed: rename + reclassify + recode BEFORE posting
    await service.updateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: {
        name: 'Bar',
        classification: 'Liability',
        account_type: 'Liability',
        account_code: '2099',
      },
    });

    await service.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_meta', actor });

    // the posted line reflects the CURRENT account metadata, not the stale draft snapshot
    const posted = (await service.listAuditEvents(TENANT)).find(
      (e) =>
        e.event_type === 'finance.journal.posted' && e.payload?.journal_entry?.id === 'je_meta',
    );
    const line = posted.payload.journal_entry.lines.find((l) => l.account_id === acct.id);
    assert.equal(line.account_name, 'Bar');
    assert.equal(line.classification, 'Liability');
    assert.equal(line.account_code, '2099');
  });

  test('approving a pending journal that posts to a DEACTIVATED account is rejected at the posting boundary (Codex PR #651 P2)', async () => {
    const service = createFinanceDomainService();
    const acct = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Pending Acct', classification: 'Asset', account_type: 'Bank' },
    });
    // a PENDING (unposted) journal referencing the account → posted balance stays 0
    service.seedJournalEntry({
      id: 'je_pending',
      tenant_id: TENANT,
      status: 'pending_approval',
      currency: 'usd',
      lines: [
        {
          account_id: acct.id,
          account_name: 'Pending Acct',
          classification: 'Asset',
          debit_cents: 5000,
          credit_cents: 0,
        },
        {
          account_id: 'a_rev',
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 5000,
        },
      ],
    });
    service.seedApproval({
      id: 'appr_pending',
      tenant_id: TENANT,
      target_type: 'journal_entry',
      target_id: 'je_pending',
      status: 'pending',
    });

    // deactivation is allowed (zero POSTED balance) even though a pending draft references it
    await service.deactivateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { reason: 'closing' },
    });

    // approving the pending journal must now be refused — it would post to an inactive account
    await assert.rejects(
      () => service.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_pending', actor }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_ACCOUNT_INACTIVE',
    );
    // nothing posted, and the rejection happened BEFORE the approval was recorded (no orphan)
    assert.equal((await postedEvents(service)).length, 0);
    const approved = (await service.listAuditEvents(TENANT)).filter(
      (e) =>
        e.event_type === 'finance.approval.approved' && e.payload?.approval?.id === 'appr_pending',
    );
    assert.equal(approved.length, 0);
  });
});
