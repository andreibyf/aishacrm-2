import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, TestTube, LayoutGrid, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { generateDailyBriefing } from '@/api/functions';
import { generateElevenLabsSpeech } from '@/api/functions';

// Helper to format time delta for display
function getTimeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const deltaMs = now - timestamp;
  const deltaSecs = Math.floor(deltaMs / 1000);
  const deltaMins = Math.floor(deltaSecs / 60);
  const deltaHours = Math.floor(deltaMins / 60);
  
  if (deltaSecs < 60) return 'Just now';
  if (deltaMins < 60) return `${deltaMins}m ago`;
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Helper to format exact time for tooltip
function getExactTime(timestamp) {
  if (!timestamp) return 'Never updated';
  return new Date(timestamp).toLocaleString();
}

export default function DashboardHeader({ user, showTestData, onTestDataToggle, onCustomizeClick, onRefresh, isRefreshing, isCached: _isCached, cachedAt }) {
  const [briefingLoading, setBriefingLoading] = React.useState(false);
  // Feature flag: hide Daily Voice Briefing button
  const SHOW_DAILY_BRIEFING = false;

  const isSuperadmin = user?.role === 'superadmin';

  const speakDailyBriefing = async () => {
    try {
      console.log('🎵 Generating daily briefing...');
      setBriefingLoading(true);
      
      const briefingResponse = await generateDailyBriefing();
      
      const rawBriefing = briefingResponse?.data?.briefing ?? "";
      const briefingText = String(rawBriefing).trim();

      if (briefingResponse?.data?.success && briefingText.length > 0) {
        console.log('✅ Daily briefing generated:', briefingText.substring(0, 100) + '...');
        
        console.log('🎵 Calling ElevenLabs for daily briefing speech...');
        const speechResponse = await generateElevenLabsSpeech({
          text: briefingText,
          voice_id: '21m00Tcm4TlvDq8ikWAM'
        });
        
        if (speechResponse?.data?.success) {
          const audioBlob = new Blob([
            Uint8Array.from(atob(speechResponse.data.audio_base64), c => c.charCodeAt(0))
          ], { type: 'audio/mpeg' });
          
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            console.log('🎵 Daily briefing speech completed');
          };
          
          audio.onerror = (error) => {
            console.error('❌ Audio playback failed:', error);
            URL.revokeObjectURL(audioUrl);
            toast.error('Audio playback failed');
          };
          
          await audio.play();
          console.log('✨ Daily briefing playing with premium voice');
          toast.success('🎵 Daily briefing is playing!');
          
        } else {
          console.error('❌ Speech generation failed:', speechResponse?.data);
          toast.error('Speech generation failed');
        }
        
      } else {
        console.error('❌ Daily briefing generation returned empty text:', briefingResponse?.data);
        toast.error('Daily briefing failed: No content to speak');
      }
      
    } catch (error) {
      console.error('❌ Daily briefing error:', error);
      toast.error('Daily briefing failed: ' + error.message);
    } finally {
      setBriefingLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-600 via-cyan-500 to-teal-600 rounded-xl p-6 md:p-8 mb-6 text-white shadow-lg">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Welcome to Ai-SHA CRM</h1>
          <p className="text-blue-100 mt-1">AI-powered cognitive relationship management and business growth</p>
        </div>
        <div className="flex items-center gap-4 mt-4 md:mt-0 flex-wrap">
          {isSuperadmin && (
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
              <TestTube className="w-4 h-4" />
              <Label htmlFor="test-data-toggle" className="text-sm cursor-pointer">
                Show Test Data
              </Label>
              <Switch
                id="test-data-toggle"
                checked={showTestData}
                onCheckedChange={onTestDataToggle}
                className="data-[state=checked]:bg-white/20"
              />
            </div>
          )}
          <Button 
            variant="outline"
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white backdrop-blur-sm text-sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            title={`Last updated: ${getExactTime(cachedAt)}\nClick to refresh with latest data`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Updating...' : `Updated ${getTimeAgo(cachedAt)}`}
          </Button>
          <Button 
            variant="outline"
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white backdrop-blur-sm"
            onClick={onCustomizeClick}
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            Customize
          </Button>
          {SHOW_DAILY_BRIEFING && (
            <Button 
              variant="outline" 
              className="bg-white/10 border-white/20 hover:bg-white/20 text-white backdrop-blur-sm"
              onClick={speakDailyBriefing}
              disabled={briefingLoading}
            >
              <FileText className="w-4 h-4 mr-2" />
              {briefingLoading ? 'Generating...' : 'Daily Voice Briefing'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}