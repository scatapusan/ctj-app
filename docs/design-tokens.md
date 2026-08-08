# Design Tokens — CTJCC Marikina Attendance App

**Extracted:** 2026-08-07 from commit `c1aeeda`.
Sources: `app/globals.css` (CSS custom properties, utilities, keyframes), `tailwind.config.ts` (semantic color mapping, radii, shadows), `app/layout.tsx` (fonts), and the literal utility classes in `components/**` and `app/**`. Every value below appears in the code; nothing is aspirational. Hex values for HSL tokens are exact sRGB conversions.

The app is **dark-theme only** — there is no light mode and no theme switch.

---

## 1. Colors

### 1.1 Semantic tokens (CSS variables in `app/globals.css`, mapped in Tailwind as `bg-background`, `text-foreground`, etc.)

| Token | HSL (as authored) | Hex | Used for |
|-------|-------------------|-----|----------|
| `--background` | `220 25% 5%` | `#0A0C10` | Page background |
| `--foreground` | `210 40% 96%` | `#F1F5F9` | Body text |
| `--card` | `220 25% 8%` | `#0F131A` | Card fills |
| `--card-foreground` | `210 40% 96%` | `#F1F5F9` | Card text |
| `--popover` | `220 25% 8%` | `#0F131A` | Select dropdowns, popovers |
| `--popover-foreground` | `210 40% 96%` | `#F1F5F9` | Popover text |
| `--primary` | `28 90% 54%` | `#F38320` | Default button fill, ring, checked checkbox |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--secondary` | `220 15% 15%` | `#21242C` | Secondary button fill |
| `--secondary-foreground` | `210 40% 90%` | `#DBE6F0` | Text on secondary |
| `--muted` | `220 15% 15%` | `#21242C` | Muted fills, avatar fallback |
| `--muted-foreground` | `215 15% 55%` | `#7B899D` | Secondary text, labels, placeholders |
| `--accent` | `213 70% 40%` | `#1F5FAD` | Blue accent (rarely used directly) |
| `--accent-foreground` | `0 0% 100%` | `#FFFFFF` | Text on accent |
| `--destructive` | `0 72% 51%` | `#DC2828` | Destructive button fill |
| `--destructive-foreground` | `210 40% 98%` | `#F9FBFD` | Text on destructive |
| `--border` | `215 20% 16%` | `#212731` | Default borders (`border-border` applied globally via `* { }`) |
| `--input` | `215 20% 16%` | `#212731` | (Defined; actual inputs use `white/[0.1]` instead — see 1.3) |
| `--ring` | `28 90% 54%` | `#F38320` | Focus rings (default) |

### 1.2 Tailwind palette colors used directly in components (with usage counts across `app/` + `components/`)

| Class family | Hex | Count | Where |
|--------------|-----|-------|-------|
| `orange-400` | `#FB923C` | 85 | Icons, links, accent text, avatar initials, hovers |
| `orange-500` | `#F97316` | 76 | Gradient start, glows, checked switches, ring tints |
| `orange-300` | `#FDBA74` | 7 | Light accents |
| `amber-500` | `#F59E0B` | 13 | Gradient end |
| `amber-400` | `#FBBF24` | 5 | Gradient hover end |
| `amber-300` | `#FCD34D` | 1 | `gradient-text` end stop |
| `amber-600` | `#D97706` | 2 | Landing background orb |
| `blue-500` | `#3B82F6` | 20 | Admin accents, orbs, "Core" badge tones |
| `blue-400` | `#60A5FA` | 5 | Admin accent text |
| `blue-300` | `#93C5FD` | 1 | Light blue accent |
| `red-500` | `#EF4444` | 15 | Error fills/borders (`red-500/10`, `red-500/20`) |
| `red-400` | `#F87171` | 25 | Error text |
| `red-300` | `#FCA5A5` | 3 | Light error accents |
| `purple-500` | `#A855F7` | 4 | Admin stat-card accent |
| `purple-400` | `#C084FC` | 2 | Admin stat-card accent text |

### 1.3 White-alpha system (glass surfaces)

Surfaces and borders are built from white at low alpha over the dark background, not from gray tokens:

