/**
 * generateElevenLabsSpeech
 * Server-side function for your backend
 */

/**
 * NOTES - generateElevenLabsSpeech
 * - Purpose: Proxy to ElevenLabs TTS. Enforces their 1000-char text limit by truncating and marking X-Text-Truncated header.
 * - Auth: Requires user auth (base44.auth.me) and ELEVENLABS_API_KEY in env.
 * - Returns: JSON { success, audio_base64, truncated? } for robust frontend handling.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const ELEVEN_API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub);
  }
  // btoa is available in Deno runtime
  return btoa(binary);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 });
    }

    const body = await req.json();
    let text = (body?.text || '').toString();
    const voiceId = (body?.voice_id || '21m00Tcm4TlvDq8ikWAM').toString(); // default voice
    const modelId = (body?.model_id || 'eleven_turbo_v2').toString();
    const voiceSettings = body?.voice_settings || { stability: 0.4, similarity_boost: 0.8 };

    if (!text.trim()) {
      return Response.json({ error: 'Text is required' }, { status: 400 });
    }

    // ElevenLabs 1000 char limit -> truncate gracefully
    const MAX_LEN = 1000;
    let truncated = false;
    if (text.length > MAX_LEN) {
      text = text.slice(0, MAX_LEN - 3) + '...';
      truncated = true;
    }

    const url = `${ELEVEN_API_BASE}/${encodeURIComponent(voiceId)}?optimize_streaming_latency=0&output_format=mp3_44100_128`;

    const elevenRes = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: voiceSettings
      })
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => '');
      return Response.json({ error: 'ElevenLabs request failed', details: errText || elevenRes.statusText }, { status: 400 });
    }

    const audioBuf = await elevenRes.arrayBuffer();
    const audioBase64 = arrayBufferToBase64(audioBuf);

    return Response.json({
      success: true,
      audio_base64: audioBase64,
      truncated
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
});

----------------------------

export default generateElevenLabsSpeech;
