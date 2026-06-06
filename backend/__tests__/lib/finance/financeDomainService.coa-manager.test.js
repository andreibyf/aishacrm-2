import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';
const actor = { id: 'u1', type: 'human' };
const aiActor = { id: 'bot', type: 'ai_agent' };

const createdEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.account.created');

const updatedEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.account.updated');

const deactivatedEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.account.deactivated');

// Seed a journal entry directly into the bucket with a given status + lines so the
// helpers (__hasPostedHistory / __accountBalanceCents) have posted/reversed history
// to fold over. Mirrors the posting test's seedJournalEntry usage.
const seedEntry = (service, { id, status, lines }) =>
  service.seedJournalEntry({ id, tenant_id: TENANT, status, currency: 'usd', lines });

describe('financeDomainService — COA helpers (Task 5)', () => {
  test('hasPostedHistory is true when a posted entry has a line for the account, false otherwise', () => {
    const service = createFinanceDomainService();
    seedEntry(service, {
      id: 'je_posted',
      status: 'posted',
      lines: [
        { account_id: 'acct_X', account_name: 'X', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
        { account_id: 'acct_Y', account_name: 'Y', classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
      ],
    });
    const bucket = service.__getBucket(TENANT);

    assert.equal(service.__hasPostedHistory(bucket, 'acct_X'), true);
    assert.equal(service.__hasPostedHistory(bucket, 'acct_Y'), true);
    assert.equal(service.__hasPostedHistory(bucket, 'acct_NEVER'), false);
  });

  test('hasPostedHistory counts reversed entries too, but ignores draft / pending_approval', () => {
    const service = createFinanceDomainService();
    seedEntry(service, {
      id: 'je_reversed',
      status: 'reversed',
      lines: [{ account_id: 'acct_R', account_name: 'R', classification: 'Asset', debit_cents: 1000, credit_cents: 0 }],
    });
    seedEntry(service, {
      id: 'je_draft',
      status: 'draft',
      lines: [{ account_id: 'acct_D', account_name: 'D', classification: 'Asset', debit_cents: 2000, credit_cents: 0 }],
    });
    seedEntry(service, {
      id: 'je_pending',
      status: 'pending_approval',
      lines: [{ account_id: 'acct_P', account_name: 'P', classification: 'Asset', debit_cents: 3000, credit_cents: 0 }],
    });
    const bucket = service.__getBucket(TENANT);

    assert.equal(service.__hasPostedHistory(bucket, 'acct_R'), true); // reversed counts
    assert.equal(service.__hasPostedHistory(bucket, 'acct_D'), false); // draft does not
    assert.equal(service.__hasPostedHistory(bucket, 'acct_P'), false); // pending does not
  });

  test('accountBalanceCents nets debit − credit over posted + reversed lines, ignoring non-posted', () => {
    const service = createFinanceDomainService();
    // posted: +7000 debit
    seedEntry(service, {
      id: 'je_1',
      status: 'posted',
      lines: [{ account_id: 'acct_A', account_name: 'A', classification: 'Asset', debit_cents: 7000, credit_cents: 0 }],
    });
    // posted: −2500 (credit)
    seedEntry(service, {
      id: 'je_2',
      status: 'posted',
      lines: [{ account_id: 'acct_A', account_name: 'A', classification: 'Asset', debit_cents: 0, credit_cents: 2500 }],
    });
    // reversed: +500 debit (still counted)
    seedEntry(service, {
      id: 'je_3',
      status: 'reversed',
      lines: [{ account_id: 'acct_A', account_name: 'A', classification: 'Asset', debit_cents: 500, credit_cents: 0 }],
    });
    // draft: must be ignored
    seedEntry(service, {
      id: 'je_4',
      status: 'draft',
      lines: [{ account_id: 'acct_A', account_name: 'A', classification: 'Asset', debit_cents: 99999, credit_cents: 0 }],
    });
    const bucket = service.__getBucket(TENANT);

    // 7000 − 2500 + 500 = 5000
    assert.equal(service.__accountBalanceCents(bucket, 'acct_A'), 5000);
    // an account with no posted lines nets to 0
    assert.equal(service.__accountBalanceCents(bucket, 'acct_NONE'), 0);
  });
});

describe('financeDomainService — createAccount (Task 6)', () => {
  test('happy path: creates a manual account, returns it, lists it, emits finance.account.created (source:manual)', async () => {
    const service = createFinanceDomainService();
    const account = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Operating Bank', classification: 'Asset', account_type: 'Bank' },
    });

    assert.equal(account.name, 'Operating Bank');
    assert.equal(account.classification, 'Asset');
    assert.equal(account.account_type, 'Bank');
    assert.equal(account.source, 'manual');
    assert.equal(account.is_system, false);
    assert.equal(account.is_active, true);
    assert.ok(account.account_code, 'account_code is auto-assigned');
    assert.ok(account.id, 'id is minted');

    // appears in listAccounts
    const listed = service.listAccounts(TENANT).find((a) => a.id === account.id);
    assert.ok(listed, 'created account is in the chart');
    assert.equal(listed.account_type, 'Bank');

    // exactly one finance.account.created event with the FLAT manual payload
    const events = await createdEvents(service);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.aggregate_type, 'account');
    assert.equal(ev.aggregate_id, account.id);
    assert.equal(ev.payload.source, 'manual');
    assert.equal(ev.payload.is_system, false);
    assert.equal(ev.payload.account_id, account.id);
    assert.equal(ev.payload.account_code, account.account_code);
    assert.equal(ev.payload.name, 'Operating Bank');
    assert.equal(ev.payload.classification, 'Asset');
    assert.equal(ev.payload.account_type, 'Bank');
    assert.ok(ev.payload.match_key, 'match_key is present');
  });

  test('rejects an invalid classification (not in the 5-value enum) with 400 FINANCE_COA_INVALID_CLASSIFICATION', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: 'Weird', classification: 'NotAClass', account_type: 'Asset' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_INVALID_CLASSIFICATION',
    );
    assert.equal((await createdEvents(service)).length, 0);
  });

  test('rejects an invalid account_type (not curated) with 400 FINANCE_COA_INVALID_ACCOUNT_TYPE', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: 'Weird', classification: 'Asset', account_type: 'Bogus' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_INVALID_ACCOUNT_TYPE',
    );
    assert.equal((await createdEvents(service)).length, 0);
  });

  test('rejects a curated type that is wrong for the classification (Bank on Revenue) with 400 FINANCE_COA_INVALID_ACCOUNT_TYPE', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: 'Sales Bank', classification: 'Revenue', account_type: 'Bank' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_INVALID_ACCOUNT_TYPE',
    );
    assert.equal((await createdEvents(service)).length, 0);
  });

  test('rejects a duplicate normalized (classification, name) with 409 FINANCE_COA_DUPLICATE_NAME', async () => {
    const service = createFinanceDomainService();
    // 'Cash' (Asset) is a seeded baseline account — a case/space-insensitive match must conflict.
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: '  cash  ', classification: 'Asset', account_type: 'Asset' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_DUPLICATE_NAME',
    );
    assert.equal((await createdEvents(service)).length, 0);
  });

  test('rejects a duplicate of a previously-created manual account', async () => {
    const service = createFinanceDomainService();
    await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Consulting Income', classification: 'Revenue', account_type: 'Revenue' },
    });
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: 'CONSULTING INCOME', classification: 'Revenue', account_type: 'Revenue' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_DUPLICATE_NAME',
    );
    // only the first create emitted an event
    assert.equal((await createdEvents(service)).length, 1);
  });

  test('rejects an empty name with 400 FINANCE_COA_INVALID_NAME and NO event is emitted', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: '', classification: 'Asset', account_type: 'Asset' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_INVALID_NAME',
    );
    assert.equal((await createdEvents(service)).length, 0);
    // nothing landed in the chart under the fragmenting 'Unnamed' fallback either
    assert.equal(
      service.listAccounts(TENANT).some((a) => a.name === 'Unnamed'),
      false,
    );
  });

  test('rejects a whitespace-only name with 400 FINANCE_COA_INVALID_NAME and NO event is emitted', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: '   ', classification: 'Asset', account_type: 'Asset' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_INVALID_NAME',
    );
    assert.equal((await createdEvents(service)).length, 0);
    assert.equal(
      service.listAccounts(TENANT).some((a) => a.name === 'Unnamed'),
      false,
    );
  });

  test('an ai_agent actor is blocked with 403 FINANCE_COA_AI_FORBIDDEN and NO event is emitted', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor: aiActor,
          payload: { name: 'AI Account', classification: 'Asset', account_type: 'Asset' },
        }),
      (err) => err.statusCode === 403 && err.code === 'FINANCE_COA_AI_FORBIDDEN',
    );
    assert.equal((await createdEvents(service)).length, 0);
    // nothing landed in the chart either
    assert.equal(
      service.listAccounts(TENANT).some((a) => a.name === 'AI Account'),
      false,
    );
  });
});

