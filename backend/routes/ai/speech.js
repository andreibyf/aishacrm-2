/**
 * AI Speech Routes
 * Text-to-Speech (TTS) and Speech-to-Text (STT) endpoints
 */

import express from 'express';
import multer from 'multer';
import logger from '../../lib/logger.js';
import { getOpenAIClient } from '../../lib/aiProvider.js';
import { resolveLLMApiKey, getTenantIdFromRequest } from '../../lib/aiEngine/index.js';

export default function createSpeechRoutes(_pgPool) {
  const router = express.Router();
  
  const DEFAULT_STT_MODEL = process.env.OPENAI_STT_MODEL || 'whisper-1';
  const MAX_STT_AUDIO_BYTES = parseInt(process.env.MAX_STT_AUDIO_BYTES || '6000000', 10);

  const sttUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_STT_AUDIO_BYTES },
  });

  const maybeParseMultipartAudio = (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return next();
    }

    return sttUpload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ status: 'error', message: 'Audio file is too large' });
      }
      logger.warn('[AI][STT] Multer upload error:', err?.message || err);
      return res.status(400).json({ status: 'error', message: 'Invalid audio upload' });
    });
  };

  /**
   * POST /api/ai/tts
   * ElevenLabs TTS proxy – returns audio (binary). Caps text length and validates env.
   */
  router.post('/tts', async (req, res) => {
    try {
      const { text } = req.body || {};
      const apiKey = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      if (!apiKey || !voiceId) {
        logger.warn('[AI][TTS] ElevenLabs configuration missing');
        return res.status(503).json({
          status: 'error',
          message: 'TTS service not configured (missing API key or Voice ID)'
        });
      }
      const content = (text || '').toString().slice(0, 4000);
      if (!content) return res.status(400).json({ status: 'error', message: 'Text required' });

      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({ text: content }),
      });

      if (!resp.ok) {
        const msg = await resp.text();
        return res.status(resp.status).json({ status: 'error', message: msg || 'TTS error' });
      }

      const arrayBuffer = await resp.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err?.message || 'Server error' });
    }
  });

  /**
   * POST /api/ai/speech-to-text
   * Simple STT endpoint – placeholder using OpenAI Whisper if configured, otherwise mock.
   */
  router.post('/speech-to-text', maybeParseMultipartAudio, async (req, res) => {
    try {
      let audioBuffer = null;
      let mimeType = null;
      let fileName = 'speech.webm';

      if (req.file?.buffer) {
        audioBuffer = req.file.buffer;
        mimeType = req.file.mimetype || 'audio/webm';
        fileName = req.file.originalname || fileName;
      } else if (req.body?.audioBase64) {
        try {
          const base64Payload = req.body.audioBase64.includes(',')
            ? req.body.audioBase64.split(',').pop()
            : req.body.audioBase64;
          audioBuffer = Buffer.from(base64Payload, 'base64');
          mimeType = req.body.mimeType || 'audio/webm';
          fileName = req.body.fileName || fileName;
        } catch (err) {
          logger.warn('[AI][STT] Failed to decode base64 audio payload:', err?.message || err);
          return res.status(400).json({ status: 'error', message: 'Invalid audio payload' });
        }
      }

      if (!audioBuffer?.length) {
        return res.status(400).json({ status: 'error', message: 'No audio provided' });
      }

      if (audioBuffer.length > MAX_STT_AUDIO_BYTES) {
        return res.status(400).json({ status: 'error', message: 'Audio exceeds maximum allowed size' });
      }

      const tenantIdentifier = getTenantIdFromRequest(req) || req.body?.tenant_id;

      const apiKey = await resolveLLMApiKey({
        explicitKey: req.body?.openai_api_key,
        headerKey: req.get('x-openai-key'),
        userKey: req.user?.openai_api_key,
        tenantSlugOrId: tenantIdentifier,
      });

      if (!apiKey) {
        return res.status(400).json({ status: 'error', message: 'OpenAI API key not configured for this tenant' });
      }

      const client = getOpenAIClient(apiKey);
      if (!client) {
        return res.status(500).json({ status: 'error', message: 'Unable to initialize speech model client' });
      }

      const safeMime = mimeType || 'audio/webm';
      const safeName = fileName || 'speech.webm';
      
      // Log audio details for debugging
      logger.debug('[AI][STT] Processing audio:', {
        size: audioBuffer.length,
        mimeType: safeMime,
        fileName: safeName,
      });

      // Create a File-like object that OpenAI SDK can handle
      // OpenAI SDK accepts: File, Blob, or a readable stream with name property
      const audioFile = await import('openai').then(({ toFile }) => 
        toFile(audioBuffer, safeName, { type: safeMime })
      );

      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: DEFAULT_STT_MODEL,
      });

      const transcriptText = transcription?.text?.trim() || '';
      return res.json({
        status: 'success',
        data: {
          transcript: transcriptText,
        },
        text: transcriptText,
      });
    } catch (err) {
      logger.error('[AI][STT] Transcription failed:', err?.message || err);
      return res.status(500).json({ status: 'error', message: 'Unable to transcribe audio right now' });
    }
  });

  return router;
}