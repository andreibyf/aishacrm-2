// @ts-check
/**
 * TemplateBuilderCanvas (4VD-43 v1).
 *
 * Lazy-loaded by src/pages/DocumentTemplates.jsx so the heavy pdfjs-dist +
 * react-rnd chunk doesn't bloat the entry bundle (4VD-41).
 *
 * Behaviour:
 *   - Renders one PDF page at a time at a fixed CSS width (640px) so the
 *     normalized 0-1 coordinates stay stable regardless of viewport.
 *   - Sidebar shows the v1 field types from src/lib/signingFieldCoords.js;
 *     "Add to page" places a default-sized field at top-left of the current
 *     page, then the user drags/resizes via react-rnd.
 *   - Each placed field is identified by a stable client-side id; the wire
 *     payload is computed by the parent on save via buildSigningFieldsPayload.
 *
 * Coordinate contract: see src/lib/signingFieldCoords.js.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import * as pdfjsLib from 'pdfjs-dist';
// Vite ?url import — gives us a static URL to the worker bundle.
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { __FIELD_TYPES__ } from '@/lib/signingFieldCoords.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Render width in CSS pixels. Aspect ratio is preserved so the height varies
// per PDF, but the normalized coords don't depend on this.
const RENDER_WIDTH_PX = 640;

// Default placement for a newly-added field, in CSS pixels relative to the
// current page canvas's top-left.
const DEFAULT_FIELD = { x: 24, y: 24, w: 180, h: 32 };

let _fieldClientIdCounter = 0;
function nextFieldClientId(type) {
  _fieldClientIdCounter += 1;
  return `${type}-${_fieldClientIdCounter}-${Date.now().toString(36).slice(-4)}`;
}

export default function TemplateBuilderCanvas({
  dataUrl,
  fields,
  setFields,
  pageDimsByPage,
  setPageDimsByPage,
}) {
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0); // zero-based
  const [renderError, setRenderError] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Load the PDF document whenever the dataUrl changes.
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setNumPages(0);
    setPageIndex(0);
    setRenderError(null);

    async function load() {
      try {
        // Strip the "data:application/pdf;base64," prefix so pdfjs can decode
        const base64 = dataUrl.replace(/^data:application\/pdf;base64,/, '');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        setDoc(pdfDoc);
        setNumPages(pdfDoc.numPages);
      } catch (err) {
        if (!cancelled) setRenderError(err.message || 'Failed to load PDF');
      }
    }

    if (dataUrl) load();
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  // Render the current page to the canvas whenever doc or pageIndex changes.
  useEffect(() => {
    let cancelled = false;
    if (!doc || !canvasRef.current) return undefined;

    async function render() {
      try {
        const page = await doc.getPage(pageIndex + 1); // pdfjs is 1-indexed
        const viewport = page.getViewport({ scale: 1 });
        const scale = RENDER_WIDTH_PX / viewport.width;
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);
        canvas.style.width = `${Math.floor(scaled.width)}px`;
        canvas.style.height = `${Math.floor(scaled.height)}px`;
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (cancelled) return;
        // Record dims so the parent's save flow can compute normalized coords.
        setPageDimsByPage((prev) => {
          const next = new Map(prev);
          next.set(pageIndex, {
            widthPx: Math.floor(scaled.width),
            heightPx: Math.floor(scaled.height),
          });
          return next;
        });
      } catch (err) {
        if (!cancelled) setRenderError(err.message || 'Failed to render page');
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex, setPageDimsByPage]);

  const currentPageFields = useMemo(
    () => fields.filter((f) => f.box.page === pageIndex),
    [fields, pageIndex],
  );

  const addField = useCallback(
    (type) => {
      const dims = pageDimsByPage.get(pageIndex);
      if (!dims) return;
      const w = type === 'checkbox' ? 24 : DEFAULT_FIELD.w;
      const h = type === 'checkbox' ? 24 : DEFAULT_FIELD.h;
      const newField = {
        clientId: nextFieldClientId(type),
        type,
        name: `${type}_${fields.length + 1}`,
        required: type === 'signature',
        role: 'First Party',
        box: {
          page: pageIndex,
          x: Math.min(DEFAULT_FIELD.x, Math.max(0, dims.widthPx - w - 1)),
          y: Math.min(DEFAULT_FIELD.y, Math.max(0, dims.heightPx - h - 1)),
          w,
          h,
        },
      };
      setFields((prev) => [...prev, newField]);
    },
    [fields.length, pageDimsByPage, pageIndex, setFields],
  );

  const updateFieldBox = useCallback(
    (clientId, patch) => {
      setFields((prev) =>
        prev.map((f) => (f.clientId === clientId ? { ...f, box: { ...f.box, ...patch } } : f)),
      );
    },
    [setFields],
  );

  const updateFieldMeta = useCallback(
    (clientId, patch) => {
      setFields((prev) => prev.map((f) => (f.clientId === clientId ? { ...f, ...patch } : f)));
    },
    [setFields],
  );

  const removeField = useCallback(
    (clientId) => {
      setFields((prev) => prev.filter((f) => f.clientId !== clientId));
    },
    [setFields],
  );

  if (renderError) {
    return (
      <div className="border rounded-md p-6 text-sm text-destructive">
        Failed to render PDF: {renderError}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_240px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {numPages > 0 ? (
              <>
                Page {pageIndex + 1} of {numPages}
              </>
            ) : (
              'Loading PDF…'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex >= numPages - 1}
              onClick={() => setPageIndex((p) => Math.min(numPages - 1, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative border rounded-md bg-muted/20 inline-block overflow-hidden"
          style={{ width: RENDER_WIDTH_PX }}
        >
          <canvas ref={canvasRef} className="block" />
          {currentPageFields.map((f) => (
            <Rnd
              key={f.clientId}
              size={{ width: f.box.w, height: f.box.h }}
              position={{ x: f.box.x, y: f.box.y }}
              bounds="parent"
              onDragStop={(_e, d) => updateFieldBox(f.clientId, { x: d.x, y: d.y })}
              onResizeStop={(_e, _dir, ref, _delta, position) =>
                updateFieldBox(f.clientId, {
                  x: position.x,
                  y: position.y,
                  w: parseFloat(ref.style.width),
                  h: parseFloat(ref.style.height),
                })
              }
              className="border-2 border-blue-500 bg-blue-500/20 hover:border-blue-600 group"
              minWidth={20}
              minHeight={16}
            >
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono pointer-events-none">
                {f.name}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeField(f.clientId);
                }}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs leading-none hidden group-hover:flex items-center justify-center"
                title="Remove field"
              >
                ×
              </button>
            </Rnd>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="border rounded-md p-3 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Add field to page
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {__FIELD_TYPES__.map((t) => (
              <Button
                key={t}
                variant="outline"
                size="sm"
                onClick={() => addField(t)}
                disabled={!pageDimsByPage.get(pageIndex)}
              >
                + {t}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Drag the blue box to reposition; drag corners to resize. Hover to delete.
          </p>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Fields on this page ({currentPageFields.length})
          </Label>
          {currentPageFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">None yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {currentPageFields.map((f) => (
                <FieldEditor
                  key={f.clientId}
                  field={f}
                  onChange={(patch) => updateFieldMeta(f.clientId, patch)}
                  onRemove={() => removeField(f.clientId)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border rounded-md p-3 space-y-1 text-xs text-muted-foreground">
          <div>
            Total fields: <Badge variant="outline">{fields.length}</Badge>
          </div>
          <div>Coords saved as page-relative 0-1 fractions on save.</div>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({ field, onChange, onRemove }) {
  return (
    <div className="border rounded p-2 space-y-1 bg-background">
      <div className="flex items-center justify-between gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {field.type}
        </Badge>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          title="Remove"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <Input
        value={field.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="field_name"
        className="h-7 text-xs font-mono"
      />
      <div className="flex items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          required
        </label>
        <Input
          value={field.role || 'First Party'}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder="role"
          className="h-7 text-[11px] flex-1"
        />
      </div>
    </div>
  );
}
