// List storage objects under the signed/ prefix for the dev tenant to verify
// upload happened.
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';

const bucket = getBucketName();
const prefix = '759a83e8-7340-4482-a586-cd2d049fb0b5/signed';
console.log('bucket:', JSON.stringify(bucket));
console.log('prefix:', prefix);

const s = getSupabaseAdmin();
const r = await s.storage.from(bucket).list(prefix, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });
if (r.error) {
  console.error('ERR:', r.error.message);
  process.exit(1);
}
console.log('files:', r.data?.length || 0);
for (const f of r.data || []) {
  console.log('  -', f.name, '|', f.metadata?.size, 'bytes |', f.created_at);
}
