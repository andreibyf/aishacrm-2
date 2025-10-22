/**
 * aiToken
 * Server-side function for your backend
 */

// functions/aiToken.js
// Issues a short-lived JWT for an authenticated user.
// This function now uses the Base44 SDK to securely get the user.
//
// Env vars required in Base44 function settings:
//   AISHA_AI_JWT_SECRET
//   AISHA_AI_TOKEN_TTL

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { SignJWT } from "https://esm.sh/jose@5.9.6/jwt/sign";
import { createSecretKey } from "node:crypto";

function cors(res) {
  const h = new Headers(res.headers);
  // Allow your app origin(s). Update this if your app is hosted elsewhere.
  h.set("Access-Control-Allow-Origin", "https://hub.aishacrm.app");
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Headers", "authorization,content-type");
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }
  if (req.method !== "POST") {
    return cors(new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 }));
  }

  try {
    // Correctly get the authenticated user using the Base44 SDK
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return cors(new Response(JSON.stringify({ ok: false, error: "Unauthenticated" }), { status: 401 }));
    }

    // FIXED: Use correct environment variable names
    const JWT_SECRET = Deno.env.get("AISHA_AI_JWT_SECRET");
    if (!JWT_SECRET) {
      return cors(new Response(JSON.stringify({ ok: false, error: "Server not configured (AISHA_AI_JWT_SECRET)" }), { status: 500 }));
    }
    const ttlSec = Number(Deno.env.get("AISHA_AI_TOKEN_TTL") || "600"); // default 10 min

    const payload = {
      sub: user.id,
      email: user.email,
      roles: [user.role], // Include the user's role
      scopes: ["ai:dom", "ai:navigate"], // adjust per your roles/plans
    };

    const key = createSecretKey(new TextEncoder().encode(JWT_SECRET));
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${ttlSec}s`)
      .sign(key);

    return cors(new Response(JSON.stringify({ ok: true, token, expSec: ttlSec }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

  } catch (e) {
    console.error("aiToken function error:", e);
    return cors(new Response(JSON.stringify({ ok: false, error: String(e.message || "Internal Server Error") }), { status: 500 }));
  }
});

----------------------------

export default aiToken;
