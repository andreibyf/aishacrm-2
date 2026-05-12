// Generate a 5-minute signed URL for a stored PDF.
// usage: docker exec aishacrm-backend node scripts/sign-url.mjs <path>
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: sign-url.mjs <storage-path>');
  process.exit(1);
}

const s = getSupabaseAdmin();
const r = await s.storage.from(getBucketName()).createSignedUrl(path, 300);
if (r.error) {
  console.error('ERR:', r.error.message);
  process.exit(1);
}
console.log(r.data.signedUrl);
