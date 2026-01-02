import { test } from '@playwright/test';
test('print env', async () => {
  console.log('--- ENV CHECK ---');
  console.log('E2E_TENANT_ID:', process.env.E2E_TENANT_ID);
  console.log('SUPERADMIN_EMAIL:', process.env.SUPERADMIN_EMAIL);
  console.log('-----------------');
});
