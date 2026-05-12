// One-off SMTP probe — exercises sendTenantEmail with full error capture
// so we can see exactly what Gmail is rejecting. Safe to leave in the
// scripts/ dir for future debugging.
import { sendTenantEmail } from '../lib/sendTenantEmail.js';

const tenantId = process.argv[2] || '759a83e8-7340-4482-a586-cd2d049fb0b5';
const to = process.argv[3] || 'andrei.byfield@gmail.com';

console.log(`Probe → tenant=${tenantId}, to=${to}`);
const r = await sendTenantEmail({
  tenantId,
  to,
  subject: '[probe] eSign SMTP test',
  text: 'This is a manual probe to surface the Gmail SMTP rejection reason.',
  html: '<p>Manual probe to surface the Gmail SMTP rejection reason.</p>',
});

console.log('\nRESULT:');
console.log(
  JSON.stringify(
    {
      ok: r.ok,
      reason: r.reason,
      provider: r.provider,
      err_message: r.error?.message,
      err_code: r.error?.code,
      err_command: r.error?.command,
      err_response: r.error?.response,
      err_responseCode: r.error?.responseCode,
    },
    null,
    2,
  ),
);
process.exit(r.ok ? 0 : 1);
