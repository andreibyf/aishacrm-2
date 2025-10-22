/**
 * aiRun
 * Server-side function for your backend
 */

// functions/aiRun.js
// Validates the short-lived JWT, enforces scopes/rate-limits,
// calls OpenAI Chat Completions API to plan DOM/navigation steps, returns compact result.
//
// Env vars required:
//   JWT_SECRET
//   OPENAI_API_KEY

import { jwtVerify } from "https://esm.sh/jose@5.9.6/jwt/verify";
import { createSecretKey } from "node:crypto";

const RL = new Map(); // naive in-memory rate-limit

function keyForReq(req, userId) {
  // per-user limiter (or combine with IP from x-forwarded-for)
  return `u:${userId}`;
}

function take(req, userId, limit = 60, windowMs = 60_000) {
  const k = keyForReq(req, userId);
  const now = Date.now();
  const b = RL.get(k);
  if (!b || b.resetAt < now) {
    RL.set(k, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "https://hub.aishacrm.app");
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Headers", "authorization,content-type");
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}

async function verifyBearer(req) {
  const hdr = req.headers.get("authorization") || "";
  if (!hdr.startsWith("Bearer ")) throw new Error("Missing bearer");
  const token = hdr.slice(7);
  const JWT_SECRET = Deno.env.get("AISHA_AI_JWT_SECRET");
  if (!JWT_SECRET) throw new Error("Server not configured");
  const key = createSecretKey(new TextEncoder().encode(JWT_SECRET));
  const { payload } = await jwtVerify(token, key); // HS256 default here
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }
  if (req.method !== "POST") {
    return cors(new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 }));
  }

  try {
    const claims = await verifyBearer(req);
    if (!claims.sub) throw new Error("Invalid token");
    if (!claims.scopes || !claims.scopes.includes("ai:dom")) {
      return cors(new Response(JSON.stringify({ ok: false, error: "Insufficient scope" }), { status: 403 }));
    }
    if (!take(req, claims.sub, 60, 60_000)) {
      return cors(new Response(JSON.stringify({ ok: false, error: "Rate limit" }), { status: 429 }));
    }

    const body = await req.json().catch(() => ({}));
    const { goal, snapshot } = body;
    if (!goal || !snapshot) {
      return cors(new Response(JSON.stringify({ ok: false, error: "goal and snapshot required" }), { status: 400 }));
    }
    
    // OPTIMIZATION: Truncate snapshot text more aggressively for faster processing
    const snapshotText = snapshot.text || "";
    if (snapshotText.length > 12000) {
      return cors(new Response(JSON.stringify({ ok: false, error: "snapshot too large" }), { status: 400 }));
    }

    const OPENAI_API_KEY = Deno.env.get("AISHA_AI_OPENAI_KEY");
    if (!OPENAI_API_KEY) {
      return cors(new Response(JSON.stringify({ ok: false, error: "Server not configured (OPENAI_API_KEY)" }), { status: 500 }));
    }

    // OPTIMIZATION: More concise system prompt to reduce token usage
    const sys = `You are a CRM navigation assistant for hub.aishacrm.app. 
Return JSON tool calls using: nav_goto, dom_click, dom_type.
Use robust selectors (#id, [data-testid], [name]). Stay on domain.`;

    // OPTIMIZATION: Truncate snapshot data for OpenAI to reduce processing time
    const truncatedSnapshot = {
      ...snapshot,
      text: snapshotText.slice(0, 6000), // Reduced from 8000 to 6000 chars
      interactive_elements: snapshot.interactive_elements?.slice(0, 20) // Limit interactive elements
    };

    const messages = [
      { role: "system", content: sys },
      { role: "user", content: `Goal: ${goal}\n\nPage: ${JSON.stringify(truncatedSnapshot)}` }
    ];

    const tools = [
      { type: "function", function: { name: "nav_goto",  description: "Navigate within hub.aishacrm.app", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
      { type: "function", function: { name: "dom_click", description: "Click element by CSS selector",  parameters: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] } } },
      { type: "function", function: { name: "dom_type",  description: "Type into input by selector",    parameters: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector","text"] } } }
    ];

    // OPTIMIZATION: Use faster model and reduce max_tokens for quicker responses
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Already using fast model
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 500, // Reduced from default to speed up responses
        temperature: 0.1 // Lower temperature for more focused responses
      })
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return cors(new Response(JSON.stringify({ ok: false, error: `OpenAI error ${r.status}: ${errText}` }), { status: 502 }));
    }

    const data = await r.json();
    const responseMessage = data.choices && data.choices[0] ? data.choices[0].message : null;

    return cors(new Response(JSON.stringify({ ok: true, response: responseMessage }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

  } catch (e) {
    console.error("aiRun function error:", e);
    return cors(new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), { status: 500 }));
  }
});


----------------------------

export default aiRun;
