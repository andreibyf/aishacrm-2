# TTS Endpoint Testing Guide

## Quick Start

### 1. Add Required Environment Variables

Add these to `backend/.env`:

```bash
# ElevenLabs TTS Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_or_use_default

# Test Account Password (for automated testing)
TEST_PASSWORD=your_test_account_password
```

**Where to get ElevenLabs credentials:**
- Sign up at https://elevenlabs.io/
- Get API key from Settings → API Keys
- Get Voice ID from Voice Lab → Select voice → Copy ID
- Free tier: 10,000 characters/month

### 2. Restart Backend

The backend needs to restart to pick up the new environment variables:

```bash
# If using Docker
docker compose restart backend

# If running locally
cd backend
npm run dev
```

### 3. Run Test Script

```bash
# Default test text
node scripts/test-tts.js

# Custom text
node scripts/test-tts.js "Hello from AiSHA, your AI assistant."
```

## Manual Testing with curl

### Get Authentication Token

#### Option 1: From Browser (Easiest)

1. Log into the app at http://localhost:4000
2. Open DevTools (F12) → Console
3. Run this command:
```javascript
JSON.parse(localStorage.getItem('supabase.auth.token')).currentSession.access_token
```
4. Copy the token (starts with `eyJ...`)

#### Option 2: CLI Script

```bash
# Create a temporary script
cat > get-token.js << 'EOF'
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const { data } = await supabase.auth.signInWithPassword({
  email: 'abyfield@4vdataconsulting.com',
  password: process.env.TEST_PASSWORD
});

console.log(data.session.access_token);
EOF

# Run it
node get-token.js
```

### Call TTS Endpoint

```bash
# Replace YOUR_TOKEN_HERE with the actual token
curl -X POST http://localhost:4001/api/ai/tts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"text":"This is AiSHA speaking from the test environment."}' \
  --output aisha-test.mp3

# Play the audio (if you have mpg123 installed)
mpg123 aisha-test.mp3
```

## Testing from Frontend

The TTS endpoint is already integrated into the AI Sidebar:

1. Open the app at http://localhost:4000
2. Click the avatar in top right to open AI Sidebar
3. Send a message to AiSHA
4. Click the speaker icon 🔊 next to the assistant's response
5. Audio should play automatically

## Troubleshooting

### Error: "ElevenLabs not configured"

**Cause:** Missing `ELEVENLABS_API_KEY` or `ELEVENLABS_VOICE_ID` in `backend/.env`

**Fix:**
```bash
# Add to backend/.env
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# Restart backend
docker compose restart backend
```

### Error: "Authentication required" (401)

**Cause:** Missing or invalid authentication token

**Fix:**
- Get a fresh token using one of the methods above
- Tokens expire after ~1 hour, get a new one if yours is old

### Error: "Missing TEST_PASSWORD in .env"

**Cause:** Test script can't authenticate without password

**Fix:**
```bash
# Add to backend/.env
TEST_PASSWORD=your_actual_password_for_abyfield@4vdataconsulting.com

# Or export temporarily
export TEST_PASSWORD="your_password"
node scripts/test-tts.js
```

### Error: "TypeError: fetch failed"

**Cause:** Backend not running or wrong URL

**Fix:**
```bash
# Check backend status
docker ps | grep backend

# Or if running locally
curl http://localhost:4001/health

# Restart if needed
docker compose up -d backend
```

### Audio file is 0 bytes or corrupt

**Cause:** 
- Invalid ElevenLabs API key
- Voice ID doesn't exist
- Text is empty
- Rate limit exceeded

**Fix:**
1. Verify API key at https://elevenlabs.io/speech-synthesis
2. Check ElevenLabs dashboard for errors
3. Ensure text parameter is not empty
4. Check free tier limits (10k chars/month)

## Production Safety Notes

The `/api/ai/tts` endpoint:
- ✅ Bypasses production safety guard (no DB writes)
- ✅ Requires authentication (Supabase session)
- ✅ Rate limited (100 requests/minute by default)
- ✅ Text length capped at 4000 characters
- ✅ No tenant data leakage (stateless proxy)

Safe to use in production as-is. Consider adding:
- Usage tracking per tenant
- Custom rate limits per user tier
- Audio caching for repeated phrases
- Voice selection per tenant preferences

## Integration Testing

The TTS feature integrates with:
- **Frontend:** `src/components/ai/AiSidebar.jsx` (speaker button)
- **Hook:** `src/components/ai/useSpeechInput.js` (future STT integration)
- **Backend:** `backend/routes/ai.js` (POST /api/ai/tts)
- **Auth:** `backend/middleware/authenticate.js` (token validation)
- **Safety:** `backend/startup/initMiddleware.js` (guard exemption)

Unit tests located at:
- `src/components/ai/__tests__/AiSidebar.voice.test.jsx`
- Backend endpoint: Manual testing only (requires real API key)
