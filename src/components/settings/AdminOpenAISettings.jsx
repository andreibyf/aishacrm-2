import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, KeyRound, CheckCircle, AlertCircle, Save, Plug } from 'lucide-react';
import { User } from '@/api/entities';
import { testSystemOpenAI } from '@/api/functions';
import { toast } from "sonner";

export default function AdminOpenAISettings() {
  const [_user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localSettings, setLocalSettings] = useState({
    openai_api_key: '',
    model: 'gpt-4o-mini',
    max_tokens: 1000,
    temperature: 0.7,
    enabled: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const userData = await User.me();
        setUser(userData);
        if (userData.system_openai_settings) {
          setLocalSettings(userData.system_openai_settings);
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const handleSettingChange = (field, value) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await User.updateMyUserData({ system_openai_settings: localSettings });
      toast.success("OpenAI settings saved successfully!");
    } catch (error) {
      toast.error("Failed to save settings.");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!localSettings.openai_api_key) {
      toast.error("Please enter an OpenAI API key to test.");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await testSystemOpenAI({
        api_key: localSettings.openai_api_key,
        model: localSettings.model
      });
      setTestResult(response.data);
      if (response.data.success) {
        toast.success("OpenAI connection successful!");
        setLocalSettings(prev => ({ ...prev, enabled: true }));
      } else {
        toast.error(`Test failed: ${response.data.error}`);
      }
    } catch (error) {
      // Improved error handling to show specific backend message
      const errorMessage = error.response?.data?.error || "The request failed. Please check the function logs.";
      setTestResult({ success: false, error: errorMessage });
      toast.error(errorMessage, {
        description: error.response?.data?.details || "No further details available.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-700/50 border-slate-600">
        <CardHeader>
          <CardTitle className="text-slate-100">System OpenAI Integration</CardTitle>
          <CardDescription className="text-slate-400">
            Configure your personal OpenAI API key to power AI features across the platform. This will be used when tenants don't have their own OpenAI integration configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="openai_api_key" className="text-slate-200">OpenAI API Key</Label>
            <div className="flex items-center gap-2">
              <Input
                id="openai_api_key"
                type={showKey ? 'text' : 'password'}
                value={localSettings.openai_api_key}
                onChange={(e) => handleSettingChange('openai_api_key', e.target.value)}
                placeholder="sk-..."
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
              <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)} className="text-slate-400 hover:text-slate-200">
                <KeyRound className="w-4 h-4" />
              </Button>
            </div>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
              Get your API key from OpenAI Platform
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="model" className="text-slate-200">Model</Label>
              <Select value={localSettings.model} onValueChange={(value) => handleSettingChange('model', value)}>
                <SelectTrigger id="model" className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="gpt-4o-mini" className="focus:bg-slate-700">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4o" className="focus:bg-slate-700">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4-turbo" className="focus:bg-slate-700">GPT-4 Turbo</SelectItem>
                  <SelectItem value="gpt-3.5-turbo" className="focus:bg-slate-700">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_tokens" className="text-slate-200">Max Tokens</Label>
              <Input
                id="max_tokens"
                type="number"
                value={localSettings.max_tokens}
                onChange={(e) => handleSettingChange('max_tokens', parseInt(e.target.value, 10))}
                className="bg-slate-700 border-slate-600 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature" className="text-slate-200">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={localSettings.temperature}
                onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
                className="bg-slate-700 border-slate-600 text-slate-200"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2 pt-4">
            <Switch
              id="enabled"
              checked={localSettings.enabled}
              onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
            />
            <Label htmlFor="enabled" className="text-slate-200">Enable system OpenAI integration</Label>
            {localSettings.enabled && <Badge className="bg-green-600">Enabled</Badge>}
          </div>

          {testResult && (
            <Alert className={testResult.success ? "bg-green-900/30 border-green-700/50" : "bg-red-900/30 border-red-700/50"}>
              <AlertTitle className="flex items-center gap-2">
                {testResult.success ? <CheckCircle className="text-green-400" /> : <AlertCircle className="text-red-400" />}
                <span className={testResult.success ? "text-green-200" : "text-red-200"}>
                  {testResult.success ? "Connection Successful" : "Connection Failed"}
                </span>
              </AlertTitle>
              <AlertDescription className={testResult.success ? "text-green-300" : "text-red-300"}>
                {testResult.success ? testResult.message : testResult.error}
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="flex gap-2 bg-slate-800/50 py-4 px-6 border-t border-slate-600">
          <Button onClick={handleSaveSettings} disabled={isSaving || isTesting}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
          <Button variant="outline" onClick={handleTestConnection} disabled={isTesting || isSaving}>
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plug className="w-4 h-4 mr-2" />}
            Test Connection
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