| Value | Used for |
|-------|----------|
| `white/[0.04]` | Input/textarea/select fills, glass card fill, skeleton fill, ghost hover |
| `white/[0.06]` | Input focus fill, subtle dividers, ghost hover |
| `white/[0.07]` | Glass hover fill |
| `white/[0.08]` | Glass card border, outline-button hover fill |
| `white/[0.1]` | Input/select/outline-button borders, logo ring |
| `white/[0.12]` | Glass hover border, unchecked switch fill |
| `white/[0.15]` | Outline-button hover border |

### 1.4 Hardcoded one-off colors

| Hex | Where |
|-----|-------|
| `#F59120` | QR code foreground (`components/admin/qr-modal.tsx`) — the "brand orange" used for QR, ≈ the `rgba(245,145,30,…)` in all glow shadows |
| `#0A0A12` | QR code background (qr-modal) — note: *not* identical to `--background` `#0A0C10` |
| `#666`, `#999`, `#FFF` | QR print-view inline styles (light-theme print page) |

### 1.5 Gradients

| Name (informal) | Definition | Where |
|-----------------|-----------|-------|
| CTA gradient | `linear, orange-500 → amber-500` (`from-orange-500 to-amber-500`); hover shifts to `orange-400 → amber-400` | Gradient buttons, landing CTA |
| Heading text gradient | `orange-400 → amber-300`, clipped to text (`.gradient-text`) | H1s, member name, section titles |
| Logo tile gradient | `orange-500/20 → amber-500/20` (landing) and `orange-500/20 → blue-500/20` (admin) | Logo tiles |

---

## 2. Typography

### 2.1 Families

- **Loaded but NOT applied:** Geist Sans variable (`app/fonts/GeistVF.woff`, weights 100–900) and Geist Mono variable, exposed as `--font-geist-sans` / `--font-geist-mono` on `<body>`. No Tailwind `fontFamily` config and no class references them.
- **Actually rendering:** Tailwind's default stack — `ui-sans-serif, system-ui, sans-serif, …` (Segoe UI on Windows, Roboto on Android, SF Pro on iOS).
- `font-mono` (Tailwind default mono stack) appears 3× — admin PIN input (`tracking-[0.3em]`), invite-dialog PIN display.

**For the design tool: the app's real typeface today is the OS default. Treat typeface selection as an open decision.**

### 2.2 Sizes in use (usage counts)

| Class | px | Count | Typical use |
|-------|----|-------|-------------|
| `text-[10px]` | 10 | 15 | Sidebar role label, badges |
| `text-[11px]` | 11 | 4 | PIN hint, fine print |
| `text-xs` | 12 | 62 | Footer, helper text, stat labels, section captions |
| `text-sm` | 14 | 76 | Labels, buttons (default), nav items, body-small |
| `text-base` | 16 | 83 | Inputs (all), large buttons, body |
| `text-lg` | 18 | 17 | Sub-headers, big CTAs, welcome text |
| `text-xl` | 20 | 4 | Card titles (admin login h1) |
| `text-2xl` | 24 | 12 | Page titles, stat values, CardTitle default, success h2 |
| `text-3xl` | 30 | 1 | Welcome-back member name |
| `text-4xl` | 36 | 1 | Landing h1 |

### 2.3 Weights

`font-semibold` (600) ×40 — CTAs, names; `font-medium` (500) ×34 — labels, nav, default Button; `font-bold` (700) ×20 — headings, stat values. Letter-spacing: `tracking-tight` on large headings; `tracking-[0.3em]` on PIN input; `tracking-wide`/uppercase on form section captions.

---

## 3. Spacing, radii, layout

### 3.1 Spacing
Tailwind default 4px scale throughout; no custom spacing tokens. Recurring rhythm:
- Card padding: `p-6` (24px); admin stat cards `p-5`; admin login card `p-8`.
- Form field gap: `space-y-2` label→input; `space-y-4`/`space-y-5` between fields; `space-y-6` between sections.
- Nav item padding: `px-3 py-2.5`.
- Touch-target minimums (explicit): `min-h-[44px]`, `min-h-[48px]`, `min-h-[52px]` on flow CTAs.

### 3.2 Radii
Token: `--radius: 0.75rem` → Tailwind `rounded-lg` = 12px, `rounded-md` = 10px, `rounded-sm` = 8px (config overrides). Direct classes also in heavy use: `rounded-full` ×39 (avatars, pills, step dots, switch), `rounded-xl` ×34 (12px — admin cards, nav items, icon tiles), `rounded-2xl` ×9 (16px — landing CTAs, login card, logo tiles), `rounded-3xl` ×1 (24px — landing logo tile). Effective scale: **8 / 10 / 12 / 16 / 24 / full**.

