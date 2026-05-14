import { useEffect, useRef, useState, memo } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * SafeChartContainer
 * -------------------
 * Drop-in replacement for `<ResponsiveContainer width="100%" height="100%">`
 * that defers mounting the chart until its parent box actually measures
 * positive pixel dimensions.
 *
 * Why this exists
 *  - Recharts 3.x ResponsiveContainer logs
 *      "width(-1) and height(-1) of chart should be greater than 0"
 *    on its first ResizeObserver callback whenever the parent is briefly
 *    0×0 (lazy-mounted, intersection-observer reveals, flex parents whose
 *    `min-width: auto` collapses content, etc.).
 *  - Worse, during that frame Recharts emits an SVG with `width="-1"
 *    height="-1"`. rrweb-based session recorders snapshot that DOM verbatim.
 *    On replay, browsers treat the negative attrs as invalid, the
 *    foreignObject collapses, and only the top-left of the captured page
 *    renders.
 *  - Cloudflare's request scanner treats repeated invalid SVG payloads
 *    as anomalous and starts flagging the response.
 *
 * Behaviour
 *  - Renders an outer div sized exactly the way you ask (defaults to
 *    `100% × 320px`) with `min-width: 0; min-height: 0` to defeat flex's
 *    default `min-*: auto`.
 *  - Uses ResizeObserver to watch its own size. ResponsiveContainer is
 *    only mounted when both width and height are >= `minDim` (default 1).
 *    Until then the box is empty (no SVG, nothing for rrweb to snapshot).
 *  - Once mounted, ResponsiveContainer's own observer keeps the chart in
 *    sync with future resizes — we do NOT unmount on shrink to avoid
 *    flicker during animations.
 *
 * Usage
 *   <SafeChartContainer height={320}>
 *     <BarChart data={...}>...</BarChart>
 *   </SafeChartContainer>
 *
 *   // Or, if the parent already imposes the size:
 *   <div className="h-80 w-full">
 *     <SafeChartContainer height="100%">...</SafeChartContainer>
 *   </div>
 */
function SafeChartContainer({
  children,
  width = '100%',
  height = 320,
  minDim = 1,
  className = '',
  style,
  // forwarded to ResponsiveContainer:
  aspect,
  debounce,
  initialDimension,
  maxHeight,
  minHeight,
  minWidth,
  onResize,
  id,
}) {
  const wrapperRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return undefined;

    // Synchronous fast-path: if the box is already sized at mount, render now.
    const initial = el.getBoundingClientRect();
    if (initial.width >= minDim && initial.height >= minDim) {
      setReady(true);
      return undefined;
    }

    if (typeof ResizeObserver === 'undefined') {
      // SSR or very old browsers — fall back to "always render". The Recharts
      // warning may reappear there but the corruption-on-replay scenario is
      // browser-only, so this is acceptable.
      setReady(true);
      return undefined;
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w >= minDim && h >= minDim) {
          setReady(true);
          ro.disconnect();
          return;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minDim]);

  return (
    <div
      ref={wrapperRef}
      className={`safe-chart-container ${className}`.trim()}
      data-chart-ready={ready ? 'true' : 'false'}
      style={{
        width,
        height,
        // Defeat flex parents' `min-*: auto` default which is the most common
        // root cause of 0-dim measurements:
        minWidth: 0,
        minHeight: 0,
        position: 'relative',
        ...style,
      }}
    >
      {ready ? (
        <ResponsiveContainer
          width="100%"
          height="100%"
          aspect={aspect}
          debounce={debounce}
          initialDimension={initialDimension}
          maxHeight={maxHeight}
          minHeight={minHeight}
          minWidth={minWidth}
          onResize={onResize}
          id={id}
        >
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export default memo(SafeChartContainer);
