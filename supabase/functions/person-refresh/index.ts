// person-refresh with dynamic CORS that supports credentials
// URL: GET /person-refresh?person_id=<uuid>&max_wait_ms=<ignored>
// Also supports POST and OPTIONS.
import { createClient } from "npm:@supabase/supabase-js@2.47.10";
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});
// Configure allowed origins here. Add your production domains when ready.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:3000'
]);
function makeCorsHeaders(req) {
  const origin = req.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app'))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  } else {
    // Fallback: no ACAO when not allowed; browsers will block credentialed requests from disallowed origins
    headers['Access-Control-Allow-Origin'] = '*';
  // Do not set credentials with wildcard; compliant with CORS spec
  }
  return headers;
}
async function inferPersonType(person_id) {
  const { data, error } = await admin.from('person_profile').select('person_type').eq('person_id', person_id).limit(1).maybeSingle();
  if (error) return null;
  return data?.person_type ?? null;
}
async function updateSingle(person_id, person_type) {
  // Find latest opportunity for this person
  const filter = person_type === 'lead' ? {
    lead_id: person_id
  } : {
    contact_id: person_id
  };
  const { data: opp, error: oppErr } = await admin.from('opportunities').select('id,name,updated_at').match(filter).order('updated_at', {
    ascending: false,
    nullsFirst: false
  }).limit(1).maybeSingle();
  if (oppErr) throw new Error(`opportunities query failed: ${oppErr.message}`);
  let opportunity_name = null;
  let opportunity_last_activity_date = null;
  if (opp) {
    opportunity_name = opp.name ?? null;
    const { data: act, error: actErr } = await admin.from('activities').select('created_at').eq('related_id', opp.id).order('created_at', {
      ascending: false
    }).limit(1).maybeSingle();
    if (actErr) throw new Error(`activities query failed: ${actErr.message}`);
    opportunity_last_activity_date = act?.created_at ?? opp.updated_at;
  }
  const { data: updated, error: upErr } = await admin.from('person_profile').update({
    opportunity_name,
    opportunity_last_activity_date,
    updated_at: new Date().toISOString()
  }).eq('person_id', person_id).eq('person_type', person_type).select().maybeSingle();
  if (upErr) throw new Error(`person_profile update failed: ${upErr.message}`);
  return updated;
}
console.info('person-refresh with credentialed CORS started');
Deno.serve(async (req)=>{
  const cors = makeCorsHeaders(req);
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: cors
    });
  }
  try {
    if (req.method === 'GET') {
      const person_id = url.searchParams.get('person_id');
      if (!person_id) return new Response(JSON.stringify({
        error: 'person_id is required'
      }), {
        status: 400,
        headers: cors
      });
      const person_type = await inferPersonType(person_id);
      if (!person_type) return new Response(JSON.stringify({
        error: 'person not found'
      }), {
        status: 404,
        headers: cors
      });
      const updated = await updateSingle(person_id, person_type);
      return new Response(JSON.stringify(updated ?? {}), {
        status: 200,
        headers: cors
      });
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(()=>({}));
      if (body.batch) {
        const { data: people, error: peErr } = await admin.from('person_profile').select('person_id, person_type').limit(10000);
        if (peErr) throw new Error(`person_profile list failed: ${peErr.message}`);
        let count = 0;
        for (const p of people ?? []){
          await updateSingle(p.person_id, p.person_type);
          count++;
        }
        return new Response(JSON.stringify({
          status: 'ok',
          count
        }), {
          status: 200,
          headers: cors
        });
      }
      if (body.person_id) {
        const person_type = await inferPersonType(body.person_id);
        if (!person_type) return new Response(JSON.stringify({
          error: 'person not found'
        }), {
          status: 404,
          headers: cors
        });
        const updated = await updateSingle(body.person_id, person_type);
        return new Response(JSON.stringify(updated ?? {}), {
          status: 200,
          headers: cors
        });
      }
      return new Response(JSON.stringify({
        error: 'Unsupported POST payload'
      }), {
        status: 400,
        headers: cors
      });
    }
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: cors
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e?.message || String(e)
    }), {
      status: 500,
      headers: cors
    });
  }
});