// Helper: create a manual account and return it (minted id + auto code).
const makeAccount = (service, payload) =>
  service.createAccount({ tenantId: TENANT, actor, payload });

// Helper: seed one posted journal line against an account id so it has posted
// history (and a balance). Posts +amount debit by default.
const postLine = (service, accountId, { id = `je_${accountId}`, debit = 1000, credit = 0, status = 'posted' } = {}) =>
  seedEntry(service, {
    id,
    status,
    lines: [{ account_id: accountId, account_name: 'X', classification: 'Asset', debit_cents: debit, credit_cents: credit }],
  });

describe('financeDomainService — updateAccount (Task 7)', () => {
  test('no-history full edit: name + classification + account_code + account_type all change', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Misc Asset', classification: 'Asset', account_type: 'Asset' });

    const updated = await service.updateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { name: 'Service Revenue', classification: 'Revenue', account_code: '4567', account_type: 'Revenue' },
    });

    assert.equal(updated.id, acct.id, 'identity is immutable');
    assert.equal(updated.name, 'Service Revenue');
    assert.equal(updated.classification, 'Revenue');
    assert.equal(updated.account_code, '4567');
    assert.equal(updated.account_type, 'Revenue');
    assert.equal(updated.is_system, false);
    assert.equal(updated.is_active, true);

    // listed reflects the edit
    const listed = service.listAccounts(TENANT).find((a) => a.id === acct.id);
    assert.equal(listed.name, 'Service Revenue');
    assert.equal(listed.classification, 'Revenue');

    // one finance.account.updated event with the FULL snapshot under payload.account
    const events = await updatedEvents(service);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.aggregate_type, 'account');
    assert.equal(ev.aggregate_id, acct.id);
    assert.equal(ev.payload.account.id, acct.id);
    assert.equal(ev.payload.account.name, 'Service Revenue');
    assert.equal(ev.payload.account.classification, 'Revenue');
    assert.equal(ev.payload.account.account_code, '4567');
    assert.equal(ev.payload.account.account_type, 'Revenue');
    assert.equal(ev.payload.account.is_system, false);
    assert.equal(ev.payload.account.is_active, true);
  });

  test('posted-history account allows name + account_type change WITH a reason', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Operating', classification: 'Asset', account_type: 'Asset' });
    postLine(service, acct.id);

    const updated = await service.updateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { name: 'Operating Bank', account_type: 'Bank', reason: 'mark as bank for cash flow' },
    });

    assert.equal(updated.name, 'Operating Bank');
    assert.equal(updated.account_type, 'Bank');
    assert.equal(updated.classification, 'Asset', 'classification unchanged');

    const events = await updatedEvents(service);
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.reason, 'mark as bank for cash flow');
  });

  test('posted-history account rejects a classification change with 409 FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Has History', classification: 'Asset', account_type: 'Asset' });
    postLine(service, acct.id);

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { classification: 'Expense', account_type: 'Expense', reason: 'whatever' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('posted-history account rejects an account_code change with 409 FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Has History 2', classification: 'Asset', account_type: 'Asset' });
    postLine(service, acct.id);

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { account_code: '1599', reason: 'renumber' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('posted-history change WITHOUT a reason is rejected with 400 FINANCE_COA_REASON_REQUIRED', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Needs Reason', classification: 'Asset', account_type: 'Asset' });
    postLine(service, acct.id);

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { name: 'Renamed No Reason' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_REASON_REQUIRED',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('a system account is fully locked: 409 FINANCE_COA_SYSTEM_ACCOUNT_LOCKED on any field', async () => {
    const service = createFinanceDomainService();
    // 'Cash' (1000) is a seeded system account.
    const cash = service.listAccounts(TENANT).find((a) => a.account_code === '1000');
    assert.ok(cash && cash.is_system, 'Cash is a seeded system account');

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: cash.id,
          payload: { name: 'My Cash' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_SYSTEM_ACCOUNT_LOCKED',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('an unknown account id is 404 FINANCE_COA_ACCOUNT_NOT_FOUND', async () => {
    const service = createFinanceDomainService();
    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: 'acct_does_not_exist',
          payload: { name: 'Ghost' },
        }),
      (err) => err.statusCode === 404 && err.code === 'FINANCE_COA_ACCOUNT_NOT_FOUND',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('renaming onto another account name collides with 409 FINANCE_COA_DUPLICATE_NAME', async () => {
    const service = createFinanceDomainService();
    await makeAccount(service, { name: 'Alpha Revenue', classification: 'Revenue', account_type: 'Revenue' });
    const beta = await makeAccount(service, { name: 'Beta Revenue', classification: 'Revenue', account_type: 'Revenue' });

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: beta.id,
          payload: { name: 'alpha revenue' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_DUPLICATE_NAME',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('renaming a no-history account stores the CANONICAL (whitespace-collapsed) name, not the raw input', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Misc', classification: 'Asset', account_type: 'Asset' });

    const updated = await service.updateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { name: '  Spaced    Name  ' },
    });

    // The stored / returned name is the canonical form (trim + collapse runs of
    // whitespace), matching what createAccount would have stored.
    assert.equal(updated.name, 'Spaced Name');

    // listAccounts reflects the canonical name too.
    const listed = service.listAccounts(TENANT).find((a) => a.id === acct.id);
    assert.equal(listed.name, 'Spaced Name');

    // The emitted finance.account.updated snapshot carries the canonical name.
    const events = await updatedEvents(service);
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.account.name, 'Spaced Name');
  });

  test('changing account_code onto a code already held by ANOTHER account is 409 FINANCE_COA_DUPLICATE_CODE', async () => {
    const service = createFinanceDomainService();
    const a = await makeAccount(service, { name: 'Code A', classification: 'Revenue', account_type: 'Revenue' });
    const b = await makeAccount(service, { name: 'Code B', classification: 'Revenue', account_type: 'Revenue' });

    // No posted history on `a`, so account_code is editable — but the target code
    // is already held by `b`, so it must collide.
    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: a.id,
          payload: { account_code: b.account_code },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_DUPLICATE_CODE',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('an invalid effective account_type for the classification is 400 FINANCE_COA_INVALID_ACCOUNT_TYPE (Bank on Revenue)', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Sales', classification: 'Revenue', account_type: 'Revenue' });

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { account_type: 'Bank' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_INVALID_ACCOUNT_TYPE',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('an ai_agent actor is blocked with 403 FINANCE_COA_AI_FORBIDDEN and NO event', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Guarded', classification: 'Asset', account_type: 'Asset' });

    await assert.rejects(
      () =>
        service.updateAccount({
          tenantId: TENANT,
          actor: aiActor,
          accountId: acct.id,
          payload: { name: 'AI Renamed' },
        }),
      (err) => err.statusCode === 403 && err.code === 'FINANCE_COA_AI_FORBIDDEN',
    );
    assert.equal((await updatedEvents(service)).length, 0);
    assert.equal(service.listAccounts(TENANT).find((a) => a.id === acct.id).name, 'Guarded');
  });
});

