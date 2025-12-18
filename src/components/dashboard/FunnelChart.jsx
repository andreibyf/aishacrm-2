import React from 'react';

/**
 * 3D-style upside-down cone funnel chart with DISTINCT LAYERS.
 * Each layer is a separate trapezoid with gap, shadow, and 3D bevel effect.
 * Props:
 *   data: Array<{ label: string, count: number, color?: string }>
 *   width?: number - SVG width in pixels (default 340)
 *   height?: number - SVG height in pixels (default 420)
 *   minWidth?: number - Width of the tip of the cone (default 70)
 *   gap?: number - Gap between layers (default 6)
 */
export default function FunnelChart({
  data = [],
  width = 340,
  height = 420,
  minWidth = 70,
  gap = 6,
}) {
  if (!data.length) {
    return <div className="text-muted-foreground">No funnel data</div>;
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxWidth = width - 40; // Leave padding for 3D effect
  const totalGaps = (data.length - 1) * gap;
  const usableHeight = height - totalGaps - 20; // Extra padding for shadow

  const widthAtY = (y) => {
    const ratio = y / usableHeight;
    return maxWidth - (maxWidth - minWidth) * ratio;
  };

  let accumulatedY = 10; // Start with some top padding
  let accumulatedLogicalY = 0;

  // Default colors matching the Salesmate funnel reference
  const defaultColors = [
    { main: 'hsl(320, 65%, 55%)', dark: 'hsl(320, 65%, 40%)', light: 'hsl(320, 65%, 70%)' }, // Pink
    { main: 'hsl(35, 75%, 55%)', dark: 'hsl(35, 75%, 40%)', light: 'hsl(35, 75%, 70%)' },   // Orange/Gold
    { main: 'hsl(85, 55%, 50%)', dark: 'hsl(85, 55%, 35%)', light: 'hsl(85, 55%, 65%)' },   // Green
    { main: 'hsl(25, 80%, 55%)', dark: 'hsl(25, 80%, 40%)', light: 'hsl(25, 80%, 70%)' },   // Orange
  ];

  const layers = data.map((segment, idx) => {
    const segmentLogicalHeight = (segment.count / total) * usableHeight;
    const topW = widthAtY(accumulatedLogicalY);
    const bottomW = widthAtY(accumulatedLogicalY + segmentLogicalHeight);

    const yTop = accumulatedY;
    const yBottom = accumulatedY + segmentLogicalHeight;
    const xCenter = width / 2;

    // Main trapezoid points
    const mainPoints = [
      `${xCenter - topW / 2},${yTop}`,
      `${xCenter + topW / 2},${yTop}`,
      `${xCenter + bottomW / 2},${yBottom}`,
      `${xCenter - bottomW / 2},${yBottom}`,
    ].join(' ');

    // 3D side panel (right edge bevel)
    const bevelDepth = 8;
    const rightBevelPoints = [
      `${xCenter + topW / 2},${yTop}`,
      `${xCenter + topW / 2 + bevelDepth},${yTop + bevelDepth}`,
      `${xCenter + bottomW / 2 + bevelDepth},${yBottom + bevelDepth}`,
      `${xCenter + bottomW / 2},${yBottom}`,
    ].join(' ');

    // 3D bottom panel (bottom edge bevel)
    const bottomBevelPoints = [
      `${xCenter - bottomW / 2},${yBottom}`,
      `${xCenter + bottomW / 2},${yBottom}`,
      `${xCenter + bottomW / 2 + bevelDepth},${yBottom + bevelDepth}`,
      `${xCenter - bottomW / 2 + bevelDepth},${yBottom + bevelDepth}`,
    ].join(' ');

    const textY = yTop + segmentLogicalHeight / 2;
    const textX = xCenter;

    accumulatedLogicalY += segmentLogicalHeight;
    accumulatedY += segmentLogicalHeight + gap;

    const colors = defaultColors[idx % defaultColors.length];
    const fillMain = segment.color || colors.main;
    const fillDark = colors.dark;
    const fillLight = colors.light;

    return (
      <g key={idx}>
        {/* Defs for gradients */}
        <defs>
          {/* Main face gradient - curved/3D effect */}
          <linearGradient id={`main-grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fillDark} stopOpacity="0.9" />
            <stop offset="30%" stopColor={fillMain} stopOpacity="1" />
            <stop offset="70%" stopColor={fillMain} stopOpacity="1" />
            <stop offset="100%" stopColor={fillLight} stopOpacity="0.9" />
          </linearGradient>
          {/* Drop shadow filter */}
          <filter id={`shadow-${idx}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="3" dy="3" stdDeviation="3" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* 3D Bottom bevel (darker) */}
        <polygon
          points={bottomBevelPoints}
          fill={fillDark}
          opacity="0.6"
        />

        {/* 3D Right bevel (darker) */}
        <polygon
          points={rightBevelPoints}
          fill={fillDark}
          opacity="0.5"
        />

        {/* Main face with gradient and shadow */}
        <polygon
          points={mainPoints}
          fill={`url(#main-grad-${idx})`}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
          filter={`url(#shadow-${idx})`}
        />

        {/* Highlight line at top edge */}
        <line
          x1={xCenter - topW / 2 + 5}
          y1={yTop + 2}
          x2={xCenter + topW / 2 - 5}
          y2={yTop + 2}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Label text */}
        <text
          x={textX}
          y={textY - 6}
          dominantBaseline="middle"
          textAnchor="middle"
          fill="white"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="15"
          fontWeight="700"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
        >
          {segment.label}
        </text>

        {/* Count below label */}
        <text
          x={textX}
          y={textY + 12}
          dominantBaseline="middle"
          textAnchor="middle"
          fill="rgba(255,255,255,0.95)"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="13"
          fontWeight="600"
        >
          {segment.count.toLocaleString()}
        </text>
      </g>
    );
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="mx-auto"
      role="img"
      aria-label="Sales funnel chart"
      style={{ overflow: 'visible' }}
    >
      {layers}
    </svg>
  );
}
