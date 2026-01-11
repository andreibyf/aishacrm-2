# LCP Optimization v3.7.30 - Core Web Vitals Improvements

**Date:** January 11, 2026  
**Issue:** 43% of page loads have Poor LCP (> 4.0s), especially on Dashboard  
**Root Cause:** Large entry bundle (930 KB / 279 KB gzipped)  

## Changes Implemented

### 1. **Resource Preloading & DNS Optimization** (index.html)
- Added DNS prefetch for `api.aishacrm.com` and Supabase domains
- Added preconnect hints with crossorigin for critical API domains
- **Expected Impact:** ~200-500ms reduction in API connection time

### 2. **Recharts Code Splitting** (vite.config.js)
- Split Recharts library into separate chunk
- Recharts is ~100 KB and only used on Dashboard/Reports pages
- **Expected Impact:** ~100 KB reduction in entry bundle size

## Current Bundle Analysis (Before Optimization)

```
dist/assets/entry-DzM4EkR8.js        930.72 kB │ gzip: 279.35 kB  ⚠️ TOO LARGE
dist/assets/generateCategoricalChart 384.72 kB │ gzip: 106.29 kB  (Recharts - now split)
dist/assets/supabase-DfC5Uaxs.js     176.73 kB │ gzip:  45.73 kB  ✓ Already split
dist/assets/react-core-CAgH1WAY.js   144.07 kB │ gzip:  46.16 kB  ✓ Already split
```

## Expected Results

**Before:**
- Entry bundle: 930 KB (279 KB gzipped)
- LCP: 43% Poor, 57% Good

**After (Estimated):**
- Entry bundle: ~830 KB (250 KB gzipped) - 11% reduction
- LCP: 25-30% Poor, 70-75% Good - ~40% improvement

## Additional Recommendations (Future Work)

### High Impact (~1-2s LCP improvement each):

1. **Dashboard-Specific Optimization**
   - Implement virtual scrolling for large data tables
   - Defer non-critical widgets (show skeleton first, load on idle)
   - Cache dashboard bundle for 5 minutes (already done)

2. **Image Optimization**
   - Convert PNG/JPG to WebP format
   - Add responsive images with srcset
   - Lazy load images below the fold

3. **Critical CSS Inlining**
   - Extract above-the-fold CSS and inline in `<head>`
   - Defer non-critical CSS loading

4. **Font Optimization**
   - Preload critical fonts
   - Use font-display: swap
   - Subset fonts to reduce file size

### Medium Impact (~500ms LCP improvement each):

5. **Service Worker / Caching**
   - Implement Service Worker for offline-first
   - Cache static assets (JS/CSS/fonts) with Workbox
   - Cache API responses with stale-while-revalidate strategy

6. **HTTP/2 Server Push**
   - Configure Cloudflare to push critical resources
   - Push entry.js, CSS, and fonts in parallel

7. **Tree Shaking Improvements**
   - Audit unused exports in large libraries
   - Replace moment.js with date-fns (lighter)
   - Remove unused Radix UI components

### Low Impact (~100-200ms each):

8. **Minification & Compression**
   - Enable Brotli compression on Cloudflare
   - Use esbuild minifier (faster than Terser)

9. **Reduce Third-Party Scripts**
   - Defer non-critical analytics
   - Use lightweight analytics alternatives

10. **Progressive Hydration**
    - Hydrate critical components first
    - Defer hydration of below-the-fold content

## Monitoring

### Cloudflare Web Analytics
- Monitor LCP improvements over next 7 days
- Target: < 30% Poor LCP (currently 43%)

### Lighthouse CI
```bash
npm run lighthouse -- --url=https://app.aishacrm.com/dashboard
```

Expected scores after optimization:
- Performance: 70+ (currently ~60)
- LCP: 2.5s-3.5s (currently 4.0s+)

## Testing Commands

```bash
# Build and analyze bundle
npm run build
npx vite-bundle-visualizer

# Test production build locally
npm run preview

# Run Lighthouse audit
npx lighthouse https://app.aishacrm.com/dashboard --view
```

## Deployment

```bash
git add index.html vite.config.js LCP_OPTIMIZATION_V3.7.30.md
git commit -m "perf: optimize LCP with resource preloading and Recharts code splitting

- Add DNS prefetch and preconnect for API domains
- Split Recharts into separate chunk (~100KB reduction)
- Reduce entry bundle from 930KB to ~830KB
- Target: 43% Poor LCP → 25-30% Poor LCP

Refs: Cloudflare Core Web Vitals data showing 43% Poor LCP"

git tag v3.7.31 -m "LCP optimization - resource hints and code splitting"
git push && git push --tags
```

## Verification Checklist

After deployment, verify:
- [ ] Entry bundle size reduced by ~100 KB
- [ ] Recharts chunk loads separately on Dashboard page
- [ ] DNS prefetch working (check Network tab in DevTools)
- [ ] No console errors or broken functionality
- [ ] Dashboard loads without regression
- [ ] Monitor Cloudflare Analytics for LCP improvement over 3-7 days

## Rollback Plan

If LCP worsens or errors occur:
```bash
git revert HEAD
git push
```

Or revert specific file:
```bash
git checkout v3.7.30 -- index.html vite.config.js
git commit -m "revert: rollback LCP optimizations"
git push
```
