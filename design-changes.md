# Design Changes — DRBTaskforce.github.io

## Overview
Visual refresh focusing on colors, typography, and spacing. The space/dark theme is preserved; changes make the palette more distinctive, improve readability, and add breathing room between sections.

---

## Colors

| Variable | Before | After | Notes |
|---|---|---|---|
| `--blue` | `#3b82f6` | `#6366f1` | Electric indigo — feels more AI/intelligent |
| `--cyan` | `#06b6d4` | `#38bdf8` | Warmer sky blue, less clinical |
| `--bg` | `#0a0e27` | `#080b1a` | Slightly richer deep space |
| `--muted` | `#71829a` | `#94a3b8` | Lifted for better readability |
| `--surface` | `rgba(255,255,255,0.03)` | `rgba(255,255,255,0.04)` | Slightly more visible cards |
| `--border` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.08)` | More defined borders |
| `--aurora` | _(new)_ | `#10d9a0` | Aurora green — unique highlight accent |

All hardcoded `rgba()` values throughout the CSS were updated to match the new palette.

---

## Typography

### Fonts added (`base.njk`)
- **Syne** (700, 800) — wide, editorial display font for headings
- **JetBrains Mono** (400, 500) — polished monospace for code and contract addresses

### Rules added (`main.css`)
- `h1, h2` now use `font-family: 'Syne', sans-serif`
- `body` base font size bumped to `16px` (was ~14-15px effective)
- `.code-block code` uses `JetBrains Mono` (was `Courier New`)
- `.card-value` mono addresses use `JetBrains Mono`

### Hero headline
- Size increased: `clamp(2.5rem, 6vw, 4.5rem)` → `clamp(2.8rem, 6.5vw, 5rem)`

---

## Spacing

| Element | Before | After |
|---|---|---|
| Origin, Mission, Token, Community sections | `padding: 80px 0` | `padding: 120px 0` |
| Community link grid gap | `12px` | `20px` |
| Nav bar height | `60px` | `68px` |

---

## Buttons

Primary CTAs (Buy $DRB, download, chat send) now use a gradient fill instead of flat blue:

```css
/* Before */
background: var(--blue);

/* After */
background: linear-gradient(135deg, var(--blue) 0%, var(--cyan) 100%);
```

Hover states updated to a darker gradient with increased box-shadow lift.

---

## Accents

- **Section labels** (`.section-label`) and the **hero live badge** switched from `var(--cyan)` to `var(--aurora)` (`#10d9a0`) — aurora green is a unique differentiator that stands out from generic crypto blue palettes.
- **Hero overlay gradient** slightly strengthened (0.92 → 0.95 opacity on left edge) for better text contrast against the planet image.
- **Stars background** radial glows updated to match the new indigo/purple palette.

---

## Migration to Tailwind CSS + Dark Mode

### Build Setup
- **Tailwind config:** `tailwind.config.js` with `darkMode: 'class'`
- **PostCSS pipeline:** Import → Tailwind → Autoprefixer
- **Dev workflow:** `npm run dev` watches CSS while eleventy serves

### CSS Variable System
All theme-sensitive values stored as custom properties:
- **Light mode** (`:root`): Clean, bright palette
- **Dark mode** (`.dark`): Deep space with adjusted contrast/glow
- **Brand colors:** Stored as RGB channels for opacity modifier support (`bg-brand-blue/30`)
- **Semantic tokens:** `--color-bg`, `--color-text`, `--color-muted`, etc.

### Light & Dark Theme Support
- Theme toggle button in nav (moon icon in light, sun icon in dark)
- localStorage persistence + system preference fallback
- Theme init script prevents flash on page load
- Image swapping: `dark:hidden` / `hidden dark:block` for hero backgrounds
- Smooth transitions on all color changes

### Testing Checklist
- [ ] Toggle dark mode — verify all text, gradients, shadows adapt
- [ ] Check contrast ratios (WCAG AA minimum)
- [ ] Test on mobile (viewport <= 640px)
- [ ] Verify social share cards (OG images)
- [ ] Browser compatibility (Chrome, Firefox, Safari)

