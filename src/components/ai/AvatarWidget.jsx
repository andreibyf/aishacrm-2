import { useState, useEffect, useRef } from 'react'

export default function AvatarWidget({
  agentId,
  apiKey,
  onMessage,
  onNavigate
}) {
  const [_isReady, _setIsReady] = useState(false); // isReady state added as per outline
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const widgetRef = useRef(null);

  // This useEffect now only handles global AI events to update listening/speaking states.
  // It no longer handles 'thinking' state as per the new design,
  // and 'idle' is used to correctly reset 'speaking'.
  useEffect(() => {
    const onSpeaking = () => setIsSpeaking(true);
    const onIdle = () => {
      // The original audio element dispatched 'ai:idle' on 'onEnded'.
      // With the audio element removed, 'ai:idle' must be dispatched by some other
      // mechanism when speaking stops, or 'isSpeaking' will remain true.
      // Assuming 'ai:idle' still functions as the event to signal the end of AI activity.
      setIsSpeaking(false);
    };
    const onListening = (e) => setIsListening(e.detail.isListening);

    window.addEventListener('ai:speaking', onSpeaking);
    window.addEventListener('ai:idle', onIdle);
    window.addEventListener('ai:listening', onListening);

    return () => {
      window.removeEventListener('ai:speaking', onSpeaking);
      window.removeEventListener('ai:idle', onIdle);
      window.removeEventListener('ai:listening', onListening);
    };
  }, []);

  return (
    <div
      id="ai-avatar-launcher"
      ref={widgetRef}
      className="fixed bottom-4 right-24 z-[10005]"
      style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
      }}
    >
      {/* Animated Glow Ring - BEHIND everything */}
      <div
        className={`absolute inset-0 transition-all duration-300 ${
          isSpeaking ? 'animate-pulse' : ''
        }`}
        style={{
          borderRadius: '50%',
          background: isSpeaking
            ? 'radial-gradient(circle, rgba(34, 197, 94, 0.5) 0%, rgba(34, 197, 94, 0.2) 50%, transparent 70%)'
            : isListening
            ? 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(59, 130, 246, 0.2) 50%, transparent 70%)'
            : 'radial-gradient(circle, rgba(234, 179, 8, 0.4) 0%, rgba(234, 179, 8, 0.15) 50%, transparent 70%)',
          filter: 'blur(12px)',
          transform: isSpeaking ? 'scale(1.4)' : isListening ? 'scale(1.3)' : 'scale(1.2)',
        }}
      />

      {/* Colored Border Circle */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          borderRadius: '50%',
          border: '3px solid',
          borderColor: isSpeaking
            ? 'rgb(34, 197, 94)' // green-500
            : isListening
            ? 'rgb(59, 130, 246)' // blue-500
            : 'rgb(234, 179, 8)', // yellow-500
          boxShadow: isSpeaking
            ? '0 0 25px rgba(34, 197, 94, 0.7), 0 0 50px rgba(34, 197, 94, 0.4), inset 0 0 20px rgba(34, 197, 94, 0.2)'
            : isListening
            ? '0 0 25px rgba(59, 130, 246, 0.7), 0 0 50px rgba(59, 130, 246, 0.4), inset 0 0 20px rgba(59, 130, 246, 0.2)'
            : '0 0 20px rgba(234, 179, 8, 0.5), 0 0 40px rgba(234, 179, 8, 0.3)',
        }}
      />

      {/* Avatar Image Container - FULLY CIRCULAR */}
      <div
        className="absolute flex items-center justify-center bg-slate-900 overflow-hidden"
        style={{
          top: '6px',
          left: '6px',
          right: '6px',
          bottom: '6px',
          borderRadius: '50%',
          width: 'calc(100% - 12px)',
          height: 'calc(100% - 12px)',
        }}
      >
        <img
          src="/assets/Ai-SHA-logo-2.png"
          alt="AI Assistant"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            transform: isSpeaking ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.3s ease',
          }}
        />
      </div>

      {/* Status Indicator Dot */}
      <div
        className="absolute bottom-0 right-0"
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          border: '2px solid rgb(15, 23, 42)',
          backgroundColor: isSpeaking
            ? 'rgb(34, 197, 94)' // green
            : isListening
            ? 'rgb(59, 130, 246)' // blue
            : 'rgb(234, 179, 8)', // yellow
          boxShadow: isSpeaking || isListening
            ? '0 0 10px currentColor, 0 0 20px currentColor'
            : '0 0 6px currentColor',
        }}
      />

      {/* Pulse animation rings for speaking */}
      {isSpeaking && (
        <>
          <div
            className="absolute inset-0 border-2 border-green-500 animate-ping"
            style={{
              borderRadius: '50%',
              opacity: 0.4,
              animationDuration: '1s'
            }}
          />
          <div
            className="absolute inset-0 border-2 border-green-400 animate-ping"
            style={{
              borderRadius: '50%',
              opacity: 0.3,
              animationDuration: '1.5s'
            }}
          />
        </>
      )}
    </div>
  );
}
