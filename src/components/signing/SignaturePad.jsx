// @ts-check
/**
 * SignaturePad (4VD-43 day 4b).
 *
 * Minimal canvas-based signature capture — no third-party dependency. The
 * recipient's pointer events draw connected line segments; on Save we
 * canvas.toDataURL() a PNG for the parent.
 *
 * Touch + mouse + pen all routed through Pointer Events (single API).
 * Backed by a fixed-pixel canvas so the resulting data URL is consistent
 * across screen densities — pdf-lib stamping on day 5 reads exact pixels.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Check } from 'lucide-react';

const CANVAS_W = 480;
const CANVAS_H = 160;
const STROKE_COLOR = '#0f172a';
const STROKE_WIDTH = 2;

/**
 * @param {Object} props
 * @param {(dataUrl: string|null) => void} props.onChange  — fired on Save / Clear
 * @param {string} [props.initialDataUrl] — preload an existing signature
 */
export default function SignaturePad({ onChange, initialDataUrl }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [hasInk, setHasInk] = useState(!!initialDataUrl);

  const getCtx = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext('2d');
  }, []);

  // Paint background white once and pre-load any initial signature.
  useEffect(() => {
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
  }, [initialDataUrl, getCtx]);

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
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    setHasInk(false);
    onChange?.(null);
  };

  const handleSave = () => {
    const c = canvasRef.current;
    if (!c) return;
    onChange?.(c.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
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
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={!hasInk}>
          <Eraser className="w-4 h-4 mr-2" /> Clear
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!hasInk}>
          <Check className="w-4 h-4 mr-2" /> Save signature
        </Button>
      </div>
    </div>
  );
}
