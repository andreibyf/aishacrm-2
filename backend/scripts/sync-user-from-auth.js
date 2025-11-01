#!/usr/bin/env node
/**
 * Sync a Supabase Auth user into the CRM app tables (public.users or public.employees).
 *
 * Usage:
 *   node backend/scripts/sync-user-from-auth.js --email test@aishacrm.com [--role superadmin|admin|employee|manager] [--tenant local-tenant-001]
 *
 * Behavior:
 * - If --role/--tenant are provided and Supabase Admin is configured, updates the auth user's user_metadata first.
 * - Calls POST /api/users/sync-from-auth?email=... to create the CRM record based on metadata.
 * - Prints the created table and record summary.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { initSupabaseAuth, getAuthUserByEmail, updateAuthUserMetadata, createAuthUser } from '../lib/supabaseAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from both backend/.env and project root/.env, best-effort
const backendEnv = resolve(__dirname, '..', '.env');
if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
}
const rootEnv = resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const [k, v] = a.startsWith('--') && a.includes('=')
      ? a.replace(/^--/, '').split('=')
      : [a.replace(/^--/, ''), argv[i + 1]];
    if (a.startsWith('--') && a.includes('=')) {
      args[k] = v;
    } else if (a.startsWith('--')) {
      args[k] = v;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const email = (args.email || '').trim();
const role = args.role ? String(args.role).toLowerCase() : undefined;
const tenant = args.tenant ?? args.tenant_id; // accept either
const wantsCreate = args.create !== undefined && String(args.create).toLowerCase() !== 'false';
const password = args.password; // optional

if (!email) {
  console.error('\n✗ Missing required --email');
  console.error('  Example: node backend/scripts/sync-user-from-auth.js --email test@aishacrm.com --role superadmin');
  process.exit(1);
}

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL
  || process.env.BACKEND_URL
  || 'http://localhost:3001';

const wantsMetadataUpdate = role !== undefined || tenant !== undefined;

async function main() {
  // Optionally update Supabase Auth metadata first
  if (wantsMetadataUpdate || wantsCreate) {
    const supa = initSupabaseAuth();
    if (!supa) {
      console.warn('⚠ Supabase Admin not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). Skipping metadata update.');
    } else {
      let { user, error } = await getAuthUserByEmail(email);
      if (error) {
        console.error('✗ Auth lookup failed:', error.message);
        process.exit(1);
      }
      if (!user) {
        if (wantsCreate) {
          const metaForCreate = {
            ...(role ? { role } : {}),
            ...(tenant !== undefined ? { tenant_id: (tenant === '' || tenant === 'no-client' || tenant === 'none' || tenant === 'null') ? null : tenant } : {}),
          };
          const pwd = password || `TempPass${Date.now()}!Secure#`;
          const { user: created, error: createErr } = await createAuthUser(email, pwd, metaForCreate);
          if (createErr || !created) {
            console.error('✗ Failed to create auth user:', createErr?.message || 'unknown error');
            process.exit(1);
          }
          console.log(`✓ Created auth user ${email}`);
          user = created;
        } else {
          console.error('✗ Auth user not found for', email);
          process.exit(1);
        }
      }

      const newMeta = {
        ...(user.user_metadata || {}),
        ...(role ? { role } : {}),
        // Normalize tenant: allow '', 'no-client', 'none', 'null' to clear
        ...(tenant !== undefined ? { tenant_id: (tenant === '' || tenant === 'no-client' || tenant === 'none' || tenant === 'null') ? null : tenant } : {}),
      };

      const { error: updErr } = await updateAuthUserMetadata(user.id, newMeta);
      if (updErr) {
        console.error('✗ Failed to update auth metadata:', updErr.message);
        process.exit(1);
      }
      console.log(`✓ Updated auth metadata for ${email}:`, { role: newMeta.role, tenant_id: newMeta.tenant_id ?? null });
    }
  }

  // Call backend sync endpoint
  const url = `${BACKEND_URL.replace(/\/$/, '')}/api/users/sync-from-auth?email=${encodeURIComponent(email)}`;
  console.log(`→ Syncing from Auth via ${url}`);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch (e) {
    console.error('✗ Request failed:', e.message);
    process.exit(1);
  }

  let body;
  try { body = await res.json(); } catch { body = null; }

  if (!res.ok) {
    console.error(`✗ Sync failed [${res.status}]`, body?.message || body || 'Unknown error');
    if (body?.message?.includes('tenant_id metadata is required')) {
      console.error('  Hint: provide --tenant <tenant-id> or set tenant_id in Supabase user metadata.');
    }
    process.exit(1);
  }

  const created = body?.data || {};
  console.log('✓ Sync completed');
  console.log('  Table :', created.table || 'unknown');
  console.log('  Record:', created.record || created);
}

main().catch((e) => {
  console.error('✗ Unexpected error:', e);
  process.exit(1);
});
