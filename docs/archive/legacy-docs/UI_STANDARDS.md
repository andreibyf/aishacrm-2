# AiSHA CRM UI Standards

> **Version 1.0** | Created: December 4, 2025  
> Phase 4 Full Cutover Documentation

---

## 1. Layout System

### Spacing Scale (Tailwind)

| Token | Value | Usage |
|-------|-------|-------|
| `gap-1` | 4px | Inline elements, icon gaps |
| `gap-2` | 8px | Related elements, button groups |
| `gap-3` | 12px | Section spacing |
| `gap-4` | 16px | Card padding, major sections |
| `gap-6` | 24px | Page sections |
| `gap-8` | 32px | Major layout divisions |

### Container Widths

| Component | Width | Notes |
|-----------|-------|-------|
| AI Sidebar | 420px | Fixed width drawer |
| Header Pill | 210px | `sm:w-[210px]` |
| Floating Widget | 80px | Square avatar button |
| Modal/Dialog | 480-640px | Responsive max-width |

---

## 2. AI Component Standards

### Header Pill (`AiAssistantLauncher.jsx`)

```
┌─────────────────────────────────────┐
│ ┌───────┐                           │
│ │ Avatar│  ASK AISHA               │
│ │ 36×36 │  Executive Assistant ●   │
│ └───────┘                           │
└─────────────────────────────────────┘
```

**Specifications:**
- Height: 40px (`h-10`)
- Width: Full on mobile, 210px on sm+
- Border: `border border-white/15`
- Background: `bg-slate-900/70`
- Border Radius: `rounded-2xl`
- Shadow: `shadow-lg shadow-slate-950/40`

**Avatar Alignment:**
- Centered in 36×36 container
- Status dot: Bottom-right, 14px diameter
- Text: `translate-y-[1px]` for optical centering

### Sidebar Hero Block (`AiSidebar.jsx`)

```
┌─────────────────────────────────────────┐
│  AISHA • EXECUTIVE ASSISTANT            │
│                                         │
│  Precision briefings, revenue           │  ┌──────────┐
│  intelligence, and voice-ready          │  │  Avatar  │
│  coaching.                              │  │  160×160 │
│                                         │  └──────────┘
│  ┌──────────────────────────────────┐   │
│  │ ● Voice ready • Live support     │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Specifications:**
- Padding: `px-6 py-6`
- Background: Gradient from white/95 to slate-50/95 (light)
- Dark: `dark:from-slate-900/95 dark:to-slate-800/95`
- Avatar: `rounded-[28px]`, `ring-4 ring-white/80`
- LIVE badge: Absolute positioned, bottom-right of avatar

### Floating Avatar Widget (`AvatarWidget.jsx`)

**Specifications:**
- Size: 80×80 px
- Position: Fixed, bottom-right (24px from edges)
- z-index: 2100 (above sidebar)
- Border: 3px solid, color changes by state
- Glow: Radial gradient with blur, scales on state change

**State Colors:**
| State | Border | Glow |
|-------|--------|------|
| Idle | Yellow-500 | Yellow 20% opacity |
| Listening | Blue-500 | Blue 50% opacity |
| Speaking | Green-500 | Green 50% opacity |

---

## 3. Typography Hierarchy

### AI Component Text Sizes

| Element | Size | Weight | Tracking |
|---------|------|--------|----------|
| Hero Title | `text-[10px]` | Bold | `tracking-widest` |
| Hero Headline | `text-xl` | Semibold | Default |
| Hero Body | `text-sm` | Normal | Default |
| Status Badge | `text-[11px]` | Semibold | `tracking-wide` |
| Launcher Title | `text-[10px]` | Semibold | `tracking-[0.25em]` |
| Launcher Subtitle | `text-[13px]` | Semibold | Default |

### Uppercase Patterns

Apply uppercase with tracking for:
- Status badges
- Section labels
- Assistant identity labels

```jsx
<span className="text-[10px] font-semibold uppercase tracking-wide">
  Voice ready
</span>
```

---

## 4. Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-lg` | 8px | Input fields, small buttons |
| `rounded-xl` | 12px | Cards, message bubbles |
| `rounded-2xl` | 16px | Larger cards, avatar containers |
| `rounded-[28px]` | 28px | Hero avatar, large containers |
| `rounded-full` | 50% | Circular avatars, status dots |

---

## 5. Shadow System

### Elevation Levels

| Level | Class | Usage |
|-------|-------|-------|
| Low | `shadow-sm` | Cards, sections |
| Medium | `shadow-md` | Dropdowns, floating elements |
| High | `shadow-lg` | Modals, important actions |
| Elevated | `shadow-2xl` | Floating widgets |

### Avatar Shadows

```jsx
// Hero avatar
className="shadow-[0_25px_55px_rgba(15,23,42,0.35)]"

// Floating widget
className="shadow-2xl shadow-slate-950/50"

// Status dot
className="shadow-md"
```

---

## 6. Interactive States

### Buttons

| State | Effect |
|-------|--------|
| Hover | `hover:-translate-y-0.5` (lift) |
| Focus | `focus-visible:ring-2 focus-visible:ring-indigo-500` |
| Active | `active:translate-y-0` (press) |
| Disabled | `disabled:opacity-50 disabled:cursor-not-allowed` |

### Avatar Widget

| State | Effect |
|-------|--------|
| Hover | Border color intensifies |
| Focus | Focus ring with offset |
| Listening | Glow scales to 1.3x |
| Speaking | Glow scales to 1.4x + pulse |

---

## 7. Dark Mode

### Surface Colors

| Element | Light | Dark |
|---------|-------|------|
| Background | `bg-white` | `dark:bg-slate-900` |
| Card | `bg-white/90` | `dark:bg-slate-900/70` |
| Border | `border-slate-200` | `dark:border-slate-700` |
| Text Primary | `text-slate-900` | `dark:text-white` |
| Text Secondary | `text-slate-500` | `dark:text-slate-400` |

### Ring Colors

| Element | Light | Dark |
|---------|-------|------|
| Avatar Ring | `ring-white/80` | `dark:ring-slate-900/70` |
| Focus Ring | `ring-indigo-500` | Same |
| Status Ring | `ring-emerald-500/50` | Same |

---

## 8. Responsive Breakpoints

### AI Components

| Breakpoint | Changes |
|------------|---------|
| < 640px (sm) | Widget position adjusts, pill full-width |
| 640-1024px | Default layout |
| > 1024px (lg) | Hero block side-by-side layout |

### Sidebar Behavior

- Mobile: Full-screen overlay
- Desktop: Right-side drawer, 420px width
- Animation: Slide from right with fade

---

## 9. Z-Index Scale

| Layer | z-index | Components |
|-------|---------|------------|
| Base | 0 | Page content |
| Dropdown | 50 | Menus, selects |
| Sticky | 100 | Headers, nav |
| Modal | 1000 | Dialogs |
| Sidebar | 2000 | AI sidebar drawer |
| Widget | 2100 | Floating avatar |
| Toast | 2200 | Notifications |

---

## 10. Component Checklist

When creating new AI-related components:

- [ ] Follow spacing scale (use Tailwind tokens)
- [ ] Apply correct border radius for component type
- [ ] Include dark mode variants
- [ ] Add interactive states (hover, focus, active)
- [ ] Test at all breakpoints (sm, md, lg)
- [ ] Verify z-index doesn't conflict with existing layers
- [ ] Apply correct typography hierarchy
- [ ] Include shadows appropriate to elevation level

---

*Last Updated: December 4, 2025 – Phase 4 Full Cutover*
