# Asset Licenses

> **Version 1.0** | Created: December 4, 2025  
> Phase 4 Full Cutover Documentation

---

## Overview

This document tracks the licensing status of all media assets used in Aisha CRM.

---

## 1. AiSHA Executive Portrait

### Current Production Asset

| Property | Value |
|----------|-------|
| **File** | `public/assets/aisha-executive-portrait.jpg` |
| **Type** | AI-Generated Image |
| **Generator** | [To be documented] |
| **Creation Date** | November 2025 |
| **Dimensions** | 400×400 pixels |
| **Format** | JPEG |

### Usage Rights

| Right | Status |
|-------|--------|
| Commercial Use | ✅ Permitted |
| Modification | ✅ Permitted |
| Distribution | ✅ Permitted (within product) |
| Attribution | Not required |
| Exclusive | No (standard AI generation terms) |

### AI Generation Notes

This portrait was generated using AI image generation tools. Per standard terms of most AI image generators:

- The generated image is licensed for commercial use
- No copyright exists on AI-generated content (per current US law)
- The image may be modified and adapted as needed
- No attribution to the AI tool is required

**Recommendation:** If switching to a human-created or stock image in the future, ensure proper licensing is in place.

---

## 2. Legacy Avatar (Deprecated)

### Deprecated Asset

| Property | Value |
|----------|-------|
| **File** | `public/aisha-avatar.jpg` |
| **Status** | ❌ DEPRECATED (do not use) |
| **Type** | AI-Generated Image |
| **Notes** | Retained for backward compatibility only |

---

## 3. Logo Assets

### 4V Data Consulting Logo

| Property | Value |
|----------|-------|
| **File** | `public/4v-logo.png` |
| **Owner** | 4V Data Consulting |
| **Usage** | Internal/partner branding only |

### Ai-SHA Logo

| Property | Value |
|----------|-------|
| **File** | `public/assets/Ai-SHA-logo-2.png` |
| **Owner** | Aisha CRM / 4V Data Consulting |
| **Type** | Custom designed logo |
| **Usage** | Product branding |

---

## 4. Third-Party Assets

### Icons (Lucide React)

| Property | Value |
|----------|-------|
| **Package** | `lucide-react` |
| **License** | ISC License |
| **Attribution** | Not required |
| **Usage** | All UI icons |

### UI Components (shadcn/ui)

| Property | Value |
|----------|-------|
| **Package** | `@radix-ui/*` + custom components |
| **License** | MIT License |
| **Attribution** | Not required |
| **Usage** | All UI primitives |

---

## 5. Font Assets

### System Fonts

Aisha CRM uses system font stacks via Tailwind CSS defaults:

```css
font-family: ui-sans-serif, system-ui, sans-serif, 
             "Apple Color Emoji", "Segoe UI Emoji", 
             "Segoe UI Symbol", "Noto Color Emoji";
```

No custom fonts are bundled; no font licenses apply.

---

## 6. Compliance Checklist

When adding new assets:

- [ ] Document source/origin
- [ ] Verify commercial usage rights
- [ ] Check attribution requirements
- [ ] Add entry to this document
- [ ] Store license file if provided

### Red Flags (Do Not Use)

- ❌ Copyrighted images without license
- ❌ "For personal use only" assets
- ❌ Stock photos without valid subscription/purchase
- ❌ Screenshots of other products
- ❌ Logos of other companies (without permission)

---

## 7. Contact

For licensing questions, contact the development team or review individual asset sources.

---

*Last Updated: December 4, 2025 – Phase 4 Full Cutover*
