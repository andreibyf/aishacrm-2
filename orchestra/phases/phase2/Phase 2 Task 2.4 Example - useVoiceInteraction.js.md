`// src/hooks/useVoiceInteraction.js`
`import { useCallback, useMemo, useState } from 'react';`
`import { useSpeechInput } from '@/components/ai/useSpeechInput.js';`
`import { useSpeechOutput } from '@/components/ai/useSpeechOutput.js';`
`import { useRealtimeAiSHA } from '@/hooks/useRealtimeAiSHA.js';`

`/**`
 * `Unified voice interaction hook for AiSHA.`
 * `Coordinates:`
 *  `- STT (speech input)`
 *  `- TTS (speech output)`
 *  `- Realtime session state`
 *  `- Voice mode: 'idle' | 'continuous' | 'push_to_talk'`
 `*`
 * `This hook should delegate actual message sending to the`
 * `existing assistant pipeline (processChatCommand / sidebar state),`
 * `not call OpenAI directly.`
 `*/`
`export function useVoiceInteraction(options = {}) {`
  `const {`
    `// Future config knobs if needed`
  `} = options;`

  `const [mode, setMode] = useState('idle'); // 'idle' | 'continuous' | 'push_to_talk'`
  `const [lastTranscript, setLastTranscript] = useState('');`

  `const {`
    `transcript,`
    `isRecording,`
    `isTranscribing,`
    `startRecording,`
    `stopRecording,`
    `resetTranscript,`
    `error: sttError,`
  `} = useSpeechInput();`

  `const {`
    `isLoading: isSpeakingLoading,`
    `isPlaying,`
    `playText,`
    `stop: stopSpeaking,`
    `error: ttsError,`
  `} = useSpeechOutput();`

  `const {`
    `isRealtimeActive,`
    `connectRealtime,`
    `disconnectRealtime,`
    `sendUserMessage: sendRealtimeUserMessage,`
    `error: realtimeError,`
  `} = useRealtimeAiSHA();`

  `const isSpeaking = isSpeakingLoading || isPlaying;`

  `const error = useMemo(`
    `() => sttError || ttsError || realtimeError || null,`
    `[sttError, ttsError, realtimeError],`
  `);`

  `const reset = useCallback(() => {`
    `setMode('idle');`
    `setLastTranscript('');`
    `resetTranscript();`
    `stopSpeaking();`
    `// Do not auto-disconnect realtime here – sidebar controls that.`
  `}, [resetTranscript, stopSpeaking]);`

  `/**`
   * `Called by AiSidebar when a voice transcript is ready`
   * `to be sent as a user message.`
   * `It must use the existing assistant pipeline:`
   *  `- If realtime active: sendRealtimeUserMessage(...)`
   *  `- Else: the sidebar should call its normal sendMessage(...)`
   `*`
   * `This hook only provides a convenience wrapper.`
   `*/`
  `const sendTextMessage = useCallback(`
    `async (text, { useRealtime = isRealtimeActive, metadata = {} } = {}) => {`
      `if (!text || !text.trim()) return;`
      `setLastTranscript(text);`

      `if (useRealtime && isRealtimeActive && sendRealtimeUserMessage) {`
        `await sendRealtimeUserMessage(text, { origin: 'voice', ...metadata });`
        `return;`
      `}`

      `// Fallback: let caller route to REST chat path.`
      `// We just return the text + metadata so caller can pass it`
      `// into its existing sendMessage pipeline.`
      `return { text, metadata: { origin: 'voice', ...metadata } };`
    `},`
    `[isRealtimeActive, sendRealtimeUserMessage],`
  `);`

  `const startContinuous = useCallback(() => {`
    `setMode('continuous');`
    `startRecording();`
  `}, [startRecording]);`

  `const stopContinuous = useCallback(() => {`
    `setMode('idle');`
    `stopRecording();`
  `}, [stopRecording]);`

  `const startPushToTalk = useCallback(() => {`
    `setMode('push_to_talk');`
    `startRecording();`
  `}, [startRecording]);`

  `const stopPushToTalk = useCallback(() => {`
    `// Caller (AiSidebar) will read transcript and decide`
    `// when/how to call sendTextMessage with safety filters.`
    `stopRecording();`
  `}, [stopRecording]);`

  `return {`
    `mode,`
    `setMode,`

    `// STT / voice input`
    `isListening: isRecording,`
    `isTranscribing,`
    `transcript,`
    `lastTranscript,`

    `// TTS / voice output`
    `isSpeaking,`
    `playText,`
    `stopSpeaking,`

    `// Realtime`
    `isRealtimeActive,`
    `connectRealtime,`
    `disconnectRealtime,`

    `// Actions`
    `startContinuous,`
    `stopContinuous,`
    `startPushToTalk,`
    `stopPushToTalk,`
    `sendTextMessage,`
    `reset,`

    `// Errors`
    `error,`
  `};`
`}`
