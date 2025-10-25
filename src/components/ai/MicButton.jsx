import React from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

export default function MicButton({ className = "" }) {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);

  const recognitionRef = React.useRef(null);
  const keepAliveRef = React.useRef(false);
  const isStartingRef = React.useRef(false);
  const restartTimerRef = React.useRef(null);
  const lastStartRef = React.useRef(0);
  const silenceTimerRef = React.useRef(null);
  const audioPlayingRef = React.useRef(false); // NEW: Track if audio is playing

  const restartWithDelay = React.useCallback((delayMs = 1200) => {
    clearTimeout(restartTimerRef.current);
    const elapsed = performance.now() - (lastStartRef.current || 0);
    const minGap = 1200;
    const jitter = 100 + Math.floor(Math.random() * 200);
    const wait = Math.max(delayMs, minGap - Math.max(0, elapsed)) + jitter;

    restartTimerRef.current = setTimeout(() => {
      if (!keepAliveRef.current || audioPlayingRef.current) return; // Don't restart if audio is playing
      const recog = recognitionRef.current;
      if (!recog || isStartingRef.current) return;
      try {
        isStartingRef.current = true;
        recog.start();
        console.log('[MicButton] Restarted recognition after delay');
      } catch (err) {
        console.warn('[MicButton] Restart failed:', err);
        isStartingRef.current = false;
        restartWithDelay(1400);
      }
    }, wait);
  }, []);

  const scheduleSilenceCheck = React.useCallback(() => {
    clearTimeout(silenceTimerRef.current);
  }, []);

  React.useEffect(() => {
    console.log('[MicButton] Initializing...');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('[MicButton] Speech Recognition not supported in this browser');
      return;
    }

    console.log('[MicButton] Speech Recognition supported!');
    setSupported(true);
    const recog = new SR();
    recog.lang = "en-US";
    recog.continuous = true;
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      console.log('[MicButton] Recognition started');
      lastStartRef.current = performance.now();
      setListening(true);
      window.dispatchEvent(new CustomEvent("chat:mic-active", { detail: { active: true } }));
      isStartingRef.current = false;
      scheduleSilenceCheck();
    };

    recog.onresult = (e) => {
      // Ignore results while audio is playing
      if (audioPlayingRef.current) {
        console.log('[MicButton] Ignoring speech during audio playback');
        return;
      }
      
      console.log('[MicButton] Got speech result:', e);
      const parts = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0]?.transcript) parts.push(r[0].transcript);
      }
      const transcript = parts.join(" ").trim();
      console.log('[MicButton] Final transcript:', transcript);
      if (transcript) {
        window.dispatchEvent(new CustomEvent("chat:voice-result", { detail: { transcript } }));
      }
      scheduleSilenceCheck();
    };

    recog.onspeechend = () => {
      console.log('[MicButton] Speech ended');
      scheduleSilenceCheck();
    };

    recog.onerror = (ev) => {
      const error = (ev && ev.error) || "";
      console.warn('[MicButton] Recognition error:', error);
      const recoverable =
        ["no-speech", "aborted", "network", "audio-capture", "service-not-allowed"].includes(error) ||
        /busy|in use|invalid-state/i.test(error);
      if (keepAliveRef.current && recoverable && !audioPlayingRef.current) {
        console.log('[MicButton] Recoverable error, restarting...');
        restartWithDelay(error === "invalid-state" ? 1500 : 1000);
        return;
      }
      console.error('[MicButton] Unrecoverable error, stopping');
      setListening(false);
      window.dispatchEvent(new CustomEvent("chat:mic-active", { detail: { active: false } }));
    };

    recog.onend = () => {
      console.log('[MicButton] Recognition ended');
      if (keepAliveRef.current && !audioPlayingRef.current) {
        console.log('[MicButton] Keep-alive is true, restarting...');
        restartWithDelay(1200);
        return;
      }
      setListening(false);
      window.dispatchEvent(new CustomEvent("chat:mic-active", { detail: { active: false } }));
    };

    recognitionRef.current = recog;
    console.log('[MicButton] Recognition object created');

    // NEW: Listen for audio lock/unlock events
    const handleLockOpen = () => {
      console.log('[MicButton] Audio playback started - pausing recognition');
      audioPlayingRef.current = true;
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch (e) {
        console.warn('[MicButton] Failed to stop recognition during audio lock:', e);
      }
    };

    const handleUnlockOpen = () => {
      console.log('[MicButton] Audio playback ended - resuming recognition');
      audioPlayingRef.current = false;
      if (keepAliveRef.current) {
        restartWithDelay(800); // Short delay before restarting
      }
    };

    window.addEventListener('chat:lock-open', handleLockOpen);
    window.addEventListener('chat:unlock-open', handleUnlockOpen);

    const restartTimerId = restartTimerRef.current;
    const silenceTimerId = silenceTimerRef.current;

    return () => {
      console.log('[MicButton] Cleaning up...');
      keepAliveRef.current = false;
      clearTimeout(restartTimerId);
      clearTimeout(silenceTimerId);
      window.removeEventListener('chat:lock-open', handleLockOpen);
      window.removeEventListener('chat:unlock-open', handleUnlockOpen);
  try { recog.stop(); } catch (e) { void e; }
      recognitionRef.current = null;
      isStartingRef.current = false;
    };
  }, [restartWithDelay, scheduleSilenceCheck]);

  const start = () => {
    console.log('[MicButton] Start button clicked');
    const recog = recognitionRef.current;
    if (!recog) {
      console.error('[MicButton] No recognition object');
      return;
    }
    if (isStartingRef.current) {
      console.warn('[MicButton] Already starting');
      return;
    }
    if (listening) {
      console.warn('[MicButton] Already listening');
      return;
    }
    
    console.log('[MicButton] Starting recognition...');
    keepAliveRef.current = true;
    try {
      isStartingRef.current = true;
      recog.start();
      console.log('[MicButton] Recognition.start() called');
    } catch (err) {
      console.error('[MicButton] Failed to start:', err);
      isStartingRef.current = false;
      restartWithDelay(1400);
    }
  };

  const stop = () => {
    console.log('[MicButton] Stop button clicked');
    keepAliveRef.current = false;
    audioPlayingRef.current = false;
    clearTimeout(restartTimerRef.current);
    clearTimeout(silenceTimerRef.current);
    try { 
      recognitionRef.current?.stop();
      console.log('[MicButton] Recognition stopped');
    } catch (err) {
      console.error('[MicButton] Error stopping:', err);
    }
  };

  const toggle = () => {
    console.log('[MicButton] Toggle clicked, current state:', { 
      supported, 
      listening, 
      keepAlive: keepAliveRef.current,
      isStarting: isStartingRef.current,
      audioPlaying: audioPlayingRef.current
    });
    
    if (!supported || !recognitionRef.current) {
      console.error('[MicButton] Cannot toggle - not supported or no recognition object');
      return;
    }
    
    if (keepAliveRef.current || listening || isStartingRef.current) {
      stop();
    } else {
      start();
    }
  };

  console.log('[MicButton] Rendering, supported:', supported);

  if (!supported) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={`bg-slate-700 border-slate-600 text-slate-300 ${className}`}
        disabled
        title="Speech recognition not supported in this browser"
      >
        <MicOff className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <Button
      variant={listening ? "default" : "outline"}
      size="icon"
      onClick={toggle}
      className={listening ? "bg-red-600 hover:bg-red-700" : `bg-slate-700 border-slate-600 text-slate-300 ${className}`}
      title={listening ? "Stop listening" : "Start voice input"}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </Button>
  );
}