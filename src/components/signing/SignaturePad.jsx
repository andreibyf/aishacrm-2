// @ts-check
/**
 * SignaturePad (4VD-43 day 5 PR 2 follow-up).
 *
 * Recipient signature capture with TWO modes selectable via tabs:
 *   - Draw  — canvas + pointer events. Recipient signs by hand.
 *   - Type  — text input. Recipient types their name; we render it
 *             in a cursive font onto a canvas, identical output shape
 *             to drawn mode so the downstream stamp pipeline doesn't
 *             care which mode was used.
 *
 * Touch + mouse + pen all routed through Pointer Events on the canvas.
 * The drawn-canvas is 600x100 (6:1 aspect) so recipients sign in a
 * horizontal ribbon matching how contract signature lines are shaped.
 * Same dimensions used for the typed-mode canvas so the stamp pipeline
 * sees the same image footprint regardless of mode.
 *
 * On Save (either mode): toDataURL → trimSignatureCanvas (crops to ink
 * bbox + transparent background) → onChange(dataUrl).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eraser, Check, PenLine, Type } from 'lucide-react';
import { trimSignatureCanvas } from '@/lib/trimSignature';
import { renderTypedSignatureCanvas } from '@/lib/renderTypedSignature';

// Canvas is wider/shorter than a typical drawing area — 6:1 aspect ratio
// matches how a contract signature line is shaped. See trimSignature.js
// + signPdf.js SIGNATURE_HEIGHT_MULTIPLIER for the full rationale.
const CANVAS_W = 600;
const CANVAS_H = 100;
const STROKE_COLOR = '#0f172a';
const STROKE_WIDTH = 2;

const MODE_DRAW = 'draw';
const MODE_TYPE = 'type';

/**
 * @param {Object} props
 * @param {(dataUrl: string|null) => void} props.onChange  — fired on Save / Clear
 * @param {string} [props.initialDataUrl] — preload an existing signature (drawn-mode only)
 * @param {string} [props.suggestedName]  — pre-fills the typed-mode input
 *                                          (e.g., session.recipient_name)
 */
export default function SignaturePad({ onChange, initialDataUrl, suggestedName }) {
  const [mode, setMode] = useState(MODE_DRAW);

  // ----- Drawn mode state ----------------------------------------------------
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [hasInk, setHasInk] = useState(!!initialDataUrl);

  // ----- Typed mode state ----------------------------------------------------
  const typedCanvasRef = useRef(null);
  const [typedText, setTypedText] = useState(suggestedName || '');

  const getCtx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext('2d');
  }, []);

  // Paint background white once and pre-load any initial signature on the
  // drawn canvas. Runs every time we re-enter draw mode so switching tabs
  // doesn't leave stale pixels.
  useEffect(() => {
    if (mode !== MODE_DRAW) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      img.src = initialDataUrl;
    }
  }, [mode, initialDataUrl, getCtx]);

  // Re-render the typed-mode preview whenever the text changes.
  useEffect(() => {
    if (mode !== MODE_TYPE) return;
    const target = typedCanvasRef.current;
    if (!target) return;
    // Render off-screen, then blit onto the visible preview canvas so
    // the layout doesn't shift while typing.
    const rendered = renderTypedSignatureCanvas(typedText, {
      widthPx: CANVAS_W,
      heightPx: CANVAS_H,
      color: STROKE_COLOR,
    });
    const ctx = target.getContext('2d');
    if (!ctx || !rendered) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(rendered, 0, 0);
  }, [mode, typedText]);

  // ----- Drawn mode pointer handlers -----------------------------------------

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    if (!hasInk) setHasInk(true);
  };

  const handlePointerUp = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    if (mode === MODE_DRAW) {
      const ctx = getCtx();
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      setHasInk(false);
    } else {
      setTypedText('');
    }
    onChange?.(null);
  };

  // ----- Save -----------------------------------------------------------------
  // Both modes converge here: take whichever canvas is "active" for the
  // current mode, run it through trimSignatureCanvas (crop to ink bbox
  // + transparent background), and emit the resulting data URL via
  // onChange. The downstream stamp pipeline (signPdf.js) gets an
  // identical input shape regardless of mode.

  const handleSave = () => {
    let source;
    if (mode === MODE_DRAW) {
      source = canvasRef.current;
    } else {
      source = typedCanvasRef.current;
    }
    if (!source) return;
    const trimmed = trimSignatureCanvas(source);
    // Emit dataUrl + which mode produced it. Mode propagates into
    // field_values._signature_mode at the SignPage level so the
    // digital-signature metadata block in the final PDF can record
    // whether the signer drew or typed. Callers that pre-date the
    // mode argument (single-arg onChange) keep working — JS just
    // ignores the extra parameter.
    onChange?.(trimmed.toDataURL('image/png'), mode);
  };

  // Enable Save when:
  //   - Draw mode: has ink
  //   - Type mode: typed text is non-empty after trim
  const canSave = mode === MODE_DRAW ? hasInk : typedText.trim().length > 0;

  // ----- Render ---------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Mode tabs — Draw | Type. Plain buttons styled as tabs (no need
          to pull in Radix Tabs for two options). */}
      <div
        role="tablist"
        aria-label="Signature mode"
        className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === MODE_DRAW}
          onClick={() => setMode(MODE_DRAW)}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded ' +
            (mode === MODE_DRAW
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100')
          }
        >
          <PenLine className="w-4 h-4" /> Draw
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === MODE_TYPE}
          onClick={() => setMode(MODE_TYPE)}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded ' +
            (mode === MODE_TYPE
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100')
          }
        >
          <Type className="w-4 h-4" /> Type
        </button>
      </div>

      {/* Draw mode canvas */}
      {mode === MODE_DRAW ? (
        <>
          <div className="rounded-md border bg-white inline-block touch-none">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="block touch-none cursor-crosshair"
              style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: '100%' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sign above with your mouse, finger, or stylus. Click <strong>Save</strong> when ready.
          </p>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder="Type your full name"
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              className="font-medium"
              aria-label="Typed signature name"
            />
            <div className="rounded-md border bg-white inline-block">
              <canvas
                ref={typedCanvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="block"
                style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: '100%' }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Type your full legal name above. We&apos;ll render it in a script font as your
            signature. Click <strong>Save</strong> when ready.
          </p>
        </>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={!canSave}>
          <Eraser className="w-4 h-4 mr-2" /> Clear
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
          <Check className="w-4 h-4 mr-2" /> Save signature
        </Button>
      </div>
    </div>
  );
}
