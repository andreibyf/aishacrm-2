/**
 * Reports project Vitest setup — runs before each reports test file.
 *
 * recharts (CJS) does require('@reduxjs/toolkit'), which triggers Vite's
 * module resolver.  On vmForks, Vite resolves the 'module' export condition
 * on @reduxjs/toolkit and loads the ESM .modern.mjs → SyntaxError.
 *
 * Mocking recharts here prevents the module from being loaded at all, which
 * is fine because reports tests only verify data fetching / display text,
 * not chart rendering specifics.
 */
import { vi } from 'vitest';

const makePassThrough = (name) => {
  const Comp = ({ children }) => children ?? null;
  Comp.displayName = name;
  return Comp;
};

vi.mock('recharts', () => ({
  LineChart: makePassThrough('LineChart'),
  Line: makePassThrough('Line'),
  BarChart: makePassThrough('BarChart'),
  Bar: makePassThrough('Bar'),
  AreaChart: makePassThrough('AreaChart'),
  Area: makePassThrough('Area'),
  PieChart: makePassThrough('PieChart'),
  Pie: makePassThrough('Pie'),
  Cell: makePassThrough('Cell'),
  ComposedChart: makePassThrough('ComposedChart'),
  ScatterChart: makePassThrough('ScatterChart'),
  RadarChart: makePassThrough('RadarChart'),
  XAxis: makePassThrough('XAxis'),
  YAxis: makePassThrough('YAxis'),
  ZAxis: makePassThrough('ZAxis'),
  CartesianGrid: makePassThrough('CartesianGrid'),
  Tooltip: makePassThrough('Tooltip'),
  Legend: makePassThrough('Legend'),
  ReferenceLine: makePassThrough('ReferenceLine'),
  ResponsiveContainer: ({ children }) => children,
  Scatter: makePassThrough('Scatter'),
  Radar: makePassThrough('Radar'),
}));
