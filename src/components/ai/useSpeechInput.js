import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '@/utils/resolveApiUrl.js';

export function useSpeechInput(options = {}) {
  const { onFinalTranscript } = options;
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const finalTranscriptRef = useRef(onFinalTranscript);

  useEffect(() => {
    finalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append('file', blob, 'voice.webm');
          const resp = await fetch(resolveApiUrl('/api/ai/speech-to-text'), {
            method: 'POST',
            body: form,
          });
          if (!resp.ok) throw new Error(`STT failed: ${resp.status}`);
          const data = await resp.json();
          const text = data?.text || '';
          if (typeof finalTranscriptRef.current === 'function') {
            try {
              finalTranscriptRef.current(text);
            } catch (callbackError) {
              console.warn('[useSpeechInput] onFinalTranscript callback failed:', callbackError);
            }
          }
          setTranscript(text);
        } catch (err) {
          setError(err);
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setError(err);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
      }
    } catch (err) {
      setError(err);
    }
  }, []);

  return { transcript, isRecording, isTranscribing, error, startRecording, stopRecording };
}
