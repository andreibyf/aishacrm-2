import React from 'react';

/**
 * 3D Circular Cone Funnel Chart - AISHA Brand Colors
 * - Viewed from above (correct perspective)
 * - Entity labels positioned OUTSIDE with counts beside them
 * - Y-axis on the left (no title)
 * - Layer thickness proportional to counts with minimum height
 * - Color gradient: Teal/Cyan → Yellow/Lime (matching AISHA logo)
 * - Filters out zero-count layers
 * 
 * Props:
 *   data: Array<{ label: string, count: number }>
 *   width?: number - Total SVG width (default 500)
 *   height?: number - Total SVG height (default 450)
 *   minRadius?: number - Radius at the bottom tip (default 30)
 *   maxRadius?: number - Radius at the top (default 120)
 *   minLayerHeight?: number - Minimum visual height for each layer (default 50)
 */
export default function FunnelChart3D({
  data = [],
  width = 500,
  height = 450,
  minRadius = 30,
  maxRadius = 120,
  minLayerHeight = 50,
}) {
  // Filter out zero-count layers
  const activeData = data.filter(d => d.count > 0);
  
  if (!activeData.length) {
    return <div className="text-muted-foreground">No funnel data</div>;
  }

  const total = activeData.reduce((sum, d) => sum + d.count, 0);
  
  // Layout constants
  const yAxisWidth = 50;
  const rightLabelSpace = 150;
  const coneWidth = width - yAxisWidth - rightLabelSpace;
  const coneHeight = height - 60;
  const coneOffset = 30; // Shift cone and labels toward center
  const coneCenterX = yAxisWidth + coneWidth / 2 + coneOffset;
  const coneTopY = 30;
  
  // Ellipse parameters for 3D effect (viewing from above)
  const ellipseRatio = 0.3;
  
  // Calculate minimum height needed if all layers were at minimum
  const totalMinHeight = activeData.length * minLayerHeight;
  
  // Calculate layer heights with minimum floor
  // If pure proportional would make layers too small, use adjusted heights
  const layerHeights = activeData.map(d => {
    const proportionalHeight = (d.count / total) * coneHeight;
    return Math.max(proportionalHeight, minLayerHeight);
  });
  
  // Normalize heights to fit within coneHeight
  const totalCalculatedHeight = layerHeights.reduce((a, b) => a + b, 0);
  const scaleFactor = coneHeight / totalCalculatedHeight;
  const normalizedHeights = layerHeights.map(h => h * scaleFactor);

  // AISHA brand color gradient: Teal/Cyan at top → Yellow/Lime at bottom
  const getLayerColors = (index, totalLayers) => {
    // Interpolate from teal (top) to yellow-green (bottom)
    const ratio = index / Math.max(1, totalLayers - 1);
    
    // Hue: 180 (cyan/teal) → 75 (yellow-green/lime)
    const hue = 180 - (180 - 75) * ratio;
    // Saturation: 70% constant
    const sat = 70;
    // Lightness: varies for 3D effect
    const lightMain = 50;
    const lightDark = 32;
    const lightLight = 65;
    
    return {
      main: `hsl(${hue}, ${sat}%, ${lightMain}%)`,
      dark: `hsl(${hue}, ${sat}%, ${lightDark}%)`,
      light: `hsl(${hue}, ${sat + 5}%, ${lightLight}%)`,
      accent: `hsl(${hue}, ${sat + 10}%, ${lightMain + 5}%)`,
    };
  };

  // Build layers from top to bottom using normalized heights
  let currentY = 0;
  const layers = [];
  const labelData = [];
  let verticalSegmentRadius = null; // Track shared radius for all vertical segments

  activeData.forEach((segment, idx) => {
    const layerHeight = normalizedHeights[idx];
    const topY = coneTopY + currentY;
    const bottomY = coneTopY + currentY + layerHeight;
    
    // Check if this segment should have vertical sides (Contact or Account)
    const isVerticalSegment = segment.label && 
      (segment.label.toLowerCase().includes('contact') || 
       segment.label.toLowerCase().includes('account'));
    
    // For vertical segments, use same radius top and bottom
    // For tapered segments, calculate radius at each Y position
    let topRadius, bottomRadius;
    
    if (isVerticalSegment) {
      // All vertical segments share the same radius (calculated at first vertical segment)
      if (verticalSegmentRadius === null) {
        verticalSegmentRadius = maxRadius - (maxRadius - minRadius) * (currentY / coneHeight);
      }
      topRadius = verticalSegmentRadius;
      bottomRadius = verticalSegmentRadius;
    } else {
      // Tapered cone: normal calculation
      topRadius = maxRadius - (maxRadius - minRadius) * (currentY / coneHeight);
      bottomRadius = maxRadius - (maxRadius - minRadius) * ((currentY + layerHeight) / coneHeight);
    }
    
    const topEllipseRy = topRadius * ellipseRatio;
    const bottomEllipseRy = bottomRadius * ellipseRatio;

    const colors = getLayerColors(idx, activeData.length);

    // Layer midpoint for label positioning
    const midY = (topY + bottomY) / 2;
    
    // Store label data
    labelData.push({
      label: segment.label,
      count: segment.count,
      y: midY,
      color: colors.accent,
      topY,
      bottomY,
      topRadius,
    });

    layers.push(
      <g key={idx}>
        <defs>
          {/* Gradient for curved surface - simulating light from top-left */}
          <linearGradient id={`cone-grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.light} />
            <stop offset="35%" stopColor={colors.main} />
            <stop offset="70%" stopColor={colors.main} />
            <stop offset="100%" stopColor={colors.dark} />
          </linearGradient>
          {/* Top surface gradient */}
          <radialGradient id={`top-surface-${idx}`} cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor={colors.light} />
            <stop offset="100%" stopColor={colors.main} />
          </radialGradient>
          {/* Drop shadow */}
          <filter id={`cone-shadow-${idx}`} x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="3" dy="6" stdDeviation="4" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Main cone body - front surface (no bottom ellipse visible from above) */}
        <path
          d={`
            M ${coneCenterX - topRadius} ${topY}
            A ${topRadius} ${topEllipseRy} 0 0 1 ${coneCenterX + topRadius} ${topY}
            L ${coneCenterX + bottomRadius} ${bottomY}
            A ${bottomRadius} ${bottomEllipseRy} 0 0 0 ${coneCenterX - bottomRadius} ${bottomY}
            Z
          `}
          fill={`url(#cone-grad-${idx})`}
          filter={`url(#cone-shadow-${idx})`}
        />

        {/* Top ellipse surface */}
        <ellipse
          cx={coneCenterX}
          cy={topY}
          rx={topRadius}
          ry={topEllipseRy}
          fill={`url(#top-surface-${idx})`}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
        />

        {/* Inner rim shadow at top */}
        <ellipse
          cx={coneCenterX}
          cy={topY}
          rx={topRadius * 0.85}
          ry={topEllipseRy * 0.85}
          fill="none"
          stroke={colors.dark}
          strokeWidth="1"
          opacity="0.3"
        />

        {/* Highlight arc on top surface */}
        <ellipse
          cx={coneCenterX - topRadius * 0.2}
          cy={topY - topEllipseRy * 0.1}
          rx={topRadius * 0.4}
          ry={topEllipseRy * 0.3}
          fill="rgba(255,255,255,0.15)"
        />
      </g>
    );

    currentY += layerHeight;
  });

  // Y-Axis - show actual count values at layer boundaries
  const yAxisX = yAxisWidth - 10;
  const yAxisTop = coneTopY;
  const yAxisBottom = coneTopY + coneHeight;
  
  // Generate tick marks at layer boundaries
  const yAxisTicks = [];
  let cumulativeHeight = 0;
  let cumulativeCount = 0;
  
  // Top tick (total)
  yAxisTicks.push({ y: yAxisTop, value: total });
  
  activeData.forEach((segment, idx) => {
    cumulativeHeight += normalizedHeights[idx];
    cumulativeCount += segment.count;
    const y = coneTopY + cumulativeHeight;
    yAxisTicks.push({ y, value: total - cumulativeCount });
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="mx-auto"
      role="img"
      aria-label="3D Cone Funnel Chart"
      style={{ overflow: 'visible' }}
    >
      {/* Y-Axis (no title) - uses currentColor for theme-awareness */}
      <g className="y-axis" style={{ color: 'var(--funnel-axis-color, currentColor)' }}>
        <line
          x1={yAxisX}
          y1={yAxisTop}
          x2={yAxisX}
          y2={yAxisBottom}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="2"
        />
        
        {yAxisTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={yAxisX - 5}
              y1={tick.y}
              x2={yAxisX}
              y2={tick.y}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="2"
            />
            <text
              x={yAxisX - 10}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-700 dark:fill-slate-300"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="11"
            >
              {tick.value.toLocaleString()}
            </text>
          </g>
        ))}
      </g>

      {/* Cone layers (rendered in reverse so top layers render on top) */}
      {[...layers].reverse()}

      {/* External labels with count beside name */}
      <g className="labels">
        {labelData.map((item, idx) => {
          const labelX = coneCenterX + maxRadius + 25;
          const lineEndX = coneCenterX + item.topRadius + 5;
          
          return (
            <g key={idx}>
              {/* Connecting line */}
              <line
                x1={lineEndX}
                y1={item.y}
                x2={labelX - 5}
                y2={item.y}
                stroke={item.color}
                strokeWidth="2"
                strokeDasharray="4,2"
                opacity="0.8"
              />
              
              {/* Dot at cone edge */}
              <circle
                cx={lineEndX}
                cy={item.y}
                r="4"
                fill={item.color}
                className="stroke-white dark:stroke-white"
                strokeWidth="1.5"
              />

              {/* Label: "Entity: Count" format - theme-aware */}
              <text
                x={labelX}
                y={item.y}
                dominantBaseline="middle"
                className="fill-slate-800 dark:fill-white"
                fontFamily="Inter, system-ui, sans-serif"
                fontSize="14"
                fontWeight="600"
              >
                <tspan>{item.label}:</tspan>
                <tspan fill={item.color} fontWeight="700" dx="6">
                  {item.count.toLocaleString()}
                </tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
