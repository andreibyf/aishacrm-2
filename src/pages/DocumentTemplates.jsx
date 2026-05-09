// @ts-check
/**
 * DocumentTemplates page (4VD-43 day 1).
 *
 * Wires the in-house eSign engine into the builder UI:
 *   - List view reads from `GET /api/templates` (signing_templates table).
 *   - Builder mode uploads PDF + drags fields, then POSTs to
 *     `POST /api/templates` which stores the PDF in Supabase Storage and
 *     inserts a row in signing_templates (tenant_id stamped from JWT,
 *     never client input).
 *
 * Reusable artifacts:
 *   - src/lib/signingFieldCoords.js (pure coord-math module).
 *   - src/components/signing/TemplateBuilderCanvas.jsx (PDF render +
 *     drag/drop overlay UI).
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, Plus, Save, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { getAuthorizationHeader } from '@/api/functions';
import { buildSigningFieldsPayload } from '@/lib/signingFieldCoords.js';

// pdfjs-dist + react-rnd are heavy (~400KB gz combined) so lazy-load the
// builder canvas. The list view stays light.
const TemplateBuilderCanvas = lazy(() =>
  import('@/components/signing/TemplateBuilderCanvas.jsx'),
);

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentTemplates() {
  const [mode, setMode] = useState('list'); // 'list' | 'builder'
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  if (mode === 'builder') {
    return (
      <Suspense
        fallback={
          <div className="p-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading builder…
          </div>
        }
      >
        <BuilderShell
          onCancel={() => setMode('list')}
          onSaved={async () => {
            await reload();
            setMode('list');
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
        <Button onClick={() => setMode('builder')}>
          <Plus className="w-4 h-4 mr-2" /> New Template
        </Button>
      </div>

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
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.name || `Template ${t.id}`}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        ID: {t.id}
                        {t.created_at
                          ? ` · created ${new Date(t.created_at).toLocaleDateString()}`
                          : ''}
                      </div>
                    </div>
                  </div>
                  {t.archived_at ? <Badge variant="outline">archived</Badge> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BuilderShell — wraps the lazy-loaded canvas with name input + save flow.
// ---------------------------------------------------------------------------

function BuilderShell({ onCancel, onSaved }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null); // { name, base64, dataUrl }
  const [fields, setFields] = useState([]); // BuilderField[]
  const [pageDimsByPage, setPageDimsByPage] = useState(new Map()); // page -> { widthPx, heightPx }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(
    async (f) => {
      if (!f) {
        setFile(null);
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
      for (let i = 0; i < u8.length; i += 1) {
        binary += String.fromCharCode(u8[i]);
      }
      const base64 = btoa(binary);
      setFile({ name: f.name, base64, dataUrl: `data:application/pdf;base64,${base64}` });
      setFields([]);
      setPageDimsByPage(new Map());
      if (!name) setName(f.name.replace(/\.pdf$/i, ''));
    },
    [name],
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
      const created = await createTemplate({ name: name.trim(), file, fields: payload });
      toast.success(`Template "${created?.name || name.trim()}" created`);
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
  }, [name, file, fields, pageDimsByPage, onSaved]);

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to templates
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !file}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" /> Save Template
              </>
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>New Template</CardTitle>
          <CardDescription>
            Upload a PDF, drag fields onto the document, then click <strong>Save Template</strong>.
            Recipients sign on a CRM-hosted page.
          </CardDescription>
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
                disabled={saving}
              />
            </div>
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
          </div>

          {file ? (
            <TemplateBuilderCanvas
              dataUrl={file.dataUrl}
              fields={fields}
              setFields={setFields}
              pageDimsByPage={pageDimsByPage}
              setPageDimsByPage={setPageDimsByPage}
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
