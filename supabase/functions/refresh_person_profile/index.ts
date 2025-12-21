// Edge Function: refresh_person_profile (direct fetch without RPC)
// Assumptions:
// - Table: public.person_profile with column person_id (uuid) and other fields
// - Auth: function requires a valid Supabase JWT (anon or authenticated allowed depending on RLS)
// - RLS on person_profile must already permit the caller to read the target row
// - Environment vars are auto-populated by Supabase
import { createClient } from "npm:@supabase/supabase-js@2.46.1";
console.info("refresh_person_profile function started");
Deno.serve(async (req)=>{
  try {
    const url = new URL(req.url);
    // Accept person_id from either query ?person_id=... or JSON body { person_id }
    let person_id = url.searchParams.get("person_id");
    if (!person_id && req.method !== "GET") {
      try {
        const body = await req.json().catch(()=>null);
        person_id = body?.person_id ?? null;
      } catch (_) {
      // ignore body parse errors
      }
    }
    if (!person_id) {
      return new Response(JSON.stringify({
        error: "Missing person_id"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // Create a Supabase client with the caller's JWT to enforce RLS
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? ""
        }
      }
    });
    // Directly fetch the profile row by person_id
    const { data, error } = await supabase.from("person_profile").select("*").eq("person_id", person_id).maybeSingle();
    if (error) {
      console.error("select person_profile error", error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    if (!data) {
      return new Response(JSON.stringify({
        error: "Profile not found"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      profile: data
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Connection": "keep-alive"
      }
    });
  } catch (e) {
    console.error("unexpected error", e);
    return new Response(JSON.stringify({
      error: "Unexpected error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
