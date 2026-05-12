// Generate a signed URL by hitting the Supabase Storage REST API directly,
// bypassing the JS client's `createSignedUrl` which is returning "Invalid key".
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: sign-url-v2.mjs <path>');
  process.exit(1);
}

const bucket = getBucketName();

// Try download() first to verify the path actually resolves
const s = getSupabaseAdmin();
const dl = await s.storage.from(bucket).download(path);
if (dl.error) {
  console.error('download error:', dl.error.message);
} else {
  console.log('download OK, size:', dl.data.size, 'type:', dl.data.type);
}

// Now try createSignedUrl
const su = await s.storage.from(bucket).createSignedUrl(path, 300);
if (su.error) {
  console.error('createSignedUrl error:', su.error.message);
} else {
  console.log('signed url:', su.data.signedUrl);
}
