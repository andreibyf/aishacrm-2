#!/bin/bash

# Quick TTS Test - Extracts token from browser localStorage
# Usage: ./scripts/test-tts-quick.sh ["Optional custom text"]

TEXT="${1:-This is AiSHA speaking from the test environment.}"
BACKEND_URL="${BACKEND_URL:-http://localhost:4001}"

echo "🎤 Quick TTS Test"
echo "=================="
echo ""
echo "To get your auth token:"
echo "1. Open http://localhost:4000 in your browser"
echo "2. Log in with: abyfield@4vdataconsulting.com"
echo "3. Press F12 → Console tab"
echo "4. Run: JSON.parse(localStorage.getItem('supabase.auth.token')).currentSession.access_token"
echo "5. Copy the token (starts with eyJ...)"
echo ""
read -p "Paste your token here: " TOKEN
echo ""

if [ -z "$TOKEN" ]; then
  echo "❌ No token provided"
  exit 1
fi

echo "📡 Calling TTS endpoint..."
echo "   Backend: $BACKEND_URL/api/ai/tts"
echo "   Text: \"$TEXT\""
echo ""

curl -X POST "$BACKEND_URL/api/ai/tts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"text\":\"$TEXT\"}" \
  -v --output aisha-tts-test.mp3 2>&1 | grep -E "(< HTTP|< Content-Type|✅|❌)"

if [ -f aisha-tts-test.mp3 ] && [ -s aisha-tts-test.mp3 ]; then
  SIZE=$(wc -c < aisha-tts-test.mp3)
  echo ""
  echo "✅ Audio saved: aisha-tts-test.mp3 ($SIZE bytes)"
  echo ""
  echo "Play it:"
  echo "  • Windows: start aisha-tts-test.mp3"
  echo "  • macOS: open aisha-tts-test.mp3"
  echo "  • Linux: mpg123 aisha-tts-test.mp3 or xdg-open aisha-tts-test.mp3"
else
  echo ""
  echo "❌ Audio file not created or is empty"
  echo "   Check the error above"
fi
