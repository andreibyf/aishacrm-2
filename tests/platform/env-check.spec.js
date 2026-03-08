import { test } from '@playwright/test';

test.skip(process.env.CI !== undefined, 'env-check only runs locally');

test('[PLATFORM] print env', async () => {
  console.log('--- ENV CHECK ---');
  console.log('E2E_TENANT_ID:', process.env.E2E_TENANT_ID ? '(set)' : '(not set)');
  console.log('SUPERADMIN_EMAIL:', process.env.SUPERADMIN_EMAIL ? '(set)' : '(not set)');
  console.log('-----------------');
});
