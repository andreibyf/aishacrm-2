import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';

export default function StatusCardsManager() {
  const { preferences, loading, savePreferences, resetToDefaults, DEFAULT_STATUS_CARDS } = useStatusCardPreferences();
  const [localPrefs, setLocalPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preferences && !loading) {
      setLocalPrefs(JSON.parse(JSON.stringify(preferences)));
    }
  }, [preferences, loading]);

  const handleLabelChange = (cardId, newLabel) => {
    setLocalPrefs(prev => {
      const updated = { ...prev };
      for (const entity of Object.keys(updated)) {
        if (updated[entity][cardId]) {
          updated[entity][cardId] = { ...updated[entity][cardId], label: newLabel };
          break;
        }
      }
      return updated;
    });
  };

  const handleVisibilityChange = (cardId, visible) => {
    setLocalPrefs(prev => {
      const updated = { ...prev };
      for (const entity of Object.keys(updated)) {
        if (updated[entity][cardId]) {
          updated[entity][cardId] = { ...updated[entity][cardId], visible };
          break;
        }
      }
      return updated;
    });
  };

  const handleSave = () => {
    setSaving(true);
    try {
      savePreferences(localPrefs);
      toast.success('Status card preferences saved');
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all status cards to defaults?')) {
      resetToDefaults();
      setLocalPrefs(preferences);
      toast.success('Status cards reset to defaults');
    }
  };

  const handleResetCard = (cardId, originalLabel) => {
    handleLabelChange(cardId, originalLabel);
    toast.success(`Reset to "${originalLabel}"`);
  };

  if (loading || !localPrefs) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const groupedByEntity = {};
  Object.entries(DEFAULT_STATUS_CARDS).forEach(([entityKey, cards]) => {
    groupedByEntity[entityKey] = cards.map(card => ({
      ...card,
      customLabel: localPrefs[entityKey]?.[card.id]?.label || card.label,
      visible: localPrefs[entityKey]?.[card.id]?.visible !== false,
    }));
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Status Card Management</CardTitle>
          <CardDescription>
            Customize and manage status cards displayed across your CRM. Rename cards to match your terminology and hide ones you don't use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Entity Groups */}
          {Object.entries(groupedByEntity).map(([entityKey, cards]) => (
            <div key={entityKey} className="space-y-4 pb-6 border-b border-slate-700 last:border-b-0">
              <h3 className="text-lg font-semibold capitalize text-slate-200">
                {entityKey === 'contacts' && 'Contacts'}
                {entityKey === 'accounts' && 'Accounts'}
                {entityKey === 'leads' && 'Leads'}
                {entityKey === 'opportunities' && 'Opportunities'}
                {entityKey === 'activities' && 'Activities'}
              </h3>

              {/* Status Cards Grid */}
              <div className="grid gap-3">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border ${
                      card.visible
                        ? 'bg-slate-800/50 border-slate-700'
                        : 'bg-slate-900/30 border-slate-800 opacity-50'
                    }`}
                  >
                    {/* Visibility Toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={card.visible}
                        onCheckedChange={(checked) => handleVisibilityChange(card.id, checked)}
                      />
                      {card.visible ? (
                        <Eye className="w-4 h-4 text-green-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-500" />
                      )}
                    </div>

                    {/* Label Input */}
                    <div className="flex-1">
                      <Input
                        type="text"
                        value={card.customLabel}
                        onChange={(e) => handleLabelChange(card.id, e.target.value)}
                        disabled={!card.visible}
                        placeholder={card.label}
                        className="bg-slate-700 border-slate-600 text-slate-100"
                      />
                    </div>

                    {/* Default Button or Badge */}
                    {card.customLabel === card.label ? (
                      <Badge variant="outline" className="flex-shrink-0">
                        Default
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetCard(card.id, card.label)}
                        className="flex-shrink-0 text-xs bg-slate-700 border-slate-600 hover:bg-slate-600"
                      >
                        Default
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleReset}
              className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white ml-auto"
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
