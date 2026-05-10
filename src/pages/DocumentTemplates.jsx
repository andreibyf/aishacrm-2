// @ts-check
/**
 * DocumentTemplates page (4VD-43 day 1 + day 1.5 list-action improvements).
 *
 * Wires the in-house eSign engine into the builder UI:
 *   - List view reads from `GET /api/templates` (signing_templates table).
 *   - Builder mode supports three flows on top of one shared canvas:
 *       'create'  — upload a new PDF, place fields, POST /api/templates.
 *       'edit'    — pre-load an existing template's PDF + fields (PDF is
 *                   immutable post-create; PUT updates name + fields).
 *       'preview' — same pre-load, but the canvas runs read-only.
 *   - Delete is a soft archive via DELETE /api/templates/:id.
 *
 * Reusable artifacts:
 *   - src/lib/signingFieldCoords.js (pure coord-math module).
 *   - src/components/signing/TemplateBuilderCanvas.jsx (PDF render +
 *     drag/drop overlay UI; honours a `readOnly` prop).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, FileText, Plus, Save, ArrowLeft, Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/components/shared/useUser.js';
import { getBackendUrl } from '@/api/backendUrl';
import { getAuthorizationHeader } from '@/api/functions';
import {
  buildSigningFieldsPayload,
  normalizedToPixel,
} from '@/lib/signingFieldCoords.js';

// 4VD-43: who can create / edit / delete templates. Read-only access (list +
// preview) is open to anyone in the tenant with DocumentTemplates page
// permission; mutating writes are admin-only at both the route layer
// (requireAdminRole on POST/PUT/DELETE) and the UI layer (this helper).
function userCanManageTemplates(user) {
  if (!user) return false;
  if (user.is_superadmin === true) return true;
  const role = String(user.role || '').trim().toLowerCase();
  return role === 'superadmin' || role === 'super_admin' || role === 'admin';
}

// pdfjs-dist + react-rnd are heavy (~400KB gz combined) so lazy-load the
// builder canvas. The list view stays light.
const TemplateBuilderCanvas = lazy(() =>
  import('@/components/signing/TemplateBuilderCanvas.jsx'),
);

// Fixed render width used by TemplateBuilderCanvas. Kept in sync with the
// constant inside the canvas component so we can pre-compute pageDimsByPage
// on edit/preview load.
const RENDER_WIDTH_PX = 640;

// ---------------------------------------------------------------------------
// API helpers — point at the in-house engine.
// ---------------------------------------------------------------------------

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const auth = await getAuthorizationHeader();
  if (auth) headers['Authorization'] = auth;
  if (typeof localStorage !== 'undefined') {
    const t =
      localStorage.getItem('selected_tenant_id') ||
      localStorage.getItem('tenant_id') ||
      '';
    if (t) headers['x-tenant-id'] = t;
  }
  return headers;
}

async function fetchTemplates() {
  const url = `${getBackendUrl()}/api/templates`;
  const resp = await fetch(url, { headers: await authHeaders(), credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Failed to load templates (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return Array.isArray(json?.data) ? json.data : [];
}

async function fetchTemplate(id) {
  const url = `${getBackendUrl()}/api/templates/${id}`;
  const resp = await fetch(url, { headers: await authHeaders(), credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Failed to load template (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

async function fetchTemplatePdfUrl(id) {
  const url = `${getBackendUrl()}/api/templates/${id}/pdf-url`;
  const resp = await fetch(url, { headers: await authHeaders(), credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Failed to load PDF URL (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data?.url;
}

async function createTemplate({ name, file, fields }) {
  const url = `${getBackendUrl()}/api/templates`;
  const headers = await authHeaders();
  const body = JSON.stringify({ name, file: file.base64, fields });
  const resp = await fetch(url, { method: 'POST', headers, credentials: 'include', body });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Save failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

async function updateTemplate(id, { name, fields, file }) {
  const url = `${getBackendUrl()}/api/templates/${id}`;
  const headers = await authHeaders();
  const payload = { name, fields };
  // Only attach `file` when the operator explicitly chose a replacement
  // PDF. The backend treats undefined/null/empty as "no PDF change".
  if (file && typeof file.base64 === 'string') {
    payload.file = file.base64;
  }
  const body = JSON.stringify(payload);
  const resp = await fetch(url, { method: 'PUT', headers, credentials: 'include', body });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Save failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

async function deleteTemplate(id) {
  const url = `${getBackendUrl()}/api/templates/${id}`;
  const headers = await authHeaders();
  const resp = await fetch(url, { method: 'DELETE', headers, credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Delete failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

// ---------------------------------------------------------------------------
// PDF prep — fetch bytes from signed URL and walk pages once to learn each
// page's render dims at our fixed 640 CSS-px target. Builds the
// pageDimsByPage map up front so edit/preview can convert normalized field
// coords back to pixels before mounting the canvas.
// ---------------------------------------------------------------------------

async function loadPdfFromUrl(signedUrl) {
  const resp = await fetch(signedUrl, { credentials: 'omit' });
  if (!resp.ok) {
    throw new Error(`Failed to download template PDF (${resp.status})`);
  }
  const buf = await resp.arrayBuffer();
  const u8 = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < u8.length; i += 1) binary += String.fromCharCode(u8[i]);
  const base64 = btoa(binary);
  return {
    base64,
    bytes: u8,
    dataUrl: `data:application/pdf;base64,${base64}`,
  };
}

async function computePageDimsByPage(pdfBytes) {
  // Lazy-import pdfjs only when we actually need it (edit/preview). Keeps the
  // entry chunk light for users who only ever look at the list view.
  const pdfjsLib = await import('pdfjs-dist');
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const map = new Map();
  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex += 1) {
    const page = await doc.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = RENDER_WIDTH_PX / baseViewport.width;
    const scaled = page.getViewport({ scale });
    map.set(pageIndex, {
      widthPx: Math.floor(scaled.width),
      heightPx: Math.floor(scaled.height),
    });
  }
  return map;
}

/**
 * Convert the API's signing-engine wire-format fields (normalized 0-1 areas)
 * back into the pixel-space BuilderField shape the canvas + react-rnd
 * operate on.
 */
