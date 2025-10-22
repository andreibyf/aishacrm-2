/**
 * transcribeAudio
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.56.0';

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

function parseDataUrl(input) {
  // Accepts either a full data URL or a raw base64 string plus optional mimeType
  if (typeof input !== "string") return { mimeType: "application/octet-stream", base64: "" };
  if (input.startsWith("data:")) {
    // data:[<mediatype>][;base64],<data>
    const commaIdx = input.indexOf(",");
    const header = input.slice(0, commaIdx); // e.g. data:audio/webm;codecs=opus;base64
    const base64 = input.slice(commaIdx + 1);
    // Extract mime (up to first ';' or end before ,)
    const semiIdx = header.indexOf(";") > -1 ? header.indexOf(";") : header.length;
    const mimeType = header.slice(5, semiIdx) || "application/octet-stream";
    return { mimeType, base64 };
  }
  // Not a data URL, assume it's raw base64 with unknown mime
  return { mimeType: "application/octet-stream", base64: input };
}

function guessExtFromMime(mimeType) {
  if (!mimeType) return "bin";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("m4a")) return "m4a";
  return "bin";
}

function b64ToUint8(base64) {
  // Remove whitespace/newlines if any
  const clean = base64.replace(/\s/g, "");
  // atob expects non-URL-safe base64; many browser data URLs are standard base64
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const input = payload?.audioBase64 || "";
    let mimeType = payload?.mimeType || "";

    if (!input) {
      return Response.json({ error: "Missing audioBase64" }, { status: 400 });
    }

    const parsed = parseDataUrl(input);
    // Prefer mime from data URL header when present
    if (!mimeType) mimeType = parsed.mimeType || "application/octet-stream";

    let bytes;
    try {
      bytes = b64ToUint8(parsed.base64);
    } catch (e) {
      return Response.json({ error: "Failed to decode base64" }, { status: 400 });
    }

    const ext = guessExtFromMime(mimeType);
    const file = new File([bytes], `audio.${ext}`, { type: mimeType });

    // Transcribe with Whisper
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      // You can set language hints if needed, e.g.: language: "en"
    });

    const text = result?.text || "";
    return Response.json({ text });
  } catch (error) {
    return Response.json({ error: error?.message || "Server error" }, { status: 500 });
  }
});

----------------------------

export default transcribeAudio;
