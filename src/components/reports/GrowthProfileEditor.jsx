import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { getProfile, saveProfile } from '@/api/growth';

// Renders a labelled list editor for a homogeneous array of objects.
// `fields` is an array of { key, placeholder } describing each row's inputs.
function ListEditor({ label, items, fields, onChange }) {
  const addRow = () => {
    const blank = fields.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {});
    onChange([...(items || []), blank]);
  };
  const updateRow = (idx, key, value) => {
    onChange(items.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  };
  const removeRow = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-slate-200 font-medium">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          onClick={addRow}
          className="h-7 px-2 text-slate-300 hover:bg-slate-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>
      {(items || []).length === 0 && (
        <p className="text-xs text-slate-500">None yet — click Add.</p>
      )}
      {(items || []).map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {fields.map((f) => (
            <Input
              key={f.key}
              aria-label={`${label} ${f.key} ${idx + 1}`}
              placeholder={f.placeholder}
              value={row[f.key] ?? ''}
              onChange={(e) => updateRow(idx, f.key, e.target.value)}
              className="bg-slate-700 border-slate-600 text-slate-100"
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeRow(idx)}
            className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-700"
            aria-label={`Remove ${label} ${idx + 1}`}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function GrowthProfileEditor({ tenant, open, onClose }) {
  const tenantId = tenant?.id || tenant?.tenant_id || null;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [targetRegions, setTargetRegions] = useState([]);
  const [competitors, setCompetitors] = useState([]);

  const loadProfile = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await getProfile(tenantId);
      setServiceCatalog(
        Array.isArray(profile?.service_catalog)
          ? // Preserve slug/keywords (used by opportunity matching) — only `name`
            // is edited here; spreading keeps the other fields intact on save.
            profile.service_catalog.map((s) => ({ ...s, name: s.name || '' }))
          : [],
      );
      setTargetRegions(
        Array.isArray(profile?.target_regions)
          ? profile.target_regions.map((r) => ({ type: r.type || '', name: r.name || '' }))
          : [],
      );
      setCompetitors(
        Array.isArray(profile?.competitors)
          ? profile.competitors.map((c) => ({ name: c.name || '', website: c.website || '' }))
          : [],
      );
    } catch (err) {
      console.error('Failed to load growth profile:', err);
      setError(err.message || 'Failed to load market scope.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (open) {
      loadProfile();
    }
  }, [open, loadProfile]);

  const handleSave = useCallback(async () => {
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    const patch = {
      service_catalog: serviceCatalog.filter((s) => s.name.trim()),
      target_regions: targetRegions.filter((r) => r.name.trim()),
      competitors: competitors.filter((c) => c.name.trim()),
    };
    try {
      await saveProfile(tenantId, patch);
      // Confirm persistence — the dialog closes on save, so a toast (not an
      // in-dialog message) is what tells the user their scope was stored.
      const svc = patch.service_catalog.length;
      const reg = patch.target_regions.length;
      toast.success(
        `Market scope saved — ${svc} ${svc === 1 ? 'service' : 'services'}, ${reg} ${reg === 1 ? 'region' : 'regions'}.`,
      );
      onClose?.();
    } catch (err) {
      console.error('Failed to save growth profile:', err);
      const message = err.message || 'Failed to save market scope.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [tenantId, serviceCatalog, targetRegions, competitors, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit market scope</DialogTitle>
          <DialogDescription className="text-slate-400">
            Tune the services, regions, and competitors AiSHA scans for opportunities.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="bg-red-900/20 border-red-700/50">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div
            className="flex items-center justify-center py-12 text-slate-400"
            data-testid="profile-loading"
          >
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          </div>
        ) : (
          <div className="py-2 space-y-6 max-h-[60vh] overflow-y-auto">
            <ListEditor
              label="Service catalog"
              items={serviceCatalog}
              fields={[{ key: 'name', placeholder: 'Service name' }]}
              onChange={setServiceCatalog}
            />
            <ListEditor
              label="Target regions"
              items={targetRegions}
              fields={[
                { key: 'type', placeholder: 'Type (city/region)' },
                { key: 'name', placeholder: 'Region name' },
              ]}
              onChange={setTargetRegions}
            />
            <ListEditor
              label="Competitors"
              items={competitors}
              fields={[
                { key: 'name', placeholder: 'Competitor name' },
                { key: 'website', placeholder: 'Website' },
              ]}
              onChange={setCompetitors}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onClose?.()}
            disabled={saving}
            className="text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
