import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, 
  MessageSquare, 
  Wrench, 
  Brain, 
  Cpu, 
  RefreshCw,
  Save,
  AlertCircle,
  Info
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

const CATEGORY_CONFIG = {
  context: {
    name: 'Context Management',
    description: 'Controls how much conversation history and context is sent to the AI',
    icon: MessageSquare,
    color: 'bg-blue-500',
  },
  tools: {
    name: 'Tool Execution',
    description: 'Limits on tool calls and iterations per request',
    icon: Wrench,
    color: 'bg-orange-500',
  },
  memory: {
    name: 'Memory / RAG',
    description: 'Settings for retrieving past notes and activities as context',
    icon: Brain,
    color: 'bg-purple-500',
  },
  model: {
    name: 'Model Behavior',
    description: 'LLM parameters like temperature and sampling',
    icon: Cpu,
    color: 'bg-green-500',
  },
  behavior: {
    name: 'AI Behavior',
    description: 'General behavior settings and feature toggles',
    icon: Settings,
    color: 'bg-gray-500',
  },
};

export default function AiSettings() {
  const [_settings, setSettings] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [_agentRoles, setAgentRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('aisha');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [pendingChanges, setPendingChanges] = useState({});

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/ai-settings?agent_role=${selectedRole}`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.data || []);
        setGrouped(data.grouped || {});
        setAgentRoles(data.agent_roles || ['aisha']);
      } else {
        toast({
          title: 'Error loading settings',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error loading settings',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleValueChange = (settingId, newValue) => {
    setPendingChanges(prev => ({
      ...prev,
      [settingId]: newValue,
    }));
  };

  const saveSetting = async (setting) => {
    const newValue = pendingChanges[setting.id];
    if (newValue === undefined) return;

    setSaving(prev => ({ ...prev, [setting.id]: true }));
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/ai-settings/${setting.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value: newValue }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Setting updated',
          description: data.message || `Updated ${setting.display_name}`,
        });
        // Remove from pending changes
        setPendingChanges(prev => {
          const next = { ...prev };
          delete next[setting.id];
          return next;
        });
        // Refresh settings
        fetchSettings();
      } else {
        toast({
          title: 'Error saving setting',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error saving setting',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(prev => ({ ...prev, [setting.id]: false }));
    }
  };

  const clearCache = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/ai-settings/clear-cache`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Cache cleared',
          description: 'AI settings cache has been cleared. New values will take effect immediately.',
        });
      }
    } catch (err) {
      toast({
        title: 'Error clearing cache',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const renderSettingInput = (setting) => {
    const meta = setting.setting_value || {};
    const currentValue = pendingChanges[setting.id] ?? meta.value;
    const hasChange = pendingChanges[setting.id] !== undefined;

    if (meta.type === 'boolean') {
      return (
        <div className="flex items-center gap-4">
          <Switch
            checked={currentValue}
            onCheckedChange={(checked) => handleValueChange(setting.id, checked)}
          />
          <span className="text-sm text-muted-foreground">
            {currentValue ? 'Enabled' : 'Disabled'}
          </span>
          {hasChange && (
            <Button 
              size="sm" 
              onClick={() => saveSetting(setting)}
              disabled={saving[setting.id]}
            >
              {saving[setting.id] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          )}
        </div>
      );
    }

    if (meta.type === 'number') {
      const step = meta.step || 1;
      const isSlider = meta.max !== undefined && meta.max <= 1;

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            {isSlider ? (
              <div className="flex-1 flex items-center gap-4">
                <Slider
                  value={[currentValue]}
                  onValueChange={([val]) => handleValueChange(setting.id, val)}
                  min={meta.min || 0}
                  max={meta.max || 1}
                  step={step}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-sm">{currentValue?.toFixed?.(1) || currentValue}</span>
              </div>
            ) : (
              <Input
                type="number"
                value={currentValue}
                onChange={(e) => handleValueChange(setting.id, Number(e.target.value))}
                min={meta.min}
                max={meta.max}
                step={step}
                className="w-24"
              />
            )}
            {hasChange && (
              <Button 
                size="sm" 
                onClick={() => saveSetting(setting)}
                disabled={saving[setting.id]}
              >
                {saving[setting.id] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            )}
          </div>
          {meta.min !== undefined && meta.max !== undefined && (
            <p className="text-xs text-muted-foreground">
              Range: {meta.min} - {meta.max}
            </p>
          )}
        </div>
      );
    }

    // Default text input
    return (
      <div className="flex items-center gap-4">
        <Input
          value={currentValue || ''}
          onChange={(e) => handleValueChange(setting.id, e.target.value)}
          className="flex-1"
        />
        {hasChange && (
          <Button 
            size="sm" 
            onClick={() => saveSetting(setting)}
            disabled={saving[setting.id]}
          >
            {saving[setting.id] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        )}
      </div>
    );
  };

  const renderCategory = (category, categorySettings) => {
    const config = CATEGORY_CONFIG[category] || {
      name: category,
      description: '',
      icon: Settings,
      color: 'bg-gray-500',
    };
    const Icon = config.icon;

    return (
      <Card key={category} className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color} text-white`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.name}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {categorySettings.map(setting => (
            <div key={setting.id} className="border-b pb-4 last:border-0 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{setting.display_name || setting.setting_key}</h4>
                    {pendingChanges[setting.id] !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Unsaved
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {setting.description}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {renderSettingInput(setting)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Settings</h2>
          <p className="text-muted-foreground">
            Configure AI behavior, context limits, and model parameters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={clearCache}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Cache
          </Button>
          <Button variant="outline" onClick={fetchSettings}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="flex items-start gap-3 pt-4">
          <Info className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-700 dark:text-blue-300">About AI Settings</p>
            <p className="text-blue-600 dark:text-blue-400 mt-1">
              These settings control how AiSHA and other AI agents behave. Changes take effect immediately after saving.
              Lower temperature values make responses more deterministic and factual - recommended for CRM data queries.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Agent role tabs */}
      <Tabs value={selectedRole} onValueChange={setSelectedRole}>
        <TabsList>
          <TabsTrigger value="aisha">AiSHA (CRM Assistant)</TabsTrigger>
          <TabsTrigger value="developer">Developer AI</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedRole} className="mt-4">
          {Object.keys(CATEGORY_CONFIG).map(category => {
            const categorySettings = grouped[category] || [];
            if (categorySettings.length === 0) return null;
            return renderCategory(category, categorySettings);
          })}
        </TabsContent>
      </Tabs>

      {/* Unsaved changes warning */}
      {Object.keys(pendingChanges).length > 0 && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {Object.keys(pendingChanges).length} unsaved change(s)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