describe('financeDomainService — deactivateAccount (Task 8)', () => {
  test('success: deactivates an account (is_active false, one deactivated event)', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'To Close', classification: 'Asset', account_type: 'Asset' });

    const result = await service.deactivateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { reason: 'no longer used' },
    });

    assert.equal(result.id, acct.id);
    assert.equal(result.is_active, false);

    const listed = service.listAccounts(TENANT).find((a) => a.id === acct.id);
    assert.equal(listed.is_active, false);

    const events = await deactivatedEvents(service);
    assert.equal(events.length, 1);
    assert.equal(events[0].aggregate_id, acct.id);
    assert.equal(events[0].payload.account_id, acct.id);
    assert.equal(events[0].payload.reason, 'no longer used');
  });

  test('a system account cannot be deactivated: 409 FINANCE_COA_SYSTEM_ACCOUNT_LOCKED', async () => {
    const service = createFinanceDomainService();
    const cash = service.listAccounts(TENANT).find((a) => a.account_code === '1000');

    await assert.rejects(
      () =>
        service.deactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: cash.id,
          payload: { reason: 'x' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_SYSTEM_ACCOUNT_LOCKED',
    );
    assert.equal((await deactivatedEvents(service)).length, 0);
  });

  test('a nonzero posted balance blocks deactivation: 409 FINANCE_COA_DEACTIVATE_NONZERO_BALANCE', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Has Balance', classification: 'Asset', account_type: 'Asset' });
    postLine(service, acct.id, { debit: 5000, credit: 0 });

    await assert.rejects(
      () =>
        service.deactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { reason: 'try close' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_DEACTIVATE_NONZERO_BALANCE',
    );
    assert.equal((await deactivatedEvents(service)).length, 0);
  });

  test('a missing reason is rejected with 400 FINANCE_COA_REASON_REQUIRED', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'No Reason Close', classification: 'Asset', account_type: 'Asset' });

    await assert.rejects(
      () =>
        service.deactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { reason: '   ' },
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_REASON_REQUIRED',
    );
    assert.equal((await deactivatedEvents(service)).length, 0);
  });

  test('deactivating an already-inactive account is an idempotent no-op (returns ok, NO second event)', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Double Close', classification: 'Asset', account_type: 'Asset' });
    await service.deactivateAccount({ tenantId: TENANT, actor, accountId: acct.id, payload: { reason: 'close once' } });
    assert.equal((await deactivatedEvents(service)).length, 1);

    // Second deactivation: no-op. reason is NOT required for the no-op path.
    const again = await service.deactivateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: {},
    });
    assert.equal(again.id, acct.id);
    assert.equal(again.is_active, false);
    assert.equal((await deactivatedEvents(service)).length, 1, 'no second deactivated event');
  });
});

