
import React from "react";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { generateElevenLabsSpeech } from "@/api/functions";

export default function AudioPlayerButton(props) {
  // AUTO-CLEAR old disable flag on mount
  React.useEffect(() => {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem('disable_inline_audio') === 'true') {
        localStorage.removeItem('disable_inline_audio');
        console.log('[AudioPlayerButton] Cleared old disable_inline_audio flag from localStorage');
      }
      if (typeof window !== "undefined" && window.__AI_CONTEXT?.disable_inline_audio === true) {
        window.__AI_CONTEXT.disable_inline_audio = false;
        console.log('[AudioPlayerButton] Cleared global disable_inline_audio flag from window.__AI_CONTEXT');
      }
    } catch (e) {
      console.warn('[AudioPlayerButton] Could not clear disable flags:', e);
    }
  }, []);

  // Compute disabled flag without early-returning before hooks
  const disabledByProp = props?.hidden === true || props?.disableInlineAudio === true;
  const disabledByGlobal =
    (typeof window !== "undefined" && window.__AI_CONTEXT?.disable_inline_audio === true) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("disable_inline_audio") === "true");
  const disabled = disabledByProp || disabledByGlobal;

  // Hooks must always be called in the same order
  const [loading, setLoading] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const audioRef = React.useRef(null);
  const urlRef = React.useRef(null);

  const cleanup = () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (e) { /* ignore */ }
      audioRef.current.onended = null;
      audioRef.current.onpause = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch (e) { /* ignore */ }
      urlRef.current = null;
    }
    setPlaying(false);
  };

  React.useEffect(() => () => cleanup(), []);

  // If disabled, render nothing (hooks already called above to satisfy rules)
  if (disabled) {
    return null;
  }

  const ensureAudio = async () => {
    if (audioRef.current) return audioRef.current;

    setLoading(true);
    try {
      const resp = await generateElevenLabsSpeech({ text: props.text, voice_id: props.voiceId || "21m00Tcm4TlvDq8ikWAM" });

      let blob;
      const headers = resp?.headers;
      const ct = (headers?.["content-type"] || headers?.get?.("content-type") || "").toLowerCase();
      const data = resp?.data;

      // Preferred: JSON with base64 from our backend
      if (data?.audio_base64 && typeof data.audio_base64 === "string") {
        const decoded = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
        blob = new Blob([decoded], { type: "audio/mpeg" });
      } else if (typeof data === "string" && data.length > 0) {
        // Some wrappers may return a string; try parse JSON or base64
        try {
          const parsed = JSON.parse(data);
          if (parsed?.audio_base64) {
            const decoded = Uint8Array.from(atob(parsed.audio_base64), c => c.charCodeAt(0));
            blob = new Blob([decoded], { type: "audio/mpeg" });
          }
        } catch {
          // If JSON.parse failed, try direct base64
          try {
            const decoded = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            blob = new Blob([decoded], { type: "audio/mpeg" });
          } catch {
            // failed to parse as JSON or base64 string
          }
        }
      } else if (ct.includes("audio/") || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        // Raw audio fallback
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : (ArrayBuffer.isView(data) ? data : new Uint8Array([]));
        blob = new Blob([bytes], { type: "audio/mpeg" });
      }

      // Sanity: ensure we have some audio bytes (allow very short clips)
      if (!blob || blob.size <= 0) {
        throw new Error("Received empty audio");
      }

      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.preload = "auto";

      audio.onended = () => {
        setPlaying(false);
        window.dispatchEvent(new CustomEvent("chat:unlock-open"));
      };
      audio.onpause = () => {
        if (playing) {
          setPlaying(false);
          window.dispatchEvent(new CustomEvent("chat:unlock-open"));
        }
      };
      audio.onerror = () => {
        setPlaying(false);
        window.dispatchEvent(new CustomEvent("chat:unlock-open"));
      };

      audioRef.current = audio;
      return audio;
    } finally {
      setLoading(false);
    }
  };

  const onClick = async () => {
    if (loading) return;

    // Toggle pause if already playing
    if (playing) {
      try { audioRef.current?.pause(); } catch (e) { /* ignore */ }
      setPlaying(false);
      window.dispatchEvent(new CustomEvent("chat:unlock-open"));
      return;
    }

    const audio = await ensureAudio();
    if (!audio) return;

    try {
      window.dispatchEvent(new CustomEvent("chat:lock-open"));
      await audio.play();
      setPlaying(true);
    } catch (e) {
      // If autoplay/gesture blocks, unlock and stop
      window.dispatchEvent(new CustomEvent("chat:unlock-open"));
      setPlaying(false);
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={onClick} className={props.className || ""} title="Speak message">
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : (
        playing ? <VolumeX className="w-4 h-4 text-slate-300" /> : <Volume2 className="w-4 h-4 text-slate-300" />
      )}
    </Button>
  );
}
