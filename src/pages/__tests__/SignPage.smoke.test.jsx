// @ts-check
/**
 * SignPage layout regression test (4VD-43 day 4b post-mortem).
 *
 * Background: src/styles/layout-theme.css contains a CRM-wide rule
 *   body [class*='max-w-'], body .mx-auto, body .container,
 *   main [class*='max-w-'], main .mx-auto, main .container,
 *   main .overflow-x-auto {
 *     max-width: 100% !important;
 *     width: 100% !important;
 *     margin-left: 0 !important;
 *     margin-right: 0 !important;
 *   }
 *
 * That rule is desirable for the CRM Layout (full-width Activities-style
 * cards), but it nukes the SignPage's 720px PDF page-div if any descendant
 * uses `mx-auto`, `container`, or `max-w-*`. The PDF would render at 720px
 * inside a 1500px+ stretched parent, and the absolute-positioned field
 * overlays — anchored as percentages of the parent — would drift far to
 * the right of the canvas. Inline `style={{width:720}}` cannot beat the
 * stylesheet rule's `!important`.
 *
 * Fix: SignPage.jsx avoids those class names entirely and uses inline
 * margin/width instead. This test enforces that contract by parsing the
 * source file and asserting no offending class names appear inside the
 * file's React tree (string-grep style — fragile but documents intent
 * and catches careless re-introductions).
 *
 * If you intentionally need one of these classes inside SignPage, the
 * fix is NOT to disable this test — it's to either
 *   (a) refactor layout-theme.css to be scoped to a CRM-only wrapper, or
 *   (b) use the inline-style equivalent (style={{maxWidth, marginLeft:'auto'}}).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGN_PAGE_PATH = path.resolve(__dirname, '..', 'SignPage.jsx');
const source = readFileSync(SIGN_PAGE_PATH, 'utf8');

/**
 * Strip slash-star block comments and double-slash line comments from a JSX
 * source so the regression checks below don't trip over comments that
 * intentionally mention the forbidden class names (e.g. our explanatory
 * header note).
 */
function stripComments(src) {
  // Remove /* ... */ blocks (greedy across lines).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove // line comments — JSX rule of thumb: from `//` to end-of-line,
  // but only when not inside a JSX text node. Good enough for this file.
  out = out.replace(/(^|\s)\/\/[^\n]*$/gm, '$1');
  return out;
}

const codeOnly = stripComments(source);

