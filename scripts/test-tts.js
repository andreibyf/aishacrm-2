#!/usr/bin/env node

/**
 * Test script for TTS endpoint
 * Usage: node scripts/test-tts.js [text]
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();
dotenv.config({ path: 'backend/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL || 'abyfield@4vdataconsulting.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  console.error('   Required: SUPABASE_URL, SUPABASE_ANON_KEY');
  process.exit(1);
}

if (!TEST_PASSWORD) {
  console.error('❌ Missing TEST_PASSWORD in .env');
  console.error('   Set TEST_PASSWORD for the test account');
  process.exit(1);
}

const textToSpeak = process.argv[2] || 'This is AiSHA speaking from the test environment.';

async function testTTS() {
  console.log('🎤 Testing TTS Endpoint\n');
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Text: "${textToSpeak}"\n`);

  // Step 1: Authenticate with Supabase
  console.log('1️⃣ Authenticating with Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError || !authData.session) {
    console.error('❌ Authentication failed:', authError?.message || 'No session');
    process.exit(1);
  }

  const accessToken = authData.session.access_token;
  console.log('✅ Authenticated as:', authData.user.email);
  console.log('   Token preview:', accessToken.substring(0, 20) + '...\n');

  // Step 2: Call TTS endpoint
  console.log('2️⃣ Calling TTS endpoint...');
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/ai/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ text: textToSpeak }),
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ TTS request failed:');
      console.error(errorText);
      process.exit(1);
    }

    // Step 3: Save audio file
    console.log('\n3️⃣ Saving audio file...');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const outputPath = resolve(process.cwd(), 'aisha-tts-test.mp3');
    writeFileSync(outputPath, buffer);
    
    console.log('✅ Audio saved:', outputPath);
    console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB`);
    
    console.log('\n🎉 TTS test successful!');
    console.log(`\nPlay audio: mpg123 "${outputPath}" or open in media player`);
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    process.exit(1);
  }
}

testTTS().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
