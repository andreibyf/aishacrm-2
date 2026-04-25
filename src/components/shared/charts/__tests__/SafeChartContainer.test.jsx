/**
 * [PLATFORM] SafeChartContainer
 *
 * Verifies the wrapper that prevents Recharts ResponsiveContainer from
 * emitting an SVG with width="-1"/height="-1" when its parent is briefly
 * 0×0 — the root cause of OpenReplay session-replay corruption.
 *
 * Notes
 *  - We mock `recharts` inline (rather than relying on setup-reports.js)
 *    so this file is picked up by the `platform` Vitest project without
 *    importing the real recharts CJS bundle (which has known
 *    @reduxjs/toolkit ESM resolution issues on Windows vmForks).
 *  - We mock `ResizeObserver` to drive the size-gate behaviour
 *    deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Inline recharts mock — keeps the test off the real recharts module path.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => (
    <div data-testid="recharts-responsive-container">{children}</div>
  ),
}));

import SafeChartContainer from '../SafeChartContainer';

// --- ResizeObserver harness ------------------------------------------------
// Captures the latest observer instance + callback so tests can fire a
// resize event synchronously.
const observers = new Set();

class MockResizeObserver {
  constructor(cb) {
    this.cb = cb;
    this.observed = null;
    observers.add(this);
  }
  observe(el) {
    this.observed = el;
  }
  disconnect() {
    observers.delete(this);
  }
  /** Test helper: simulate a resize callback with the given content rect. */
  fire({ width, height }) {
    this.cb([{ contentRect: { width, height }, target: this.observed }]);
  }
}

const ChildMarker = () => <span data-testid="chart-child">chart</span>;

describe('[PLATFORM] SafeChartContainer', () => {
  let originalRO;

  beforeEach(() => {
    observers.clear();
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalRO;
    vi.restoreAllMocks();
  });

  it('does NOT render the chart when initial size is 0×0', () => {
    // jsdom's getBoundingClientRect returns 0×0 by default
    render(
      <SafeChartContainer height={320}>
        <ChildMarker />
      </SafeChartContainer>,
    );

    expect(screen.queryByTestId('recharts-responsive-container')).toBeNull();
    expect(screen.queryByTestId('chart-child')).toBeNull();

    // Wrapper is present and marked not-ready (so OpenReplay can capture it
    // as an empty placeholder rather than a malformed SVG).
    const wrapper = document.querySelector('.safe-chart-container');
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute('data-chart-ready')).toBe('false');
  });

  it('renders the chart synchronously when parent is already sized', () => {
    // Stub getBoundingClientRect on the next-rendered element.
    const realProto = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function rect() {
      return { width: 600, height: 400, top: 0, left: 0, bottom: 400, right: 600, x: 0, y: 0 };
    };

    try {
      render(
        <SafeChartContainer height={400}>
          <ChildMarker />
        </SafeChartContainer>,
      );

      expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('chart-child')).toBeInTheDocument();
      expect(document.querySelector('.safe-chart-container').getAttribute('data-chart-ready')).toBe(
        'true',
      );
    } finally {
      Element.prototype.getBoundingClientRect = realProto;
    }
  });

  it('renders the chart once ResizeObserver reports valid dimensions', () => {
    render(
      <SafeChartContainer height={320}>
        <ChildMarker />
      </SafeChartContainer>,
    );

    // Initially gated off
    expect(screen.queryByTestId('recharts-responsive-container')).toBeNull();

    // Fire a 0×0 resize — must stay gated
    act(() => {
      [...observers][0].fire({ width: 0, height: 0 });
    });
    expect(screen.queryByTestId('recharts-responsive-container')).toBeNull();

    // Fire a valid resize — chart appears
    act(() => {
      [...observers][0]?.fire({ width: 500, height: 320 });
    });
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('chart-child')).toBeInTheDocument();
  });

  it('respects minDim threshold (sub-threshold sizes do NOT mount the chart)', () => {
    render(
      <SafeChartContainer height={320} minDim={50}>
        <ChildMarker />
      </SafeChartContainer>,
    );

    act(() => {
      [...observers][0].fire({ width: 49, height: 49 });
    });
    expect(screen.queryByTestId('recharts-responsive-container')).toBeNull();

    act(() => {
      [...observers][0].fire({ width: 50, height: 50 });
    });
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
  });

  it('always sets minWidth:0 / minHeight:0 on the outer box (defeats flex auto-min)', () => {
    render(
      <SafeChartContainer height={300}>
        <ChildMarker />
      </SafeChartContainer>,
    );
    const wrapper = document.querySelector('.safe-chart-container');
    // JSDOM serializes a unitless `0` style as '0' (not '0px'); both are
    // valid CSS for `min-*` and resolve identically. Accept either form so
    // the test stays robust to JSDOM version drift.
    expect(['0', '0px']).toContain(wrapper.style.minWidth);
    expect(['0', '0px']).toContain(wrapper.style.minHeight);
  });

  it('disconnects its ResizeObserver on unmount (no leaks)', () => {
    const { unmount } = render(
      <SafeChartContainer height={300}>
        <ChildMarker />
      </SafeChartContainer>,
    );
    expect(observers.size).toBe(1);
    unmount();
    expect(observers.size).toBe(0);
  });

  it('falls back to immediate render when ResizeObserver is absent (SSR/older browsers)', () => {
    globalThis.ResizeObserver = undefined;
    render(
      <SafeChartContainer height={300}>
        <ChildMarker />
      </SafeChartContainer>,
    );
    // Without RO we cannot gate, so child must mount.
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
  });
});