describe('SignPage layout — global CSS override avoidance', () => {
  it('does not use the `mx-auto` Tailwind class', () => {
    // body .mx-auto rule forces width: 100% !important on every match.
    expect(codeOnly).not.toMatch(/className="[^"]*\bmx-auto\b[^"]*"/);
    expect(codeOnly).not.toMatch(/className=\{[^}]*['"`][^'"`]*\bmx-auto\b/);
  });

  it('does not use the `container` Tailwind class', () => {
    // body .container rule forces width: 100% !important on every match.
    expect(codeOnly).not.toMatch(/className="[^"]*\bcontainer\b[^"]*"/);
  });

  it('does not use any `max-w-*` Tailwind class on layout containers', () => {
    // [class*='max-w-'] selector matches max-w-lg / max-w-2xl / max-w-3xl etc.
    // The signature image and shadcn DialogContent contain `max-w-full` /
    // `max-w-lg` respectively — they're allowed (the image fills its button,
    // and the dialog modal width is governed by Radix's fixed positioning).
    // What we care about is layout containers in our own JSX, so we scan
    // for `max-w-` on plain divs/main/header tags.
    const layoutMaxWMatches = codeOnly.match(
      /<(div|main|header|section|article)[^>]*className="[^"]*\bmax-w-[a-z0-9]+\b[^"]*"/g,
    );
    // Only allowed match: the signature `<img>` with `max-w-full max-h-full`.
    // Since we restrict to div|main|header|section|article, the img is
    // excluded by tag name.
    expect(layoutMaxWMatches).toBeNull();
  });

  it('does not use `overflow-x-auto` on any element inside <main>', () => {
    // main .overflow-x-auto rule forces width: 100% !important.
    // overflow-hidden on the page-div is fine — it is NOT matched by the
    // [class*='overflow-x-auto'] selector.
    expect(codeOnly).not.toMatch(/className="[^"]*\boverflow-x-auto\b[^"]*"/);
  });

  it('uses inline style for the 720px PDF page-div width', () => {
    // We expect the page-div to set width via inline style (so the
    // CRM-wide CSS rule cannot override it). The exact width value comes
    // from RENDER_WIDTH_PX = 720 (line ~47).
    expect(codeOnly).toMatch(/RENDER_WIDTH_PX\s*=\s*720/);
    // The page-div <div> uses `style={{ width: ${p.widthPx}px ... }}`.
    expect(codeOnly).toMatch(/width:\s*`\$\{p\.widthPx\}px`/);
    expect(codeOnly).toMatch(/marginLeft:\s*['"]auto['"]/);
    expect(codeOnly).toMatch(/marginRight:\s*['"]auto['"]/);
  });

  it('uses inline style for the <main> 768px constraint', () => {
    // PageShell main element should set maxWidth via inline style.
    expect(codeOnly).toMatch(/maxWidth:\s*['"]768px['"]/);
  });

  it('absolute-positions field overlays via percentage-of-parent', () => {
    // FieldControl positions overlays as percentages relative to the
    // page-div. Sanity-check the math is `area.x * 100 + '%'` etc.
    expect(codeOnly).toMatch(/left:\s*`\$\{area\.x\s*\*\s*100\}%`/);
    expect(codeOnly).toMatch(/top:\s*`\$\{area\.y\s*\*\s*100\}%`/);
    expect(codeOnly).toMatch(/width:\s*`\$\{area\.w\s*\*\s*100\}%`/);
    expect(codeOnly).toMatch(/height:\s*`\$\{area\.h\s*\*\s*100\}%`/);
  });
});

describe('SignPage next-field guidance — pointer + jump button + state visuals', () => {
  it('sorts ALL fields in reading order (page → y → x), not just required ones', () => {
    // The pointer must walk every fillable field, not just `required: true`
    // ones. Most templates default only `signature` to required (per
    // signingFieldCoords.js#defaultRequired), so a required-only pointer
    // would skip past every text/name/email/date/checkbox box on the
    // form — confusing to recipients who see those highlighted in blue
    // and expect the pointer to lead them through.
    expect(codeOnly).toMatch(/const\s+orderedFields\s*=\s*useMemo/);
    expect(codeOnly).toMatch(/aArea\.page\s*-\s*bArea\.page/);
    expect(codeOnly).toMatch(/aArea\.y\s*-\s*bArea\.y/);
    expect(codeOnly).toMatch(/aArea\.x\s*-\s*bArea\.x/);
    // The old required-only sort identifier should be gone — guard
    // against accidental reintroduction during refactors.
    expect(codeOnly).not.toMatch(/orderedRequiredFields/);
  });

  it('exposes a `nextField` (renamed from nextRequiredField) covering all fields', () => {
    // First unfilled field in reading order is what the badge + jump
    // target. Null when everything is filled.
    expect(codeOnly).toMatch(/const\s+nextField\s*=\s*useMemo/);
    expect(codeOnly).toMatch(/orderedFields\.find\(\s*\(f\)\s*=>\s*!isFieldFilled\(f\)\s*\)/);
    // Old name should be fully removed.
    expect(codeOnly).not.toMatch(/nextRequiredField/);
  });

  it('keeps required-only gate for submit (missingRequired filters by f.required)', () => {
    // Optional fields don't block Sign-and-Submit — only `required: true`
    // ones do. The missingRequired memo must still filter by f.required
    // so the submit button isn't gated on optional text fields.
    expect(codeOnly).toMatch(/missingRequired/);
    expect(codeOnly).toMatch(/f\.required\s*&&\s*!isFieldFilled\(f\)/);
  });

  it('shows a Required vs Optional pill on the floating bar', () => {
    // Recipients need to know whether the next field is mandatory or
    // skippable. Required pill is red, Optional pill is amber-outlined.
    expect(codeOnly).toMatch(/Required/);
    expect(codeOnly).toMatch(/Optional/);
    // Red = #dc2626 (Tailwind red-600).
    expect(codeOnly).toMatch(/#dc2626/);
  });

  it('renders a yellow "Next ▸" badge on the next-required field', () => {
    expect(codeOnly).toMatch(/Next\s*▸/);
    // Badge should be amber (Tailwind 500 hex).
    expect(codeOnly).toMatch(/#f59e0b/);
  });

  it('renders a green check on filled fields', () => {
    // ✓ icon + green-600 hex on the corner badge.
    expect(codeOnly).toContain('✓');
    expect(codeOnly).toMatch(/#16a34a/);
  });

  it('exposes a Jump button that scrolls + flashes the target field', () => {
    expect(codeOnly).toMatch(/const\s+jumpToNextField\s*=\s*useCallback/);
    expect(codeOnly).toMatch(/scrollIntoView/);
    expect(codeOnly).toMatch(/signing-flash/);
  });

  it('inlines the pulse + flash keyframes (no global CSS dependency)', () => {
    expect(codeOnly).toMatch(/@keyframes\s+signing-pulse/);
    expect(codeOnly).toMatch(/@keyframes\s+signing-flash/);
  });

  it('registers field DOM refs so jumpToNextField can target them', () => {
    expect(codeOnly).toMatch(/registerFieldRef/);
    expect(codeOnly).toMatch(/fieldRefs\.current/);
  });

  it('uses overflow:visible on the page-div so the NEXT badge is not clipped', () => {
    // Field areas are validated [0,1] at template-create time
    // (signingFieldCoords.js) AND again at sign-time, so the previous
    // overflow:hidden defensive bound is no longer load-bearing. Switch
    // to visible so the NEXT badge positioned at top: -1.25rem on a
    // top-of-page field doesn't get clipped.
    expect(codeOnly).toMatch(/overflow:\s*['"]visible['"]/);
  });

  it('disables browser scroll restoration on mount so the page always starts at top', () => {
    // Public recipient page — having the browser re-open it scrolled to
    // a previous position (from prior tab session) is inconsistent UX.
    // We force `history.scrollRestoration = 'manual'` and `scrollTo(0,0)`
    // on mount, restoring the previous mode on unmount.
    expect(codeOnly).toMatch(/scrollRestoration\s*=\s*['"]manual['"]/);
    expect(codeOnly).toMatch(/window\.scrollTo\(\s*0\s*,\s*0\s*\)/);
    // Cleanup must restore the original value so we don't bleed into
    // subsequent navigation in the same tab.
    expect(codeOnly).toMatch(/scrollRestoration\s*=\s*previous/);
  });

  it('uses useLayoutEffect (not useEffect) for scroll override so it runs before paint', () => {
    // useLayoutEffect runs synchronously after DOM mutation but BEFORE
    // the browser paints — earlier than useEffect, which only fires
    // post-paint.
    expect(codeOnly).toMatch(/useLayoutEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?scrollRestoration/);
  });
});

describe('SignPage Tab order — fields render in visual reading order per page', () => {
  it('sorts fields on each page by (y, x) before render', () => {
    // Without this sort, fields render — and therefore Tab-navigate — in
    // template-declaration order. If the template author placed a
    // right-column field before a left-column one (common when adding
    // fields top-down in one column then the other), Tab would jump
    // visually backward, which Claude-in-Chrome diagnosed as the cause
    // of the "page lands at the signature block" symptom on the
    // Service Agreement template.
    expect(codeOnly).toMatch(/fieldsOnPage\s*=\s*fields[\s\S]{0,500}\.sort\(/);
    expect(codeOnly).toMatch(/aArea\.y\s*-\s*bArea\.y/);
    expect(codeOnly).toMatch(/aArea\.x\s*-\s*bArea\.x/);
    // Row tolerance prevents same-baseline fields from oscillating on
    // sub-pixel y differences. 0.02 = 2% of page height.
    expect(codeOnly).toMatch(/Math\.abs\(\s*aArea\.y\s*-\s*bArea\.y\s*\)\s*>\s*0\.02/);
  });

  it('uses a plain text input for date fields (not native type=date) so Tab does not get trapped', () => {
    // Native <input type="date"> traps focus inside its month/day/year
    // sub-fields — Tab cycles internally and never escapes to the next
    // form field. Substituting a typed text input with MM/DD/YYYY
    // placeholder restores normal Tab-out behavior.
    expect(codeOnly).not.toMatch(/type="date"/);
    expect(codeOnly).toMatch(/placeholder="MM\/DD\/YYYY"/);
    expect(codeOnly).toMatch(/inputMode="numeric"/);
  });
});
