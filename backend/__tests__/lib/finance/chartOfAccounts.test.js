import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COA,
  normalizeAccountKey,
  deterministicAccountId,
  autoAccountId,
  nextCodeForClassification,
  seedAccountsForTenant,
  resolveAccount,
} from '../../../lib/finance/chartOfAccounts.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';

describe('chartOfAccounts — normalization & keys', () => {
  test('normalizeAccountKey case-folds + collapses whitespace, scoped by classification', () => {
    const a = normalizeAccountKey('Asset', 'Cash');
    assert.equal(normalizeAccountKey('Asset', 'cash'), a);
    assert.equal(normalizeAccountKey('Asset', '  Cash  '), a);
    assert.equal(normalizeAccountKey('Asset', 'CASH'), a);
    // classification-scoped: Asset:Cash !== Revenue:Cash
    assert.notEqual(normalizeAccountKey('Revenue', 'Cash'), a);
  });

  test('deterministicAccountId is stable for the same tenant + code', () => {
    assert.equal(deterministicAccountId(TENANT, '1000'), deterministicAccountId(TENANT, '1000'));
    assert.notEqual(deterministicAccountId(TENANT, '1000'), deterministicAccountId(TENANT, '1100'));
    assert.notEqual(deterministicAccountId('other-tenant', '1000'), deterministicAccountId(TENANT, '1000'));
  });
});

describe('chartOfAccounts — seed', () => {
  test('seedAccountsForTenant returns the 7 system accounts with deterministic ids', () => {
    const seed = seedAccountsForTenant(TENANT);
    assert.equal(seed.length, DEFAULT_COA.length);
    assert.equal(seed.length, 7);
    const cash = seed.find((a) => a.account_code === '1000');
    assert.equal(cash.name, 'Cash');
    assert.equal(cash.account_type, 'Cash');
    assert.equal(cash.is_system, true);
    assert.equal(cash.id, deterministicAccountId(TENANT, '1000'));
    // seeding twice is identical (deterministic)
    assert.deepEqual(seedAccountsForTenant(TENANT), seed);
  });
});

describe('chartOfAccounts — nextCodeForClassification', () => {
  test('allocates the lowest free code in the reserved range', () => {
    assert.equal(nextCodeForClassification('Revenue', []), '4500');
    assert.equal(nextCodeForClassification('Revenue', ['4500']), '4501');
    assert.equal(nextCodeForClassification('Asset', ['1500', '1502']), '1501');
  });

  test('throws when the reserved range is exhausted', () => {
    const full = Array.from({ length: 100 }, (_, i) => String(5500 + i)); // Expense 5500-5599
    assert.throws(() => nextCodeForClassification('Expense', full), /exhausted/i);
  });
});

describe('chartOfAccounts — resolveAccount', () => {
  const seed = seedAccountsForTenant(TENANT);

  test('explicit account_id wins', () => {
    const target = seed.find((a) => a.account_code === '4000');
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed, account_id: target.id,
      classification: 'Asset', account_name: 'whatever',
    });
    assert.equal(created, false);
    assert.equal(account.account_code, '4000');
  });

  test('explicit account_code wins over name', () => {
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed, account_code: '1100',
      classification: 'Asset', account_name: 'Mislabeled',
    });
    assert.equal(created, false);
    assert.equal(account.name, 'Accounts Receivable');
  });

  test('matches a seeded account by normalized classification:name', () => {
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed,
      classification: 'Revenue', account_name: '  revenue ',
    });
    assert.equal(created, false);
    assert.equal(account.account_code, '4000');
  });

  test('a name miss auto-creates a NON-system account in the reserved range', () => {
    const { account, created } = resolveAccount({
      tenantId: TENANT, accounts: seed,
      classification: 'Revenue', account_name: 'Consulting Fees',
    });
    assert.equal(created, true);
    assert.equal(account.is_system, false);
    assert.equal(account.account_code, '4500'); // first free in Revenue range
    assert.notEqual(account.account_code, '4000'); // distinct from the seeded Revenue code
    assert.equal(account.classification, 'Revenue');
    // special seeded types are NEVER auto-assigned — generic per classification
    assert.equal(account.account_type, 'Revenue');
    assert.equal(account.name, 'Consulting Fees');
    // name-derived id (concurrency-safe), NOT code-derived (Codex PR #647 P1)
    assert.equal(account.id, autoAccountId(TENANT, 'Revenue', 'Consulting Fees'));
  });

  test('auto-created ids are NAME-derived so two different names never share an id even on the same code', () => {
    // Simulate the concurrent race: both requests see the same pre-write COA and
    // independently allocate the lowest free Revenue code (4500) for DIFFERENT names.
    const a = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Revenue', account_name: 'Consulting Fees' });
    const b = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Revenue', account_name: 'Marketing' });
    assert.equal(a.account.account_code, '4500');
    assert.equal(b.account.account_code, '4500'); // same display code (cosmetic)
    assert.notEqual(a.account.id, b.account.id); // but DISTINCT identities — no attribution collision
  });

  test('an auto-created Asset is generic Asset type, not Cash (cash set stays curated)', () => {
    const { account } = resolveAccount({
      tenantId: TENANT, accounts: seed,
      classification: 'Asset', account_name: 'Petty Cash Drawer',
    });
    assert.equal(account.account_type, 'Asset');
    assert.notEqual(account.account_type, 'Cash');
  });

  test('Asset:Cash and Revenue:Cash resolve to distinct accounts (classification-scoped)', () => {
    const asset = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Asset', account_name: 'Cash' });
    const rev = resolveAccount({ tenantId: TENANT, accounts: seed, classification: 'Revenue', account_name: 'Cash' });
    assert.equal(asset.created, false); // seeded 1000
    assert.equal(asset.account.account_code, '1000');
    assert.equal(rev.created, true); // no Revenue:Cash seeded → auto-create
    assert.notEqual(rev.account.account_code, '1000');
  });
});
