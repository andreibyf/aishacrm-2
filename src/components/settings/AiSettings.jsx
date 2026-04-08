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
  Info,
  Server,
  Zap,
  RotateCw,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { BACKEND_URL } from '@/api/entities';

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

export default function AiSettings({ tenantId }) {
  const [_settings, setSettings] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [_agentRoles, setAgentRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('aisha');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [pendingChanges, setPendingChanges] = useState({});

  // Ollama state
  const [ollamaSettings, setOllamaSettings] = useState([]);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [ollamaPending, setOllamaPending] = useState({});
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaSaving, setOllamaSaving] = useState(false);
  const [ollamaRestarting, setOllamaRestarting] = useState(false);

  const fetchOllamaSettings = useCallback(async () => {
    setOllamaLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/ai-settings/ollama`, { credentials: 'include' });
      const data = await r.json();
      if (data.success) {
        setOllamaSettings(data.settings || []);
        setOllamaStatus(data.liveStatus);
      }
    } catch (err) {
      toast({
        title: 'Could not load Ollama settings',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  const saveOllamaSettings = async (withRestart = false) => {
    if (Object.keys(ollamaPending).length === 0 && !withRestart) return;
    setOllamaSaving(true);
    if (withRestart) setOllamaRestarting(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/ai-settings/ollama`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: ollamaPending, restart: withRestart }),
      });
      const data = await r.json();
      if (data.success) {
        toast({
          title: withRestart ? '✅ Saved & restarting Ollama' : '✅ Settings saved',
          description: data.message,
        });
        setOllamaPending({});
        setTimeout(fetchOllamaSettings, withRestart ? 8000 : 500);
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (err) {
      toast({
        title: 'Error saving Ollama settings',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setOllamaSaving(false);
      if (withRestart) setOllamaRestarting(false);
    }
  };

  const restartOllama = async () => {
    setOllamaRestarting(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/ai-settings/ollama/restart`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await r.json();
      toast({
        title: data.success ? '✅ Ollama restarted' : '⚠️ Restart failed',
        description: data.message || data.error,
        variant: data.success ? 'default' : 'destructive',
      });
      setTimeout(fetchOllamaSettings, 6000);
    } catch (err) {
      toast({ title: 'Restart failed', description: err.message, variant: 'destructive' });
    } finally {
      setOllamaRestarting(false);
    }
  };

  const fetchSettings = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const response = await fetch(
        `${BACKEND_URL}/api/ai-settings?agent_role=${selectedRole}&tenant_id=${tenantId}`,
        {
          credentials: 'include',
        },
      );
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
  }, [selectedRole, tenantId]);

  useEffect(() => {
    if (tenantId) fetchSettings();
  }, [fetchSettings, tenantId]);

  useEffect(() => {
    fetchOllamaSettings();
  }, [fetchOllamaSettings]);

  const handleValueChange = (settingId, newValue) => {
    setPendingChanges((prev) => ({
      ...prev,
      [settingId]: newValue,
    }));
  };

  const saveSetting = async (setting) => {
    const newValue = pendingChanges[setting.id];
    if (newValue === undefined) return;

    setSaving((prev) => ({ ...prev, [setting.id]: true }));

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/ai-settings/${setting.id}?tenant_id=${tenantId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ value: newValue }),
        },
      );

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Setting updated',
          description: data.message || `Updated ${setting.display_name}`,
        });
        // Remove from pending changes
        setPendingChanges((prev) => {
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
      setSaving((prev) => ({ ...prev, [setting.id]: false }));
    }
  };

  const clearCache = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/ai-settings/clear-cache?tenant_id=${tenantId}`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Cache cleared',
          description:
            'AI settings cache has been cleared. New values will take effect immediately.',
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
            <Button size="sm" onClick={() => saveSetting(setting)} disabled={saving[setting.id]}>
              {saving[setting.id] ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
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
                <span className="w-12 text-right font-mono text-sm">
                  {currentValue?.toFixed?.(1) || currentValue}
                </span>
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
              <Button size="sm" onClick={() => saveSetting(setting)} disabled={saving[setting.id]}>
                {saving[setting.id] ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
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
          <Button size="sm" onClick={() => saveSetting(setting)} disabled={saving[setting.id]}>
            {saving[setting.id] ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
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
          {categorySettings.map((setting) => (
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
                  <p className="text-sm text-muted-foreground mt-1">{setting.description}</p>
                </div>
              </div>
              <div className="mt-3">{renderSettingInput(setting)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <AlertCircle className="h-5 w-5 mr-2" />
        Select a tenant to manage AI settings.
      </div>
    );
  }

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
              These settings control how AiSHA and other AI agents behave. Changes take effect
              immediately after saving. Lower temperature values make responses more deterministic
              and factual - recommended for CRM data queries.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Ollama / Local LLM ─────────────────────────────────────── */}
      <Card className="border-2 border-orange-200 dark:border-orange-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500 text-white">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Local LLM (Ollama)</CardTitle>
                <CardDescription>
                  Container-level settings — apply to all agents. Restart required for most changes.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ollamaStatus && (
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                    ollamaStatus.online
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  }`}
                >
                  {ollamaStatus.online ? (
                    <>
                      <CheckCircle className="h-3 w-3" /> Online &bull; {ollamaStatus.models.length}{' '}
                      model{ollamaStatus.models.length !== 1 ? 's' : ''} loaded
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" /> Offline
                    </>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOllamaSettings}
                disabled={ollamaLoading}
              >
                <RefreshCw className={`h-4 w-4 ${ollamaLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {ollamaLoading ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {ollamaSettings.map((s) => {
                const val = ollamaPending[s.key] ?? s.value;
                const isDirty = ollamaPending[s.key] !== undefined;
                return (
                  <div key={s.key} className="border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{s.label}</h4>
                          {s.requiresRestart && (
                            <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 px-1.5 py-0.5 rounded">
                              requires restart
                            </span>
                          )}
                          {isDirty && (
                            <Badge variant="outline" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Unsaved
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                      </div>
                    </div>
                    {s.type === 'number' ? (
                      <Input
                        type="number"
                        value={val}
                        min={s.min}
                        max={s.max}
                        step={s.step || 1}
                        className="w-32"
                        onChange={(e) =>
                          setOllamaPending((p) => ({ ...p, [s.key]: Number(e.target.value) }))
                        }
                      />
                    ) : s.options ? (
                      <div className="flex gap-2 flex-wrap">
                        {s.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setOllamaPending((p) => ({ ...p, [s.key]: opt }))}
                            className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                              val === opt
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-muted border-border'
                            }`}
                          >
                            {opt === '-1' ? '∞ forever' : opt === '0' ? 'unload now' : opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Input
                        value={val}
                        className="w-32"
                        onChange={(e) =>
                          setOllamaPending((p) => ({ ...p, [s.key]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                );
              })}

              {/* Loaded models */}
              {ollamaStatus?.models?.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">LOADED MODELS</p>
                  <div className="flex gap-2 flex-wrap">
                    {ollamaStatus.models.map((m) => (
                      <span key={m} className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  disabled={ollamaSaving || Object.keys(ollamaPending).length === 0}
                  onClick={() => saveOllamaSettings(false)}
                >
                  {ollamaSaving && !ollamaRestarting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ollamaSaving || Object.keys(ollamaPending).length === 0}
                  onClick={() => saveOllamaSettings(true)}
                >
                  {ollamaRestarting && ollamaSaving ? (
                    <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Save & Restart Ollama
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ollamaRestarting}
                  onClick={restartOllama}
                  className="ml-auto"
                >
                  {ollamaRestarting && !ollamaSaving ? (
                    <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCw className="h-4 w-4 mr-2" />
                  )}
                  Restart Only
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Agent role tabs */}
      <Tabs value={selectedRole} onValueChange={setSelectedRole}>
        <TabsList>
          <TabsTrigger value="aisha">AiSHA (CRM Assistant)</TabsTrigger>
          <TabsTrigger value="developer">Developer AI</TabsTrigger>
        </TabsList>

        <TabsContent value="aisha" className="mt-4">
          {Object.keys(CATEGORY_CONFIG).map((category) => {
            const categorySettings = grouped[category] || [];
            if (categorySettings.length === 0) return null;
            return renderCategory(category, categorySettings);
          })}
        </TabsContent>
        <TabsContent value="developer" className="mt-4">
          {Object.keys(CATEGORY_CONFIG).map((category) => {
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
