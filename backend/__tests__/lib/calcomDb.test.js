import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

function loadModuleWithPool(FakePool) {
  const originalPool = pg.Pool;
  pg.Pool = FakePool;
  const moduleUrl = new URL('../../lib/calcomDb.js', import.meta.url);
  moduleUrl.searchParams.set('test', `${Date.now()}-${Math.random()}`);
  return import(moduleUrl.href).finally(() => {
    pg.Pool = originalPool;
  });
}

test('getCalcomDb prefers CALCOM_DB_URL over CALCOM_DATABASE_URL', async () => {
  const originalDbUrl = process.env.CALCOM_DB_URL;
  const originalDatabaseUrl = process.env.CALCOM_DATABASE_URL;

  const created = [];
  class FakePool {
    constructor(options) {
      created.push(options.connectionString);
    }
    on() {}
  }

  try {
    process.env.CALCOM_DB_URL = 'postgresql://db-url';
    process.env.CALCOM_DATABASE_URL = 'postgresql://database-url';
    const { getCalcomDb } = await loadModuleWithPool(FakePool);

    const pool = getCalcomDb();
    assert.ok(pool);
    assert.equal(created[0], 'postgresql://db-url');
  } finally {
    if (originalDbUrl === undefined) delete process.env.CALCOM_DB_URL;
    else process.env.CALCOM_DB_URL = originalDbUrl;
    if (originalDatabaseUrl === undefined) delete process.env.CALCOM_DATABASE_URL;
    else process.env.CALCOM_DATABASE_URL = originalDatabaseUrl;
  }
});

test('getCalcomDb falls back to CALCOM_DATABASE_URL', async () => {
  const originalDbUrl = process.env.CALCOM_DB_URL;
  const originalDatabaseUrl = process.env.CALCOM_DATABASE_URL;

  const created = [];
  class FakePool {
    constructor(options) {
      created.push(options.connectionString);
    }
    on() {}
  }

  try {
    delete process.env.CALCOM_DB_URL;
    process.env.CALCOM_DATABASE_URL = 'postgresql://database-url';
    const { getCalcomDb } = await loadModuleWithPool(FakePool);

    const pool = getCalcomDb();
    assert.ok(pool);
    assert.equal(created[0], 'postgresql://database-url');
  } finally {
    if (originalDbUrl === undefined) delete process.env.CALCOM_DB_URL;
    else process.env.CALCOM_DB_URL = originalDbUrl;
    if (originalDatabaseUrl === undefined) delete process.env.CALCOM_DATABASE_URL;
    else process.env.CALCOM_DATABASE_URL = originalDatabaseUrl;
  }
});

