/**
 * SessionPackages.jsx
 * Admin UI for managing session packages within a tenant.
 * Accessible via Settings → Session Packages
 *
 * Features:
 *  - List all session packages (active + inactive toggle)
 *  - Create / Edit package via dialog form
 *  - Toggle active/inactive
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Package, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { useUser } from '@/components/shared/useUser';
import { supabase } from '@/lib/supabase';

async function apiFetch(path, options = {}) {
  const BACKEND_URL = getBackendUrl();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

const EMPTY_FORM = {
  name: '',
  description: '',
  session_count: 6,
  price_cents: 0,
  validity_days: 365,
  is_active: true,
};

export default function SessionPackages() {
  const { user } = useUser();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = create, obj = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const tenantId = user?.tenant_id;

  const fetchPackages = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/session-packages?tenant_id=${tenantId}${showInactive ? '&include_inactive=true' : ''}`,
      );
      const json = await res.json();
      setPackages(json.data || []);
    } catch {
      toast.error('Failed to load session packages');
    } finally {
      setLoading(false);
    }
  }, [tenantId, showInactive]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(pkg) {
    setEditTarget(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description || '',
      session_count: pkg.session_count,
      price_cents: pkg.price_cents,
      validity_days: pkg.validity_days,
      is_active: pkg.is_active,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.session_count) {
      toast.error('Name and session count are required');
      return;
    }
    setSaving(true);
    try {
      const body = {
        tenant_id: tenantId,
        ...form,
        session_count: Number(form.session_count),
        price_cents: Number(form.price_cents),
        validity_days: Number(form.validity_days),
      };
      const res = editTarget
        ? await apiFetch(`/api/session-packages/${editTarget.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await apiFetch('/api/session-packages', { method: 'POST', body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Save failed');
      toast.success(editTarget ? 'Package updated' : 'Package created');
      setDialogOpen(false);
      fetchPackages();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(pkg) {
    try {
      const res = await apiFetch(`/api/session-packages/${pkg.id}`, {
        method: 'PUT',
        body: JSON.stringify({ tenant_id: tenantId, is_active: !pkg.is_active }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success(`Package ${pkg.is_active ? 'deactivated' : 'activated'}`);
      fetchPackages();
    } catch {
      toast.error('Failed to update package');
    }
  }

  function formatPrice(cents) {
    return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Session Packages</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
            <Label htmlFor="show-inactive">Show inactive</Label>
          </div>
          <Button onClick={fetchPackages} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Package
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No packages found. Create your first session package.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Validity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow key={pkg.id}>
                <TableCell>
                  <div className="font-medium">{pkg.name}</div>
                  {pkg.description && (
                    <div className="text-xs text-muted-foreground truncate max-w-xs">
                      {pkg.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>{pkg.session_count} sessions</TableCell>
                <TableCell>{formatPrice(pkg.price_cents)}</TableCell>
                <TableCell>{pkg.validity_days} days</TableCell>
                <TableCell>
                  <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                    {pkg.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={pkg.is_active}
                      onCheckedChange={() => toggleActive(pkg)}
                      title={pkg.is_active ? 'Deactivate' : 'Activate'}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Package' : 'New Session Package'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 6-Session Training Package"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Sessions *</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.session_count}
                  onChange={(e) => setForm((f) => ({ ...f, session_count: e.target.value }))}
                />
              </div>
              <div>
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(form.price_cents / 100).toFixed(2)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      price_cents: Math.round(parseFloat(e.target.value || 0) * 100),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Validity (days)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.validity_days}
                  onChange={(e) => setForm((f) => ({ ...f, validity_days: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                id="pkg-active"
              />
              <Label htmlFor="pkg-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editTarget ? 'Save Changes' : 'Create Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