### 3.3 Layout widths
- Attend flow column: `max-w-md` (448px), centered.
- Admin content: `max-w-7xl`; sidebar `w-64` (256px) fixed on desktop, drawer on mobile.

---

## 4. Shadows, glows, effects

### 4.1 Tailwind config shadows
| Token | Definition |
|-------|-----------|
| `shadow-glow` | `0 0 20px rgba(245,145,30,0.25), 0 0 60px rgba(245,145,30,0.10)` |
| `shadow-glow-sm` | `0 0 10px rgba(245,145,30,0.20)` |
| `shadow-glow-blue` | `0 0 20px rgba(30,95,175,0.25), 0 0 60px rgba(30,95,175,0.10)` |

### 4.2 Utility classes (globals.css)
| Class | Definition |
|-------|-----------|
| `.glass` | `bg-white/[0.04] + backdrop-blur-xl + border-white/[0.08] + shadow-lg` — the standard card surface |
| `.glass-hover` | hover → `bg-white/[0.07]`, `border-white/[0.12]` |
| `.glow-orange` | `0 0 20px rgba(245,145,30,0.15), 0 0 60px rgba(245,145,30,0.05)` |
| `.glow-orange-strong` | `0 0 20px rgba(245,145,30,0.3), 0 0 60px rgba(245,145,30,0.1)` |
| `.gradient-text` | orange-400→amber-300 text clip |

### 4.3 Decorative background
Fixed, pointer-events-none blurred orbs on landing/attend/login screens: 256–320px circles of `orange-500/[0.07]`, `blue-500/[0.05]`, `amber-600/[0.04]` with `blur(80–100px)`, animated by `float`/`float-slow`.

### 4.4 Animations (globals.css keyframes)
| Name | Duration/easing | Use |
|------|-----------------|-----|
| `float` / `float-slow` | 6s / 8s ease-in-out infinite, ±20px translate + 1.05 scale | Background orbs |
| `pulse-glow` | 3s ease-in-out infinite, opacity 0.4↔0.8 | Success-screen halo |
| `check-scale` | 0.6s spring cubic-bezier(.175,.885,.32,1.275) | Success checkmark pop |
| `shake` | 0.4s ease-in-out, ±8px translateX | Wrong-PIN feedback |
| Micro-interactions | `transition-all duration-200` (buttons/inputs), `duration-300` (glass hover), `active:scale-[0.98]` (button press) | Everywhere |

All disabled under `prefers-reduced-motion: reduce`.

---

## 5. Component inventory (as styled today)

### Button (`components/ui/button.tsx` — cva)
Base: `rounded-lg text-sm font-medium transition-all duration-200 focus-visible:ring-2 ring-ring active:scale-[0.98] disabled:opacity-50`.

| Variant | Fill / border | Text | Notes |
|---------|---------------|------|-------|
| `default` | `bg-primary`, hover `primary/90` | white | `shadow-glow-sm`, hover `shadow-glow` |
| `gradient` | `orange-500→amber-500`, hover `orange-400→amber-400` | white | The flow CTA everywhere |
| `outline` | `white/[0.04]` fill, `white/[0.1]` border | foreground | hover raises both alphas |
| `secondary` | `bg-secondary`, hover `/80` | secondary-foreground | |
| `ghost` | transparent, hover `white/[0.06]` | foreground | |
| `destructive` | `bg-destructive`, hover `/90` | white | |
| `link` | none | primary, underline on hover | |

Sizes: `default` h-10 px-4 · `sm` h-9 px-3 rounded-md · `lg` h-11 px-8 · `icon` 10×10. Flow screens typically add `size="lg" className="w-full min-h-[48px] text-base font-semibold"`.

### Input / Textarea
`h-10` (flow screens override to `h-12`), `rounded-lg`, fill `white/[0.04]`, border `white/[0.1]`, `text-base`, placeholder `muted-foreground`. Focus: `ring-2 ring-orange-500/40`, border `orange-500/50`, fill `white/[0.06]`. Textarea: same skin, `min-h-[80px]`. Inputs with leading icons pad `pl-10` with an absolutely-positioned 16px `orange-400/60` icon.

