import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';

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
