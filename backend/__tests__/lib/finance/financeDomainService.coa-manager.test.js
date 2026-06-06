import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';
const actor = { id: 'u1', type: 'human' };
const aiActor = { id: 'bot', type: 'ai_agent' };

const createdEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.account.created');

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