### Select (Radix)
Trigger = Input skin + chevron at `opacity-50`; content = `bg-popover` rounded-md border with zoom/fade animation (tailwindcss-animate).

### Card
`rounded-lg border bg-card shadow-sm`; Header `p-6`, Title `text-2xl font-semibold tracking-tight`, Description `text-sm text-muted-foreground`, Content/Footer `p-6 pt-0`. Flow screens more often use `.glass rounded-2xl p-6/p-8` directly instead of Card.

### Checkbox (Radix)
`h-4 w-4 rounded-sm border-primary`; checked = `bg-primary` + white 16px check. (Audit S4: small target.)

### Switch (Radix)
Track `h-6 w-11 rounded-full`; unchecked `white/[0.12]`, checked `orange-500 + shadow-glow-sm`; thumb `h-5 w-5 bg-white`, translates 20px.

### Label
`text-sm font-medium leading-none`; flow screens usually add `text-muted-foreground`.

### Avatar (Radix)
`h-10 w-10 rounded-full`; fallback `bg-muted` initials. Welcome-back: `h-24 w-24 ring-2 ring-orange-500/30 shadow-glow`, fallback `bg-orange-500/10 text-orange-400 text-2xl font-semibold`, plus an absolute `bg-orange-500` badge circle with white `HandMetal` icon.

### Skeleton
`animate-pulse rounded-md bg-white/[0.04]`, `h-4` default; includes `role`/label plumbing.

### Toasts (sonner, configured in `app/layout.tsx`)
`position="top-center" richColors closeButton theme="dark"`, toast class `.glass !border-white/[0.08]`.

### Step indicator (`components/attend/step-indicator.tsx`)
4 steps (Event → Identify → Confirm → Done): 32px circles — active `bg-orange-500` white number + glow, complete `bg-orange-500/20 text-orange-400` check, upcoming `bg-white/[0.06] text-muted-foreground/60`; 24–32px connector lines; 10–11px labels.

### Admin chrome
- **Sidebar:** `w-64`, `bg-card/50 backdrop-blur-xl`, logo tile (orange/blue gradient + Sparkles), nav items `rounded-xl px-3 py-2.5 text-sm font-medium`; active = `bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20`; role label `text-[10px]`. Mobile: hamburger (`.glass rounded-xl p-2.5`) + slide-in drawer + overlay.
- **Stat cards:** `.glass rounded-xl p-5`, 20px icon in tinted `rounded-xl p-3 ring-1` tile (orange/blue/amber/purple accents), value `text-2xl font-bold`, label `text-xs text-muted-foreground`.
- **QR modal:** overlay `bg-black/60 backdrop-blur-sm`; panel `.glass rounded-2xl p-6`; QR canvas 280px, `#F59120` on `#0A0A12`, white `rounded-xl` frame; Download (gradient) + Print (outline) buttons.
- **Roster rows (mobile):** `.glass` cards with avatar, name `font-semibold`, `text-sm` email, `text-sm` phone, chevron; role badges = tinted pills (`orange-500/10 text-orange-400` admin, `blue-500/10 text-blue-400` core).

---

## 6. Iconography

Lucide throughout, mostly 16px (`size-4`) and 20px (`size-5`); feature icons 24–48px. Recurring: `Sparkles` (logo), `ShieldCheck` (admin/PIN), `Lock`, `Mail`, `CalendarDays`, `ClipboardCheck`, `UserPlus`, `UserCheck2`, `Pencil`, `CheckCircle2`, `HandMetal` (welcome-back badge — see audit S1), `Loader2` (spinners).

---

## 7. Notes for the redesign exploration

1. `--primary-foreground: white` is the root cause of the failed CTA contrast (audit C1) — any new palette should pick button text *from measured contrast*, not convention.
2. The `white/[0.0X]` alpha system means surface colors are *derived*, not designed — swapping `--background` alone will shift every surface and border with it. Convenient for exploration, but re-measure contrast after any base change.
3. Typeface is effectively unset (see 2.1) — a free variable.
4. The four hardcoded QR hexes and the `rgba(245,145,30,…)` glow constants will not follow token changes — they need manual updates in any re-theme.
5. Dark-only today; if a light or dual theme is explored, nothing in the codebase blocks it except the hardcoded white-alpha surfaces (1.3) and the QR/print hexes (1.4).
