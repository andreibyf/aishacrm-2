import test from 'node:test';
import assert from 'node:assert/strict';

async function importModuleWithFreshCache() {
  const moduleUrl = new URL('../../routes/booking-shortlink.js', import.meta.url);
  moduleUrl.searchParams.set('test', `${Date.now()}-${Math.random()}`);
  return import(moduleUrl.href);
}

test('canonicalizeBookingDestinationUrl rewrites localhost origin to public scheduler origin', async () => {
  const previousPublicSchedulerUrl = process.env.PUBLIC_SCHEDULER_URL;
  try {
    process.env.PUBLIC_SCHEDULER_URL = 'https://scheduler.aishacrm.com';
    const { canonicalizeBookingDestinationUrl } = await importModuleWithFreshCache();

    const result = canonicalizeBookingDestinationUrl(
      'http://localhost:3002/aisha-superadmin/consult?email=client%40example.com',
    );

    assert.equal(result.ok, true);
    assert.equal(
      result.url,
      'https://scheduler.aishacrm.com/aisha-superadmin/consult?email=client%40example.com',
    );
  } finally {
    if (previousPublicSchedulerUrl === undefined) {
      delete process.env.PUBLIC_SCHEDULER_URL;
    } else {
      process.env.PUBLIC_SCHEDULER_URL = previousPublicSchedulerUrl;
    }
  }
});

test('canonicalizeBookingDestinationUrl keeps scheduler-domain URL unchanged', async () => {
  process.env.PUBLIC_SCHEDULER_URL = 'https://scheduler.aishacrm.com';
  const { canonicalizeBookingDestinationUrl } = await importModuleWithFreshCache();

  const url = 'https://scheduler.aishacrm.com/aisha-superadmin/consult?email=client%40example.com';
  const result = canonicalizeBookingDestinationUrl(url);

  assert.equal(result.ok, true);
  assert.equal(result.url, url);
});

test('canonicalizeBookingDestinationUrl rejects malformed and unsafe URLs', async () => {
  process.env.PUBLIC_SCHEDULER_URL = 'https://scheduler.aishacrm.com';
  const { canonicalizeBookingDestinationUrl } = await importModuleWithFreshCache();

  const malformed = canonicalizeBookingDestinationUrl('not-a-url');
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error, 'Invalid URL');

  const unsafe = canonicalizeBookingDestinationUrl('javascript:alert(1)');
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.error, 'URL must use http or https');
});
