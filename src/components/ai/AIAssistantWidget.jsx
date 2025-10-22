
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateDailyBriefing } from "@/api/functions";
import { generateElevenLabsSpeech } from "@/api/functions";
import { processChatCommand } from "@/api/functions";

export default function AIAssistantWidget({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState(null);
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [hasBriefedToday, setHasBriefingToday] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [micPermissionStatus, setMicPermissionStatus] = useState('unknown');
  const [permissionError, setPermissionError] = useState('');
  const [isDetectingVoice, setIsDetectingVoice] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // Add processing state to prevent loops

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Refs to hold mutable state/callback values for stable useEffect closures
  const isListeningRef = useRef(isListening);
  const currentTranscriptRef = useRef(currentTranscript);
  const handleSendMessageRef = useRef(() => {}); // Will be updated by useEffect
  const stopVoiceModeRef = useRef(() => {}); // Will be updated by useEffect
  const isProcessingRef = useRef(isProcessing); // New ref for isProcessing
  const isLoadingRef = useRef(isLoading); // New ref for isLoading
  const processVoiceMessageRef = useRef(() => {}); // New ref for processVoiceMessage

  // Update refs whenever the corresponding state/callback changes
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { currentTranscriptRef.current = currentTranscript; }, [currentTranscript]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);


  // Format time remaining for display
  const formatTimeRemaining = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const stopSpeaking = useCallback(() => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
  }, [currentAudio]);

  // Separate fallback function to avoid repetition
  const fallbackToWebSpeech = useCallback((text) => {
    if (!voiceEnabled || !text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('❌ Cannot speak (fallback): voiceEnabled =', voiceEnabled, 'text =', text);
      return;
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        utterance.volume = 0.8;
        
        // Try to find a female voice
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(voice => 
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('samantha') ||
          voice.name.toLowerCase().includes('karen') ||
          voice.name.toLowerCase().includes('susan')
        );
        
        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }
        
        utterance.onstart = () => {
          console.log('🔊 Web Speech API started');
          setIsSpeaking(true);
        };
        utterance.onend = () => {
          console.log('🔊 Web Speech API ended');
          setIsSpeaking(false);
        };
        utterance.onerror = (error) => {
          console.error('🔊 Web Speech API error:', error);
          setIsSpeaking(false);
        };
        
        window.speechSynthesis.speak(utterance);
        console.log('🔊 Using browser TTS fallback');
      } catch (webSpeechError) {
        console.error('❌ Web Speech API also failed:', webSpeechError);
        setIsSpeaking(false);
      }
    } else {
      console.warn('❌ No speech synthesis available');
      setIsSpeaking(false);
    }
  }, [voiceEnabled]);

  const speakText = useCallback(async (text) => {
    if (!voiceEnabled || !text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('❌ Cannot speak: voiceEnabled =', voiceEnabled, 'text =', text);
      return;
    }
    
    try {
      // Stop any current speech
      stopSpeaking();
      
      setIsSpeaking(true);

      // Try ElevenLabs first (premium voice - Rachel)
      console.log('🎵 Calling ElevenLabs TTS with text:', text.substring(0, Math.min(text.length, 50)) + '...');
      
      const response = await generateElevenLabsSpeech({
        text: text.trim(), // Ensure text is properly passed and trimmed
        voice_id: '21m00Tcm4TlvDq8ikWAM' // Rachel - professional female voice
      });

      if (response && response.data && response.data.success) {
        // Play ElevenLabs audio
        console.log('✅ ElevenLabs response received, creating audio...');
        const audioBlob = new Blob([
          Uint8Array.from(atob(response.data.audio_base64), c => c.charCodeAt(0))
        ], { type: 'audio/mpeg' });
        
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        setCurrentAudio(audio);
        
        audio.onended = () => {
          console.log('🎵 Audio playback ended');
          setIsSpeaking(false);
          setCurrentAudio(null);
          URL.revokeObjectURL(audioUrl);
        };
        
        audio.onerror = (error) => {
          console.warn('❌ ElevenLabs audio playback failed:', error);
          setIsSpeaking(false);
          setCurrentAudio(null);
          URL.revokeObjectURL(audioUrl);
          fallbackToWebSpeech(text);
        };
        
        try {
          await audio.play();
          console.log('✨ Using ElevenLabs premium voice (Rachel)');
        } catch (playError) {
          console.warn('❌ Audio play failed:', playError);
          fallbackToWebSpeech(text);
        }
        
      } else {
        console.warn('❌ ElevenLabs response unsuccessful:', response?.data);
        fallbackToWebSpeech(text);
      }
      
    } catch (error) {
      console.warn('❌ ElevenLabs TTS failed:', error.message);
      setIsSpeaking(false);
      fallbackToWebSpeech(text);
    }
  }, [voiceEnabled, stopSpeaking, fallbackToWebSpeech]);

  const triggerDailyBriefing = useCallback(async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    
    try {
      console.log('🌅 Generating daily briefing...');
      
      const response = await generateDailyBriefing();
      
      if (response.data && response.data.success) {
        const briefingMessage = {
          role: 'assistant',
          content: response.data.briefing,
          isBriefing: true,
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, briefingMessage]);
        
        // Mark as briefed today
        const today = new Date().toDateString();
        localStorage.setItem('lastBriefingDate', today);
        setHasBriefingToday(true);
        
        // Auto-speak the briefing
        await speakText(response.data.briefing);
        
        toast.success('🌅 Daily briefing generated!');
      } else {
        throw new Error(response.data?.error || 'Failed to generate briefing');
      }
    } catch (error) {
      console.error('Daily briefing error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered an issue generating your daily briefing. Please try again.',
        timestamp: Date.now(),
        isError: true // Added isError for styling
      };
      setMessages(prev => [...prev, errorMessage]);
      toast.error('Daily briefing failed: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, speakText]);

  // Check microphone permissions (kept for permission indicator, though startVoiceMode handles acquisition)
  const checkMicrophonePermissions = useCallback(async () => {
    if (!navigator.permissions || !navigator.mediaDevices) {
      console.warn('Permissions API or MediaDevices not supported');
      setMicPermissionStatus('unknown');
      return 'unknown';
    }

    try {
      // Check current permission status
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      setMicPermissionStatus(permissionStatus.state);
      
      // Listen for permission changes
      permissionStatus.onchange = () => {
        setMicPermissionStatus(permissionStatus.state);
        if (permissionStatus.state === 'denied' && isListeningRef.current) { // Use ref here
          stopVoiceModeRef.current(); // Use ref here
          setPermissionError('Microphone access was revoked. Voice mode has been disabled.');
        }
      };

      return permissionStatus.state;
    } catch (error) {
      console.warn('Could not check microphone permissions:', error);
      setMicPermissionStatus('unknown');
      return 'unknown';
    }
  }, []);

  // Request microphone access (kept for manual request, though startVoiceMode handles acquisition)
  const requestMicrophoneAccess = useCallback(async () => {
    setPermissionError('');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      await checkMicrophonePermissions();
      toast.success('🎤 Microphone access granted! Voice mode is ready.');
      return true;
    } catch (error) {
      console.error('Microphone access denied:', error);
      if (error.name === 'NotAllowedError') {
        setPermissionError('Microphone access denied. Please enable microphone permissions in your browser settings.');
        setMicPermissionStatus('denied');
      } else if (error.name === 'NotFoundError') {
        setPermissionError('No microphone found. Please connect a microphone and try again.');
      } else {
        setPermissionError('Could not access microphone. Please check your device settings.');
      }
      toast.error('Microphone access failed. Check permissions and try again.');
      return false;
    }
  }, [checkMicrophonePermissions]);

  // Separate function to process voice messages
  const processVoiceMessage = useCallback(async (messageText) => {
    // Prevent duplicate processing
    if (isProcessingRef.current || isLoadingRef.current) { // Use refs for latest state
      console.warn('⚠️ Already processing or loading, skipping voice message');
      return;
    }

    setIsProcessing(true);
    setIsLoading(true);

    try {
      console.log('🤖 Sending voice message to AI:', messageText);
      
      const response = await processChatCommand({
        message: messageText,
        user_context: {
          email: user.email,
          full_name: user.full_name || user.display_name,
          role: user.role,
          tenant_id: user.tenant_id
        }
      });

      // Check if we should still process (user might have stopped voice mode)
      if (!isListeningRef.current && !voiceEnabled) { // Use ref for isListening
        console.log('🛑 User stopped voice mode or voice is disabled, not adding response or speaking.');
        return; // Early exit if voice mode is off and voice disabled
      }

      if (response?.data?.status === 'success' && response.data.response) {
        const assistantMessage = {
          role: 'assistant',
          content: response.data.response,
          timestamp: Date.now(),
          source: response.data.source || 'ai',
          isVoiceResponse: true
        };
        
        console.log('🤖 Adding AI response to chat:', assistantMessage.content.substring(0, Math.min(assistantMessage.content.length, 100)) + '...');
        setMessages(prev => [...prev, assistantMessage]);
        
        // Only speak if voice is still enabled
        if (voiceEnabled) {
          console.log('🔊 Speaking AI response...');
          setTimeout(() => {
            speakText(response.data.response);
          }, 300); // Small delay to allow UI update
        }
        
        toast.success('🤖 AI responded to your voice message!');
        
      } else {
        throw new Error(response?.data?.response || 'No response received from AI');
      }
      
    } catch (error) {
      console.error('💬 Voice message processing failed:', error);
      
      // Only show error if voice is enabled or we are still "listening"
      if (voiceEnabled || isListeningRef.current) {
        const errorMessage = {
          role: 'assistant',
          content: `I apologize, but I encountered an error processing your voice message: ${error.message}. Please try again.`,
          timestamp: Date.now(),
          isError: true
        };
        setMessages(prev => [...prev, errorMessage]);
        toast.error('Voice processing failed: ' + error.message);
      }
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  }, [user, voiceEnabled, speakText]);

  // Update processVoiceMessageRef whenever processVoiceMessage changes
  useEffect(() => { processVoiceMessageRef.current = processVoiceMessage; }, [processVoiceMessage]);


  // Update handleSendMessage to work better with voice
  const handleSendMessage = useCallback(async (messageText = null) => {
    const messageToSend = messageText || inputMessage.trim();
    if (!messageToSend || isLoadingRef.current || isProcessingRef.current) { // Use refs for latest state
      console.warn('Cannot send message: empty, loading, or already processing');
      return;
    }

    // Only add user message if it's not from voice (voice already added it)
    if (!messageText) { // If messageText is null, it's a typed message
      setInputMessage(''); // Clear input for typed messages
      
      const userMessage = {
        role: 'user',
        content: messageToSend,
        timestamp: Date.now(),
        isVoice: false // Mark as not from voice for distinction
      };
      
      setMessages(prev => [...prev, userMessage]);
    }

    // Process the message (reuse the voice processing logic)
    await processVoiceMessage(messageToSend);
    
  }, [inputMessage, processVoiceMessage]); // Dependencies updated

  // Update handleSendMessageRef whenever handleSendMessage changes
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  const stopVoiceMode = useCallback(() => {
    console.log('🛑 Stopping voice mode...');
    
    setIsListening(false);
    setTimeRemaining(0);
    setIsDetectingVoice(false);
    setCurrentTranscript('');
    
    // Clear timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      console.log('⏰ Timer cleared');
    }

    // Stop recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.warn('Error stopping recognition:', error);
      }
    }
    
    stopSpeaking();
    toast.success('🎤 Voice mode OFF');
  }, [stopSpeaking]);

  // Update stopVoiceModeRef whenever stopVoiceMode changes
  useEffect(() => { stopVoiceModeRef.current = stopVoiceMode; }, [stopVoiceMode]);

  const startVoiceMode = useCallback(async () => {
    console.log('🚀 Starting voice mode...');
    
    // Check for speech recognition support first
    if (!speechRecognition) {
      toast.error('Voice recognition not supported in this browser');
      setPermissionError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari for voice commands.');
      return;
    }

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately, we just needed permission
      
      // Clear any existing states
      setIsListening(true);
      setTimeRemaining(120); // 2 minutes
      setIsDetectingVoice(false);
      setCurrentTranscript('');
      setPermissionError(null);

      // Add greeting message
      const greetingMessage = {
        role: 'assistant',
        content: "🎤 Voice mode activated! I'm listening for 2 minutes. You can ask me about your contacts, leads, activities, or anything else in your CRM.",
        timestamp: Date.now(),
        isGreeting: true
      };
      setMessages(prev => [...prev, greetingMessage]);

      // Start the timer countdown
      console.log('⏰ Starting timer countdown...');
      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          console.log('⏰ Timer tick, remaining:', prev - 1);
          if (prev <= 1) {
            console.log('⏰ Timer expired');
            stopVoiceMode();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Stop any active speech before starting recognition
      stopSpeaking();

      // Start speech recognition
      console.log('🎤 Starting speech recognition...');
      if (recognitionRef.current) {
        console.log('🎤 Starting speech recognition...');
        recognitionRef.current.start();
        toast.success('🎤 Voice mode ON - Speak now!');
      } else {
        console.error('Recognition ref is null, could not start.');
      }
    } catch (error) {
      console.error('❌ Failed to start voice mode:', error);
      toast.error('Failed to start voice recognition: ' + error.message);
      setPermissionError('Microphone access denied. Please allow access and try again.');
      // Ensure voice mode states are reset if start fails
      setIsListening(false);
      setTimeRemaining(0);
      setIsDetectingVoice(false);
      setCurrentTranscript('');
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [speechRecognition, stopVoiceMode, stopSpeaking]);


  const toggleVoiceMode = useCallback(() => {
    console.log('🔄 Toggle voice mode - current state:', isListening);
    if (isListening) {
      stopVoiceMode();
    } else {
      startVoiceMode();
    }
  }, [isListening, stopVoiceMode, startVoiceMode]);

  // Simplified speech recognition setup
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false; // Simplified: listen for one utterance then fires onend
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        if (!isListeningRef.current) { // Use ref for latest state
            console.log('🎤 Ignoring result - not listening anymore (via onresult)');
            return;
        }

        console.log('🎤 Speech result received');
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Show what we're hearing
        const displayText = finalTranscript || interimTranscript;
        if (displayText.trim()) {
          setCurrentTranscript(displayText.trim());
          setIsDetectingVoice(true);
        }

        // Process final result
        if (finalTranscript.trim() && finalTranscript.trim().length > 3) {
          console.log('🎤 Final speech:', finalTranscript);
          
          // Clear transcript display after brief delay
          setTimeout(() => setCurrentTranscript(''), 500);
          
          // Add user message
          const userMessage = {
            role: 'user',
            content: finalTranscript.trim(),
            timestamp: Date.now(),
            isVoice: true
          };
          setMessages(prev => [...prev, userMessage]);
          
          // Process with AI
          // Use ref for handleSendMessage to ensure latest version is called
          setTimeout(() => {
            handleSendMessageRef.current(finalTranscript.trim());
          }, 200);
        }
      };

      recognition.onstart = () => {
        console.log('🎤 Recognition started');
        setIsDetectingVoice(false);
      };

      recognition.onend = () => {
        console.log('🎤 Recognition ended, listening:', isListeningRef.current, 'time remaining:', timeRemaining);
        setIsDetectingVoice(false);
        
        // Restart if we're still supposed to be listening (2-min timer active)
        if (isListeningRef.current && timeRemaining > 0) {
          setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) { // Double check again before restarting
              try {
                recognitionRef.current.start();
                console.log('🎤 Recognition restarted successfully');
              } catch (error) {
                console.warn('Failed to restart recognition:', error);
              }
            }
          }, 100); // Small delay before attempting to restart
        } else if (recognitionRef.current) {
            // If we're not listening, ensure recognition is stopped
            try {
                recognitionRef.current.stop();
                console.log('🎤 Recognition manually stopped via onend (not listening)');
            } catch(e) {
                console.warn('Error stopping recognition onend cleanup:', e);
            }
        }
      };

      recognition.onerror = (event) => {
        console.log('🎤 Recognition error:', event.error);
        setIsDetectingVoice(false);
        
        if (event.error === 'not-allowed') {
          toast.error('Microphone access denied. Please enable permissions.');
          stopVoiceModeRef.current(); // Use ref here to ensure latest stopVoiceMode is called
          setPermissionError('Microphone access denied. Please allow access and try again.');
        } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.error('🎤 Unexpected recognition error:', event.error);
          // For other errors, don't stop voice mode, let onend handle restart if still active
        }
      };

      recognitionRef.current = recognition;
      setSpeechRecognition(recognition);
      console.log('🎤 Speech recognition initialized');
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort(); // Use abort for immediate cleanup on unmount
        } catch(e) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [stopVoiceMode, timeRemaining, isListening, handleSendMessage]); // Dependencies updated for stability

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check if user has been briefed today
  useEffect(() => {
    const lastBriefingDate = localStorage.getItem('lastBriefingDate');
    const today = new Date().toDateString();
    setHasBriefingToday(lastBriefingDate === today);
  }, []);

  // Auto-trigger briefing when widget opens (if enabled and not briefed today)
  useEffect(() => {
    if (isOpen && briefingEnabled && !hasBriefedToday && user) {
      const timer = setTimeout(() => {
        triggerDailyBriefing();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, briefingEnabled, hasBriefedToday, user, triggerDailyBriefing]);

  // Handle key press for Enter to send
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  // Helper function to get permission status icon and color
  const getPermissionIndicator = () => {
    switch (micPermissionStatus) {
      case 'granted':
        return { icon: '✅', color: 'text-green-600', text: 'Microphone ready' };
      case 'denied':
        return { icon: '❌', color: 'text-red-600', text: 'Microphone blocked' };
      case 'prompt':
        return { icon: '❓', color: 'text-yellow-600', text: 'Permission needed' };
      default:
        return { icon: '⚡', color: 'text-gray-600', text: 'Checking...' };
    }
  };

  // Render messages with better key handling and styling
  const renderMessages = () => {
    return messages.map((message, index) => (
      <div key={`${message.timestamp}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] p-3 rounded-lg ${
          message.role === 'user' 
            ? 'bg-blue-500 text-white rounded-br-sm' 
            : message.isBriefing
            ? 'bg-gradient-to-r from-purple-100 to-blue-100 border-l-4 border-purple-500 rounded-bl-sm'
            : message.isGreeting
            ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-l-4 border-green-500 rounded-bl-sm'
            : message.isError // New condition for error messages
            ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}>
          {message.isBriefing && <Badge className="mb-2 text-xs">Daily Briefing</Badge>}
          {message.isGreeting && <Badge className="mb-2 text-xs bg-green-600">Voice Greeting</Badge>}
          {message.isVoice && <Badge className="mb-2 text-xs bg-blue-400 text-white">Voice Input</Badge>}
          {message.isVoiceResponse && <Badge className="mb-2 text-xs bg-emerald-400 text-white">Voice Response</Badge>}
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          {message.source && message.source !== 'ai' && ( // Only show if source is not 'ai'
            <div className="mt-2 text-xs opacity-75">
              <Badge variant="outline" className="text-xs">
                Source: {message.source}
              </Badge>
            </div>
          )}
        </div>
      </div>
    ));
  };


  if (!user) return null;

  const permissionIndicator = getPermissionIndicator();

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative">
          <Button
            onClick={() => setIsOpen(!isOpen)}
            className={`w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 ${
              isListening 
                ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600' 
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
            } ${isDetectingVoice ? 'animate-pulse ring-4 ring-green-300' : ''}`}
          >
            {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
          </Button>
          
          {/* Permission Status Indicator */}
          {micPermissionStatus === 'denied' && (
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">
              !
            </div>
          )}
        </div>
      </div>

      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-lg shadow-2xl border z-50 flex flex-col">
          {/* Header */}
          <CardHeader className="text-white rounded-t-lg p-4 bg-gradient-to-r from-purple-600 to-blue-600">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                🤖 Ai-SHA Assistant
              </CardTitle>
              <div className="flex items-center gap-2">
                {isSpeaking && <Badge variant="secondary" className="text-xs">Speaking</Badge>}
                {isListening && timeRemaining > 0 && (
                  <Badge variant="secondary" className={`text-xs ${isDetectingVoice ? 'animate-pulse bg-green-200' : ''}`}>
                    🎤 {formatTimeRemaining(timeRemaining)}
                  </Badge>
                )}
                {isDetectingVoice && (
                  <Badge variant="secondary" className="text-xs bg-green-200 text-green-800 animate-pulse">
                    🗣️ Hearing You!
                  </Badge>
                )}
                 <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className="text-white hover:bg-white/20"
                >
                  {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            {/* Permission Status */}
            {recognitionRef.current && (
              <div className="mt-2 text-xs opacity-90 flex items-center gap-1">
                <span>{permissionIndicator.icon}</span>
                <span>{permissionIndicator.text}</span>
              </div>
            )}
          </CardHeader>
          
          {/* Voice Mode Indicator - New Placement */}
          {isListening && (
            <div className={`text-white p-3 text-center ${
              isDetectingVoice
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse'
                : 'bg-gradient-to-r from-red-500 to-pink-500' 
            }`}>
              <div className="flex items-center justify-center gap-2">
                <div className={`w-3 h-3 bg-white rounded-full ${isDetectingVoice ? 'animate-pulse' : ''}`}></div>
                <span className="font-medium text-lg">
                  🎤 LISTENING - {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </span>
              </div>
              {currentTranscript && (
                <div className="mt-2 text-sm bg-white/20 rounded p-2">
                  "{currentTranscript}"
                </div>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={stopVoiceMode}
                className="mt-2 text-white hover:bg-white/20"
              >
                Stop Listening
              </Button>
            </div>
          )}

          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Permission Error Alert */}
            {permissionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  <span className="text-red-500">⚠️</span>
                  <div className="text-red-700 text-xs">
                    <p className="font-semibold mb-1">Microphone Issue</p>
                    <p>{permissionError}</p>
                    {micPermissionStatus === 'denied' && (
                      <p className="mt-2">
                        <strong>Fix:</strong> Click the <span className="font-bold">🔒</span> or <span className="font-bold">🎤</span> icon in your browser's address bar → Allow microphone access → Refresh page
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {messages.length === 0 && !permissionError ? (
              <div className="text-center text-gray-500 mt-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Hello! I'm Ai-SHA, your CRM assistant.</p>
                <p className="text-sm">Ask me about contacts, leads, or use voice mode!</p>
                <ul className="text-xs mt-2 space-y-1">
                  <li>🎤 <strong>Toggle voice mode</strong> for 2 minutes</li>
                  <li>💬 Type commands</li>
                  <li>📊 Ask about your CRM data</li>
                  <li>📅 Get daily briefings</li>
                </ul>
                
                {recognitionRef.current && micPermissionStatus === 'prompt' && (
                  <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                    <p className="text-blue-700">🎤 Click the microphone button to enable voice mode</p>
                  </div>
                )}
              </div>
            ) : (
              renderMessages() // Call the new renderMessages function here
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Ai-SHA is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Button
                variant={isListening ? "destructive" : micPermissionStatus === 'denied' ? "secondary" : "outline"}
                size="sm"
                onClick={toggleVoiceMode}
                disabled={isLoading || !recognitionRef.current || isSpeaking || (micPermissionStatus === 'denied' && !isListening) || isProcessing}
                className={`shrink-0 ${isDetectingVoice ? 'animate-pulse ring-2 ring-green-400' : ''}`}
                title={micPermissionStatus === 'denied' ? 'Microphone access blocked' : 'Toggle voice mode'}
              >
                {isDetectingVoice ? (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-1"></div>
                    <Mic className="w-4 h-4" />
                  </div>
                ) : isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  micPermissionStatus === 'denied'
                    ? "Microphone access blocked. Enable for voice."
                    : "Type a message or click mic for voice mode..."
                }
                disabled={isLoading || isListening || micPermissionStatus === 'denied' || isProcessing}
                className="flex-1"
              />
              <Button 
                onClick={() => handleSendMessage()} 
                disabled={!inputMessage.trim() || isLoading || isProcessing}
                size="sm"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
              </Button>
            </div>
            
            {/* Daily Briefing Button */}
            {briefingEnabled && !hasBriefedToday && (
              <div className="mt-2">
                <Button
                  onClick={triggerDailyBriefing}
                  disabled={isLoading || isProcessing}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating briefing...
                    </>
                  ) : (
                    <>
                      ☀️ Get Daily Briefing
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