describe('financeDomainService — reactivateAccount (Task 9)', () => {
  test('success: reactivates an inactive account, same id preserved, is_active true, dedicated finance.account.reactivated emitted', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Comeback', classification: 'Asset', account_type: 'Asset' });
    await service.deactivateAccount({ tenantId: TENANT, actor, accountId: acct.id, payload: { reason: 'close' } });

    const result = await service.reactivateAccount({
      tenantId: TENANT,
      actor,
      accountId: acct.id,
      payload: { reason: 'reopen' },
    });

    assert.equal(result.id, acct.id, 'id preserved');
    assert.equal(result.is_active, true);

    const listed = service.listAccounts(TENANT).find((a) => a.id === acct.id);
    assert.equal(listed.is_active, true);

    // reactivation now rides a DEDICATED finance.account.reactivated event (Codex PR #651 P2),
    // NOT finance.account.updated — so an ordinary field edit can never carry activation
    const updated = await updatedEvents(service);
    assert.equal(updated.length, 0, 'no finance.account.updated emitted for a reactivation');
    const reactivated = (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.account.reactivated');
    assert.equal(reactivated.length, 1);
    assert.equal(reactivated[0].payload.account_id, acct.id);
    assert.equal(reactivated[0].payload.reason, 'reopen');
  });

  test('reactivating an already-active account is rejected with 409 FINANCE_COA_NOT_INACTIVE', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Still Active', classification: 'Asset', account_type: 'Asset' });

    await assert.rejects(
      () =>
        service.reactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: { reason: 'reopen' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_NOT_INACTIVE',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('a system account cannot be reactivated: 409 FINANCE_COA_SYSTEM_ACCOUNT_LOCKED', async () => {
    const service = createFinanceDomainService();
    const cash = service.listAccounts(TENANT).find((a) => a.account_code === '1000');

    await assert.rejects(
      () =>
        service.reactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: cash.id,
          payload: { reason: 'reopen' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_SYSTEM_ACCOUNT_LOCKED',
    );
  });

  test('reactivation that would collide on a name with another active account is 409 FINANCE_COA_REACTIVATE_CONFLICT', async () => {
    const service = createFinanceDomainService();
    const original = await makeAccount(service, { name: 'Consulting', classification: 'Revenue', account_type: 'Revenue' });
    // A second active account, created with a distinct name (so create's dup-name
    // guard passes), then renamed in the bucket onto the SAME normalized
    // (classification, name) as `original` — i.e. a conflict that only exists at
    // reactivate time, after `original` was deactivated. (createAccount/updateAccount
    // reject names that collide with ANY account incl. inactive, so the only way to
    // stage a reactivate-time-only conflict is to seed the colliding active account.)
    const rival = await makeAccount(service, { name: 'Advisory', classification: 'Revenue', account_type: 'Revenue' });
    await service.deactivateAccount({ tenantId: TENANT, actor, accountId: original.id, payload: { reason: 'close' } });
    // Rename the rival (active) onto the deactivated original's key directly in the bucket.
    const rivalRow = service.__getBucket(TENANT).accounts.find((a) => a.id === rival.id);
    rivalRow.name = 'consulting';

    await assert.rejects(
      () =>
        service.reactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: original.id,
          payload: { reason: 'reopen' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_REACTIVATE_CONFLICT',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });

  test('a missing reason is rejected with 400 FINANCE_COA_REASON_REQUIRED', async () => {
    const service = createFinanceDomainService();
    const acct = await makeAccount(service, { name: 'Reopen No Reason', classification: 'Asset', account_type: 'Asset' });
    await service.deactivateAccount({ tenantId: TENANT, actor, accountId: acct.id, payload: { reason: 'close' } });

    await assert.rejects(
      () =>
        service.reactivateAccount({
          tenantId: TENANT,
          actor,
          accountId: acct.id,
          payload: {},
        }),
      (err) => err.statusCode === 400 && err.code === 'FINANCE_COA_REASON_REQUIRED',
    );
    assert.equal((await updatedEvents(service)).length, 0);
  });
});

describe('financeDomainService — COA manager wiring (Task 10)', () => {
  test('all four COA manager methods are exposed on the service object', () => {
    const service = createFinanceDomainService();
    assert.equal(typeof service.createAccount, 'function');
    assert.equal(typeof service.updateAccount, 'function');
    assert.equal(typeof service.deactivateAccount, 'function');
    assert.equal(typeof service.reactivateAccount, 'function');
  });
});

// =====================================================================================
// #10-RETIREMENT INTEGRATION TEST (Task 20)
//
// This is an explicitly-labelled INTEGRATION test, not part of the COA-CRUD acceptance
// (which makes no /cash-flow claim — see design §8). It is VALID because Cash Flow
// Bridge B is already MERGED and live (PR #650): getCashFlow / buildCashFlowStatement
// recognize an account as cash when its `account_type ∈ {Cash, Bank}` (or its normalized
// (classification, name) matches a curated cash/bank account). This test does NOT
// re-implement cash flow — it only proves that the editable COA manager's account_type
// edit feeds that already-live recognition, which is exactly what retires beta
// limitation #10 (custom-named bank/cash accounts being invisible to /cash-flow).
//
// ORDERING (the "post first, then mark Bank" sequence):
//   1. createAccount a CUSTOM-named generic Asset ('Stripe Payouts', Asset/Asset) —
//      NOT recognized as cash by Bridge B (no curated Cash/Bank namesake).
//   2. Post a balanced journal line that moves real cash through that account
//      (Debit Stripe Payouts / Credit Revenue), then assert getCashFlow does NOT yet
//      recognize it: its account_code is absent from cash_account_codes and there is
//      no inflow attributed to it.
//   3. updateAccount to set account_type = 'Bank'. The account NOW has posted history,
//      so this is a posted-history edit — account_type is editable on posted-history
//      accounts WITH a reason (per the §2 lock rules), so this is valid. (This is the
//      same edge the "posted-history account allows name + account_type change WITH a
//      reason" unit test above exercises.)
//   4. Assert getCashFlow now recognizes it: its account_code ∈ cash_account_codes AND
//      the posted receipt surfaces as a cash inflow attributed to the contra (Revenue).
// =====================================================================================
describe('financeDomainService — #10-retirement integration (custom account → Bank → cash flow)', () => {
  test('a custom-named Asset, once marked Bank, has its posted receipt recognized by /cash-flow', async () => {
    const service = createFinanceDomainService();

    // (1) Custom-named generic Asset — NOT one of the curated Cash/Bank seeds.
    const payouts = await makeAccount(service, {
      name: 'Stripe Payouts',
      classification: 'Asset',
      account_type: 'Asset',
    });
    assert.equal(payouts.account_type, 'Asset');

    // The seeded Revenue account is the contra leg (a non-cash credit source).
    const revenue = service.listAccounts(TENANT).find((a) => a.account_code === '4000');
    assert.ok(revenue, 'seeded Revenue account exists for the contra leg');

    // (2) Post a balanced journal line: Debit Stripe Payouts / Credit Revenue.
    // Real cash flows through the custom account, but it is typed Asset, so Bridge B
    // must NOT recognize it yet.
    seedEntry(service, {
      id: 'je_stripe_receipt',
      status: 'posted',
      lines: [
        { account_id: payouts.id, account_name: payouts.name, classification: 'Asset', debit_cents: 30000, credit_cents: 0 },
        { account_id: revenue.id, account_name: revenue.name, classification: 'Revenue', debit_cents: 0, credit_cents: 30000 },
      ],
    });
    // Give the bucket entry a posted_at so the cash flow period buckets deterministically.
    service.__getBucket(TENANT).journalEntries.find((e) => e.id === 'je_stripe_receipt').posted_at =
      '2026-06-15T00:00:00Z';

    const before = service.getCashFlow(TENANT);
    assert.equal(
      before.cash_account_codes.includes(payouts.account_code),
      false,
      'BEFORE: a generic Asset is not recognized as cash',
    );
    assert.equal(before.totals.inflow_cents, 0, 'BEFORE: no cash inflow is reported for the Asset-typed account');
    assert.deepEqual(before.periods, [], 'BEFORE: no cash-flow period exists at all');

    // (3) Mark it Bank. The account now has posted history, so account_type is editable
    // only WITH a reason (posted-history lock rule).
    const updated = await service.updateAccount({
      tenantId: TENANT,
      actor,
      accountId: payouts.id,
      payload: { account_type: 'Bank', reason: 'reclassify Stripe payout account as a bank account' },
    });
    assert.equal(updated.account_type, 'Bank');
    assert.equal(updated.classification, 'Asset', 'classification unchanged');

    // (4) AFTER: Bridge B now recognizes the same posted receipt as a cash inflow.
    const after = service.getCashFlow(TENANT);
    assert.equal(
      after.cash_account_codes.includes(payouts.account_code),
      true,
      'AFTER: the now-Bank account_code is in cash_account_codes',
    );
    assert.equal(after.totals.inflow_cents, 30000, 'AFTER: the posted receipt is reported as a cash inflow');
    assert.equal(after.totals.outflow_cents, 0);
    assert.equal(after.totals.net_cents, 30000);
    assert.equal(after.periods.length, 1, 'AFTER: exactly one cash-flow period');
    assert.equal(after.periods[0].period, '2026-06');
    const revenueCategory = after.periods[0].by_category.find((c) => c.classification === 'Revenue');
    assert.ok(revenueCategory, 'AFTER: the inflow is attributed to the Revenue contra leg');
    assert.equal(revenueCategory.inflow_cents, 30000);
  });

  test('after a no-history rename, reusing the OLD name in a manual create is rejected (id-reuse guard, Codex PR #651 P1)', async () => {
    const service = createFinanceDomainService();
    const acct = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Stripe', classification: 'Asset', account_type: 'Asset' },
    });
    const originalId = acct.id;
    // rename (no posted history → full edit allowed); id is immutable, derived from the OLD name
    await service.updateAccount({ tenantId: TENANT, actor, accountId: acct.id, payload: { name: 'Stripe Payouts' } });
    const renamed = service.listAccounts(TENANT).find((a) => a.id === originalId);
    assert.equal(renamed.name, 'Stripe Payouts');

    // creating a NEW account with the OLD name would regenerate originalId → reject
    await assert.rejects(
      () =>
        service.createAccount({
          tenantId: TENANT,
          actor,
          payload: { name: 'Stripe', classification: 'Asset', account_type: 'Bank' },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_NAME_RESERVED',
    );
    // no second account with the original id was created (chart still has exactly one)
    assert.equal(service.listAccounts(TENANT).filter((a) => a.id === originalId).length, 1);
  });

  test('after a no-history rename, a journal auto-create on the OLD name is rejected (Codex PR #651 P1)', async () => {
    const service = createFinanceDomainService();
    const acct = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Stripe', classification: 'Asset', account_type: 'Asset' },
    });
    await service.updateAccount({ tenantId: TENANT, actor, accountId: acct.id, payload: { name: 'Stripe Payouts' } });

    // a journal line on the freed OLD name would auto-create an account with the renamed
    // account's id (name-derived) → refuse rather than corrupt the id-keyed chart
    await assert.rejects(
      () =>
        service.createJournalDraft({
          tenantId: TENANT,
          actor,
          payload: {
            lines: [
              { account_name: 'Stripe', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
              { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
            ],
          },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_NAME_RESERVED',
    );
  });

  test('a journal draft posting to a DEACTIVATED account is rejected — deactivation is enforceable (Codex PR #651 P2)', async () => {
    const service = createFinanceDomainService();
    const acct = await service.createAccount({
      tenantId: TENANT,
      actor,
      payload: { name: 'Old Bank', classification: 'Asset', account_type: 'Bank' },
    });
    await service.deactivateAccount({ tenantId: TENANT, actor, accountId: acct.id, payload: { reason: 'closing it' } });

    // a draft posting to the inactive account (by id) is refused BEFORE any posting
    await assert.rejects(
      () =>
        service.createJournalDraft({
          tenantId: TENANT,
          actor,
          payload: {
            lines: [
              { account_id: acct.id, account_name: 'Old Bank', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
              { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
            ],
          },
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_COA_ACCOUNT_INACTIVE',
    );
    // pre-pass rejects before any create → NO orphan auto-created 'Revenue' account
    const created = await createdEvents(service);
    assert.ok(!created.some((e) => e.payload.name === 'Revenue'));

    // control: a draft to ACTIVE (seeded) accounts still posts fine
    const ok = await service.createJournalDraft({
      tenantId: TENANT,
      actor,
      payload: {
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
        ],
      },
    });
    assert.ok(ok?.journal_entry?.id || ok?.id);
  });
});
