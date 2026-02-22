# AiSHA CRM Branding Guide

> **Version 1.0** | Created: December 4, 2025  
> Phase 4 Full Cutover Documentation

---

## 1. Brand Identity

### Product Name

- **Full Name:** AiSHA CRM (AI Super Hi-performing Assistant)
- **Short Name:** AiSHA
- **Assistant Title:** AiSHA Executive Assistant

### Brand Voice

- Professional yet approachable
- Confident and knowledgeable
- Helpful without being pushy
- Uses "I" for self-reference (first person)

---

## 2. Avatar Assets

### Current Production Avatar

| Asset              | Path                                   | Dimensions | Format |
| ------------------ | -------------------------------------- | ---------- | ------ |
| Executive Portrait | `/assets/aisha-executive-portrait.jpg` | 400×400 px | JPEG   |

**File Location:** `public/assets/aisha-executive-portrait.jpg`

### Usage Guidelines

**DO:**

- Use the executive portrait for all AI assistant UI surfaces
- Maintain 1:1 aspect ratio when resizing
- Apply circular mask with appropriate border radius
- Use consistent sizing within each component type

**DON'T:**

- Stretch or distort the portrait
- Apply filters that alter the professional appearance
- Use different avatars for the same assistant identity
- Crop to non-square ratios

### Component-Specific Sizing

| Component                  | Size       | Border Radius    | Ring/Border                   |
| -------------------------- | ---------- | ---------------- | ----------------------------- |
| `AiSidebar.jsx` (Hero)     | 160×160 px | `rounded-[28px]` | `ring-4 ring-white/80`        |
| `AvatarWidget.jsx` (Float) | 80×80 px   | `50%` (circle)   | 3px border with glow          |
| `AiAssistantLauncher.jsx`  | 36×36 px   | `rounded-2xl`    | `ring-1 ring-indigo-300/50`   |
| `FloatingAIWidget.jsx`     | 56×56 px   | `rounded-2xl`    | Shadow + ring                 |
| `AIAssistantWidget.jsx`    | 32×32 px   | `rounded-xl`     | `ring-2 ring-white/40`        |
| `AgentChat.jsx` (Header)   | 40×40 px   | `50%` (circle)   | `border-2 border-cyan-500/30` |
| `AgentChat.jsx` (Message)  | 32×32 px   | `50%` (circle)   | None (inline)                 |

---

## 3. Deprecated Assets

### Legacy Avatar (Do Not Use)

| Asset      | Path                | Status        |
| ---------- | ------------------- | ------------- |
| Old Avatar | `/aisha-avatar.jpg` | ❌ DEPRECATED |

**Note:** The legacy avatar file remains in `public/` for backward compatibility but should NOT be referenced in new code. All references have been migrated to the executive portrait as of Phase 4.

---

## 4. Color Palette

### Primary Colors

| Name       | Value     | Usage                              |
| ---------- | --------- | ---------------------------------- |
| Indigo-500 | `#6366F1` | Primary accent, links, focus rings |
| Indigo-600 | `#4F46E5` | Hover states                       |
| Slate-900  | `#0F172A` | Dark backgrounds                   |
| White      | `#FFFFFF` | Light backgrounds, text on dark    |

### Status Indicators

| State       | Color                 | CSS Class              |
| ----------- | --------------------- | ---------------------- |
| Voice Ready | Sky-400 `#38BDF8`     | `bg-sky-400`           |
| Live/Active | Emerald-400 `#34D399` | `bg-emerald-400`       |
| Realtime    | Red-500 `#EF4444`     | `bg-red-500` (pulsing) |
| Warning     | Amber-400 `#FBBF24`   | `bg-amber-400`         |

### Dark Mode Variants

All UI surfaces support dark mode via Tailwind `dark:` classes:

```css
/* Example pattern */
.component {
  @apply bg-white dark:bg-slate-900;
  @apply text-slate-900 dark:text-white;
  @apply border-slate-200 dark:border-slate-700;
}
```

---

## 5. Typography

### Assistant Labels

| Context      | Style                                                   |
| ------------ | ------------------------------------------------------- |
| Main Title   | `text-xl font-semibold`                                 |
| Subtitle     | `text-sm text-slate-500`                                |
| Status Badge | `text-[11px] font-semibold uppercase tracking-wide`     |
| Headlines    | `text-[10px] font-semibold uppercase tracking-[0.25em]` |

### Common Patterns

```jsx
// Hero title
<p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
  AiSHA • Executive Assistant
</p>

// Status pill
<div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
  <span className="h-2 w-2 rounded-full bg-emerald-400" />
  Voice ready • Live support
</div>
```

---

## 6. Animation Guidelines

### Glow Effects

Use radial gradients for avatar glow:

```css
/* Speaking state */
radial-gradient(circle, rgba(34, 197, 94, 0.5) 0%, transparent 70%)

/* Listening state */
radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)

/* Idle state */
radial-gradient(circle, rgba(234, 179, 8, 0.4) 0%, transparent 70%)
```

### Pulse Animations

- Use `animate-pulse` for active speaking/listening states
- Apply `animate-ping` for attention-getting indicators
- Keep animations subtle and non-distracting

---

## 7. Accessibility

### Required Attributes

All avatar images MUST include:

```jsx
<img src="/assets/aisha-executive-portrait.jpg" alt="AiSHA Executive Assistant" loading="lazy" />
```

### Alt Text Standards

| Context       | Alt Text                               |
| ------------- | -------------------------------------- |
| Hero/Main     | `"AiSHA Executive Assistant portrait"` |
| Inline/Small  | `"AiSHA Executive Assistant"`          |
| Button/Toggle | `"AiSHA assistant"`                    |

---

## 8. Implementation Checklist

When adding AiSHA avatar to a new component:

- [ ] Import from `/assets/aisha-executive-portrait.jpg`
- [ ] Apply appropriate size from sizing table
- [ ] Include `alt` text
- [ ] Add `loading="lazy"` for non-critical renders
- [ ] Apply correct border radius
- [ ] Include dark mode variants for surrounding elements
- [ ] Test in both light and dark themes

---

_Last Updated: December 4, 2025 – Phase 4 Full Cutover_
