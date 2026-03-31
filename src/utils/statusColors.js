/**
 * statusColors.js
 *
 * Shared, theme-aware badge color classes for entity statuses.
 * Light-mode: colored background + dark text (readable on white).
 * Dark-mode:  via dark: prefix — transparent dark bg + light text.
 *
 * Usage:
 *   import { contactStatusColors, leadStatusColors, bizdevStatusColors } from '@/utils/statusColors';
 *   <Badge className={`${contactStatusColors[status] || contactStatusColors.default} border capitalize`}>
 */

const c = (light, dark) => `${light} ${dark}`;

// ── Base palette ──────────────────────────────────────────────────────────────
const green   = c('bg-green-100   text-green-800   border-green-300',   'dark:bg-green-900/20   dark:text-green-300   dark:border-green-700');
const blue    = c('bg-blue-100    text-blue-800    border-blue-300',    'dark:bg-blue-900/20    dark:text-blue-300    dark:border-blue-700');
const emerald = c('bg-emerald-100 text-emerald-800 border-emerald-300', 'dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700');
const indigo  = c('bg-indigo-100  text-indigo-800  border-indigo-300',  'dark:bg-indigo-900/20  dark:text-indigo-300  dark:border-indigo-700');
const yellow  = c('bg-yellow-100  text-yellow-800  border-yellow-300',  'dark:bg-yellow-900/20  dark:text-yellow-300  dark:border-yellow-700');
const orange  = c('bg-orange-100  text-orange-800  border-orange-300',  'dark:bg-orange-900/30  dark:text-orange-400  dark:border-orange-700');
const red     = c('bg-red-100     text-red-800     border-red-300',     'dark:bg-red-900/20     dark:text-red-300     dark:border-red-700');
const slate   = c('bg-slate-100   text-slate-700   border-slate-300',   'dark:bg-slate-800      dark:text-slate-400   dark:border-slate-600');
const purple  = c('bg-purple-100  text-purple-800  border-purple-300',  'dark:bg-purple-900/20  dark:text-purple-300  dark:border-purple-700');

// ── Contact statuses ──────────────────────────────────────────────────────────
export const contactStatusColors = {
  active:   green,
  prospect: blue,
  customer: emerald,
  inactive: slate,
  default:  slate,
};

// ── Lead statuses ─────────────────────────────────────────────────────────────
export const leadStatusColors = {
  new:         blue,
  contacted:   indigo,
  qualified:   emerald,
  unqualified: yellow,
  converted:   green,
  lost:        red,
  default:     slate,
};

// ── BizDev source statuses ────────────────────────────────────────────────────
export const bizdevStatusColors = {
  active:   green,
  promoted: blue,
  archived: slate,
  default:  slate,
};

// ── License / compliance statuses ────────────────────────────────────────────
export const licenseStatusColors = {
  active:        green,
  suspended:     yellow,
  revoked:       red,
  expired:       orange,
  unknown:       slate,
  'not required': slate,
  default:       slate,
};

// ── Generic helper (falls back to slate) ──────────────────────────────────────
export function getStatusColor(map, status) {
  return map[status?.toLowerCase()] || map.default || slate;
}