function normalizedFieldsToBuilderFields(apiFields, pageDimsByPage) {
  const out = [];
  let counter = 0;
  for (const f of apiFields || []) {
    const area = Array.isArray(f.areas) ? f.areas[0] : null;
    if (!area) continue;
    const dims = pageDimsByPage.get(area.page);
    if (!dims) continue;
    const pixelBox = normalizedToPixel(
      { page: area.page, x: area.x, y: area.y, w: area.w, h: area.h },
      dims,
    );
    counter += 1;
    out.push({
      clientId: `${f.type || 'field'}-${counter}-${Date.now().toString(36).slice(-4)}`,
      type: f.type,
      name: f.name,
      required: !!f.required,
      role: f.role || 'First Party',
      box: pixelBox,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentTemplates() {
  // mode: 'list' | 'create' | 'edit' | 'preview'
  // activeTemplateId is set when mode is 'edit' or 'preview'.
  const [mode, setMode] = useState('list');
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name } | null
  const [deleting, setDeleting] = useState(false);
  const { user } = useUser();
  const canManage = useMemo(() => userCanManageTemplates(user), [user]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await fetchTemplates());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setActiveTemplateId(null);
    setMode('create');
  };
  const openEdit = (id) => {
    setActiveTemplateId(id);
    setMode('edit');
  };
  const openPreview = (id) => {
    setActiveTemplateId(id);
    setMode('preview');
  };
  const backToList = () => {
    setActiveTemplateId(null);
    setMode('list');
  };

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteTemplate(pendingDelete.id);
      toast.success(`Deleted "${pendingDelete.name || 'template'}"`);
      setPendingDelete(null);
      await reload();
    } catch (err) {
      const msg = err.body?.message
        ? `${err.message}: ${err.body.message}`.slice(0, 400)
        : err.message;
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, reload]);

  // Defense in depth: even if the URL is hand-edited or someone wires their
  // own button, force preview when the current user can't manage templates.
  const effectiveMode =
    !canManage && (mode === 'create' || mode === 'edit') ? 'preview' : mode;

  if (effectiveMode !== 'list') {
    return (
      <Suspense
        fallback={
          <div className="p-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading builder…
          </div>
        }
      >
        <BuilderShell
          mode={effectiveMode}
          templateId={activeTemplateId}
          canManage={canManage}
          onCancel={backToList}
          onSaved={async () => {
            await reload();
            backToList();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Document Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            E-signature templates for this tenant. Templates created here are stored in your own
            workspace and are immediately available in the Send Document dialog on every contact,
            lead, account, and opportunity.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> New Template
          </Button>
        ) : null}
      </div>

      {!canManage ? (
        <Alert>
          <AlertDescription>
            You can preview templates but only administrators can create, edit, or delete them.
            Ask an admin if you need a new template added.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active Templates</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${templates.length} template(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates yet. Click <strong>+ New Template</strong> to create your first one.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => {
                const fieldCount = Array.isArray(t.fields) ? t.fields.length : 0;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 p-3 border rounded-md hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.name || `Template ${t.id}`}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {fieldCount} field{fieldCount === 1 ? '' : 's'}
                          {t.created_at
                            ? ` · created ${new Date(t.created_at).toLocaleDateString()}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.archived_at ? <Badge variant="outline">archived</Badge> : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPreview(t.id)}
                        disabled={!!t.archived_at}
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canManage ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(t.id)}
                            disabled={!!t.archived_at}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete({ id: t.id, name: t.name })}
                            disabled={!!t.archived_at}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => (o ? null : setPendingDelete(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name
                ? `"${pendingDelete.name}" will be archived.`
                : 'This template will be archived.'}{' '}
              Existing signing sessions that already reference it keep working — soft-delete
              only, no data is destroyed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BuilderShell — wraps the lazy-loaded canvas with name input + save flow.
// Supports three modes:
//   create  : starts empty; user uploads PDF + places fields; POST.
//   edit    : pre-loads name + PDF + fields; user adjusts; PUT (PDF immutable).
//   preview : pre-loads name + PDF + fields; canvas runs read-only.
// ---------------------------------------------------------------------------

function BuilderShell({ mode, templateId, canManage = false, onCancel, onSaved }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null); // { name, base64, dataUrl }
  // pdfReplaced: was the PDF swapped during this edit session? Decides
  // whether updateTemplate() includes `file` in the PUT body. Reset to
  // false on bootstrap and on cancel.
  const [pdfReplaced, setPdfReplaced] = useState(false);
  const [fields, setFields] = useState([]); // BuilderField[]
  const [pageDimsByPage, setPageDimsByPage] = useState(new Map());
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(mode === 'edit' || mode === 'preview');
  const [error, setError] = useState(null);

  const isCreate = mode === 'create';
  const isEdit = mode === 'edit';
  const isPreview = mode === 'preview';
  const readOnly = isPreview;

  // Pre-load PDF + fields for edit/preview.
  useEffect(() => {
    if (!templateId || isCreate) return undefined;
    let cancelled = false;
    (async () => {
      setBootstrapping(true);
      setError(null);
      try {
        const tpl = await fetchTemplate(templateId);
        if (cancelled) return;
        if (!tpl) throw new Error('Template not found.');

        const url = await fetchTemplatePdfUrl(templateId);
        if (cancelled) return;
        const pdfBundle = await loadPdfFromUrl(url);
        if (cancelled) return;

        const dims = await computePageDimsByPage(pdfBundle.bytes);
        if (cancelled) return;

        const builderFields = normalizedFieldsToBuilderFields(tpl.fields || [], dims);

        setName(tpl.name || '');
        setFile({
          name: `${tpl.name || 'template'}.pdf`,
          base64: pdfBundle.base64,
          dataUrl: pdfBundle.dataUrl,
        });
        setPdfReplaced(false);
        setPageDimsByPage(dims);
        setFields(builderFields);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load template.');
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, isCreate]);

  const handleFile = useCallback(
    async (f) => {
      if (!f) {
        if (isCreate) setFile(null);
        // In edit mode "no file" just means cancel the swap — keep the
        // currently-loaded PDF.
        return;
      }
      if (f.type && f.type !== 'application/pdf') {
        setError('Only PDF files are supported.');
        return;
      }
      setError(null);
      const buf = await f.arrayBuffer();
      const u8 = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < u8.length; i += 1) binary += String.fromCharCode(u8[i]);
      const base64 = btoa(binary);
      setFile({ name: f.name, base64, dataUrl: `data:application/pdf;base64,${base64}` });

      if (isCreate) {
        // Fresh upload in create mode — clear any stale field placements
        // and let the canvas recompute pageDims from scratch on render.
        setFields([]);
        setPageDimsByPage(new Map());
        if (!name) setName(f.name.replace(/\.pdf$/i, ''));
        return;
      }

      // Edit mode: PDF replacement. Recompute page dims for the new PDF
      // so existing fields (still in pixel space against the OLD dims)
      // can be rebased proportionally. We round-trip via normalized
      // coords: each field's box is divided by its old page dims to get
      // 0-1 fractions, then multiplied by the new page dims for the
      // matching page index. If the new PDF has fewer pages than the
      // old one, fields on dropped pages are discarded with a warning.
      try {
        const newDims = await computePageDimsByPage(u8);
        setFields((prev) => {
          const dropped = [];
          const remapped = [];
          for (const f0 of prev) {
            const oldDims = pageDimsByPage.get(f0.box.page);
            const newPageDims = newDims.get(f0.box.page);
            if (!oldDims || !newPageDims) {
              dropped.push(f0.name || f0.type);
              continue;
            }
            // Preserve normalized position by re-projecting through the
            // ratio of new/old page dims.
            const ratioX = newPageDims.widthPx / oldDims.widthPx;
            const ratioY = newPageDims.heightPx / oldDims.heightPx;
            remapped.push({
              ...f0,
              box: {
                page: f0.box.page,
                x: f0.box.x * ratioX,
                y: f0.box.y * ratioY,
                w: f0.box.w * ratioX,
                h: f0.box.h * ratioY,
              },
            });
          }
          if (dropped.length > 0) {
            toast.warning(
              `${dropped.length} field${dropped.length === 1 ? '' : 's'} dropped (page no longer exists in the new PDF): ${dropped.join(', ')}`,
            );
          }
          return remapped;
        });
        setPageDimsByPage(newDims);
        setPdfReplaced(true);
      } catch (err) {
        setError(`Failed to load replacement PDF: ${err.message || err}`);
      }
    },
    [name, isCreate, pageDimsByPage],
  );

  const handleSave = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!file) {
      setError('Upload a PDF before saving.');
      return;
    }
    if (fields.length === 0) {
      setError('Place at least one field on the document.');
      return;
    }

    let payload;
    try {
      payload = buildSigningFieldsPayload(fields, pageDimsByPage);
    } catch (err) {
      setError(`Invalid field placement: ${err.message}`);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const updated = await updateTemplate(templateId, {
          name: name.trim(),
          fields: payload,
          file: pdfReplaced ? file : null,
        });
        toast.success(`Template "${updated?.name || name.trim()}" updated`);
      } else {
        const created = await createTemplate({ name: name.trim(), file, fields: payload });
        toast.success(`Template "${created?.name || name.trim()}" created`);
      }
      onSaved();
    } catch (err) {
      const msg = err.body?.message
        ? `${err.message}: ${err.body.message}`.slice(0, 400)
        : err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [name, file, fields, pageDimsByPage, isEdit, pdfReplaced, templateId, onSaved]);

  const titleByMode = {
    create: 'New Template',
    edit: 'Edit Template',
    preview: 'Preview Template',
  };
  const descByMode = {
    create: (
      <>
        Upload a PDF, drag fields onto the document, then click <strong>Save Template</strong>.
        Recipients sign on a CRM-hosted page.
      </>
    ),
    edit: (
      <>
        Rename, re-arrange fields, or replace the PDF. If you swap the PDF, fields are rebased
        proportionally onto the new page dims; any fields on a page that no longer exists are
        dropped. Existing signing sessions referencing this template will see the new PDF on
        next load — coordinate replacement timing accordingly.
      </>
    ),
    preview: <>Read-only view of this template&apos;s fields on the source PDF.</>,
  };

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to templates
        </Button>
        <div className="flex items-center gap-2">
          {!isPreview && (
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          {isPreview ? (
            <Button onClick={onCancel}>Close</Button>
          ) : (
            <Button onClick={handleSave} disabled={saving || bootstrapping || !file}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> {isEdit ? 'Save Changes' : 'Save Template'}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{titleByMode[mode] || 'Template'}</CardTitle>
          <CardDescription>{descByMode[mode]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NDA, MSA, Service Agreement"
                disabled={saving || readOnly || bootstrapping}
              />
            </div>
            {isCreate ? (
              <div className="space-y-2">
                <Label htmlFor="tpl-file">PDF file</Label>
                <Input
                  id="tpl-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  disabled={saving}
                />
                {file ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {file.name} ({Math.round((file.base64.length * 3) / 4 / 1024)} KB)
                  </p>
                ) : null}
              </div>
            ) : isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="tpl-file-replace">Replace PDF (optional)</Label>
                <Input
                  id="tpl-file-replace"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  disabled={saving || bootstrapping}
                />
                {file ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {pdfReplaced ? 'Will replace on save: ' : 'Current PDF: '}
                    {file.name} ({Math.round((file.base64.length * 3) / 4 / 1024)} KB)
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>PDF file</Label>
                {file ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {file.name} ({Math.round((file.base64.length * 3) / 4 / 1024)} KB)
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {bootstrapping ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading template…
            </div>
          ) : file ? (
            <TemplateBuilderCanvas
              dataUrl={file.dataUrl}
              fields={fields}
              setFields={setFields}
              pageDimsByPage={pageDimsByPage}
              setPageDimsByPage={setPageDimsByPage}
              readOnly={readOnly}
            />
          ) : (
            <div className="border-2 border-dashed rounded-md p-12 text-center text-muted-foreground">
              Choose a PDF above to start placing fields.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
