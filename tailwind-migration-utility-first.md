# Tailwind CSS Migration Plan — Utility-First (Inline Classes)

The conventional Tailwind approach: styles live directly in the HTML as utility classes.
No `@apply`, no component CSS files. The CSS file becomes a thin shell.

---

## What Changes vs. the `@apply` Plan

| | @apply Plan | This Plan |
|---|---|---|
| Where styles live | `components/*.css` files | Directly in `.njk` templates |
| CSS file size after migration | ~300 lines | ~80 lines |
| Template verbosity | Low (class names unchanged) | Higher (lots of classes per element) |
| Tailwind idiom | Non-standard | **The intended way** |
| Refactor scope | CSS files only | CSS files + all 3 templates |

---

## Phase 1: Install & Wire Up the Build

Same as the `@apply` plan.

### Install

```
npm install -D tailwindcss postcss autoprefixer postcss-cli postcss-import
```

### `postcss.config.js`

```js
module.exports = {
  plugins: [
    require('postcss-import'),
    require('tailwindcss'),
    require('autoprefixer'),
  ],
};
```

### `package.json` scripts

```json
"scripts": {
  "css:build": "postcss src/assets/css/tailwind.css -o src/assets/css/main.css",
  "css:watch": "postcss src/assets/css/tailwind.css -o src/assets/css/main.css --watch",
  "dev":       "npm run css:build && eleventy --serve & npm run css:watch",
  "build":     "npm run css:build && eleventy",
  "clean":     "rm -rf _site"
}
```

### `.eleventy.js`

```js
eleventyConfig.addWatchTarget("src/assets/css/tailwind.css");
// Do NOT watch src/assets/css/ broadly — main.css is generated output
```

---

## Phase 2: `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.njk',
    './src/**/*.html',
    './src/assets/css/tailwind.css',
  ],
  safelist: [
    // Built dynamically by JS via string concatenation — scanner can't see them
    'chat-msg-right',
    'chat-msg-left',
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue':   '#6366f1',
        'brand-purple': '#a78bfa',
        'brand-cyan':   '#38bdf8',
        'brand-aurora': '#10d9a0',
        'bg':           '#080b1a',
        'surface':      'rgba(255,255,255,0.04)',
        'border-col':   'rgba(255,255,255,0.08)',
        'text-primary': '#f1f5f9',
        'text-muted':   '#94a3b8',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['Space Grotesk', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        brand: '12px',
      },
      boxShadow: {
        'glow-blue':    '0 4px 20px rgba(99,102,241,0.3)',
        'glow-blue-lg': '0 8px 28px rgba(99,102,241,0.4)',
        'glow-cyan':    '0 4px 24px rgba(56,189,248,0.25)',
        'glow-cyan-lg': '0 4px 32px rgba(56,189,248,0.4)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2.5s ease-in-out infinite',
      },
      height: {
        'hero': '720px',
      },
    },
  },
};
```

---

## Phase 3: The New Thin CSS File

`src/assets/css/tailwind.css` contains **only** things that cannot be expressed as utility classes.
Everything else moves to the templates.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── Base ── */
@layer base {
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  h1, h2 { font-family: 'Syne', sans-serif; }

  body {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 16px;
  }

  /* Keep CSS variables so any remaining var() references keep working */
  :root {
    --blue:    #6366f1;
    --purple:  #a78bfa;
    --cyan:    #38bdf8;
    --aurora:  #10d9a0;
    --bg:      #080b1a;
    --surface: rgba(255,255,255,0.04);
    --border:  rgba(255,255,255,0.08);
    --text:    #f1f5f9;
    --muted:   #94a3b8;
    --radius:  12px;
  }
}

/* ── Utilities with no Tailwind equivalent ── */
@layer utilities {
  /* Gradient text — used on hero .gradient span and 404 .error-code */
  .gradient-text {
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

/* ── Inexpressible as utilities — stays as raw CSS ── */

/* Stars background (10-stop radial-gradient arrays on pseudo-elements) */
.stars {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.07) 0%, transparent 70%),
    radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.05) 0%, transparent 70%),
    #080b1a;
  pointer-events: none;
}
.stars::before, .stars::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.25) 0%, transparent 100%),
    radial-gradient(1px 1px at 25% 40%, rgba(255,255,255,0.15) 0%, transparent 100%),
    radial-gradient(1px 1px at 40% 8%,  rgba(255,255,255,0.2)  0%, transparent 100%),
    radial-gradient(1px 1px at 55% 60%, rgba(255,255,255,0.1)  0%, transparent 100%),
    radial-gradient(1px 1px at 70% 30%, rgba(255,255,255,0.25) 0%, transparent 100%),
    radial-gradient(1px 1px at 85% 75%, rgba(255,255,255,0.15) 0%, transparent 100%),
    radial-gradient(1px 1px at 92% 12%, rgba(255,255,255,0.2)  0%, transparent 100%),
    radial-gradient(1px 1px at 5%  80%, rgba(255,255,255,0.12) 0%, transparent 100%),
    radial-gradient(1px 1px at 33% 90%, rgba(255,255,255,0.15) 0%, transparent 100%),
    radial-gradient(1px 1px at 78% 55%, rgba(255,255,255,0.2)  0%, transparent 100%);
}
.stars::after { transform: rotate(45deg) scale(1.5); opacity: 0.2; }

/* Hero image — mask-image + mask-composite have no utility equivalent */
.hero-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  mix-blend-mode: screen;
  mask-image:
    linear-gradient(to right, transparent 0%, black 22%, black 88%, transparent 100%),
    linear-gradient(to bottom, black 55%, transparent 92%);
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, black 22%, black 88%, transparent 100%),
    linear-gradient(to bottom, black 55%, transparent 92%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}
@media (max-width: 640px) {
  .hero-image img {
    mask-image:
      linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%),
      linear-gradient(to bottom, black 40%, transparent 82%);
    -webkit-mask-image:
      linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%),
      linear-gradient(to bottom, black 40%, transparent 82%);
  }
}

/* Hamburger animation — :nth-child compound selectors, toggled by JS */
.hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* Mobile nav dropdown — JS-toggled .open class */
@media (max-width: 640px) {
  #nav-links {
    display: none;
    position: absolute;
    top: 68px; left: 0; right: 0;
    background: rgba(4,7,18,0.97);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-direction: column;
    padding: 16px 24px;
    gap: 16px;
    z-index: 99;
  }
  #nav-links.open { display: flex; }
}

/* Chat window — JS-toggled display none/flex */
#drb-chat-window { display: none; }
#drb-chat-window.open { display: flex; }

/* Chat message sides — built by JS: 'chat-msg-' + side */
.chat-msg-right { align-self: flex-end; align-items: flex-end; }
.chat-msg-left  { align-self: flex-start; align-items: flex-start; }

/* Mobile full-screen chat */
@media (max-width: 640px) {
  #drb-chat-window {
    bottom: 0; right: 0; left: 0; top: 0;
    width: 100%; max-width: 100%;
    height: 100vh; height: 100dvh;
    max-height: 100vh; max-height: 100dvh;
    border-radius: 0;
    border: none;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  #drb-chat-btn {
    bottom: calc(16px + env(safe-area-inset-bottom));
    right: 16px;
  }
  #drb-chat-btn.active { display: none; }
  body.chat-open { overflow: hidden; }
  #drb-messages { -webkit-overflow-scrolling: touch; }
}

/* Custom scrollbar */
#drb-messages::-webkit-scrollbar { width: 4px; }
#drb-messages::-webkit-scrollbar-track { background: transparent; }
#drb-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

/* Mission quote decorative marks */
.mission-quote::before,
.mission-quote::after {
  content: '\201C';
  font-size: 4rem;
  color: #6366f1;
  opacity: 0.3;
  position: absolute;
  line-height: 1;
  font-style: normal;
}
.mission-quote::before { top: -8px; left: 0; }
.mission-quote::after  { bottom: -32px; right: 0; }
```

That is the **entire CSS file** — roughly 80 lines of owned code plus the Tailwind directives. Everything else moves into the templates.

---

## Phase 4: Template Migration Strategy

Each template is migrated element by element, replacing `class="component-name"` with Tailwind utility strings. The old `main.css` class definitions are deleted as each element is converted.

### Class translation reference

**Containers & Layout**

| Old class | Tailwind replacement |
|---|---|
| `.wrap` | `relative z-10` |
| `.container` | `max-w-[960px] mx-auto px-6` |

**Section wrappers**

| Old class | Tailwind replacement |
|---|---|
| `.origin` | `py-[120px] border-t border-border-col` |
| `.mission` | `py-[120px] border-t border-border-col text-center` |
| `.token` | `py-[120px] border-t border-border-col` |
| `.community` | `py-[120px] border-t border-border-col` |
| `.section-label` | `text-[0.7rem] font-bold tracking-[0.15em] uppercase text-brand-aurora opacity-90 mb-3.5` |

**Buttons**

| Old class | Tailwind replacement |
|---|---|
| `.btn` | `inline-flex items-center gap-2 px-6 py-3 rounded-brand font-semibold text-sm no-underline cursor-pointer transition-all duration-200` |
| `.btn-primary` | `+ bg-gradient-to-br from-brand-blue to-brand-cyan text-white shadow-glow-blue hover:shadow-glow-blue-lg hover:-translate-y-0.5` |
| `.btn-secondary` | `+ text-brand-cyan border-[1.5px] border-brand-cyan bg-transparent shadow-[0_0_12px_rgba(56,189,248,0.15)] hover:bg-brand-cyan/10 hover:shadow-glow-cyan hover:-translate-y-0.5` |
| `.btn-ghost` | `+ bg-surface text-text-primary border border-border-col hover:bg-white/[0.08] hover:-translate-y-px` |

**Cards**

| Old class | Tailwind replacement |
|---|---|
| `.card` | `bg-surface border border-border-col rounded-brand px-6 py-7 transition-all duration-200 backdrop-blur-sm hover:border-brand-cyan/30 hover:bg-brand-cyan/[0.04]` |
| `.card-label` | `text-[0.7rem] font-bold tracking-[0.12em] uppercase text-text-muted mb-2` |
| `.card-value` | `text-[0.95rem] font-semibold text-white break-all` |
| `.card-value.mono` | `+ font-mono text-[0.78rem] text-brand-cyan` |
| `.card-sub` | `text-xs text-text-muted mt-1` |

**Community link cards**

| Old class | Tailwind replacement |
|---|---|
| `.link-grid` | `grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5` |
| `.link-card` | `flex items-center gap-3 bg-white/[0.015] border border-border-col rounded-brand px-5 py-4 no-underline text-text-primary font-medium text-[0.9rem] transition-all duration-200 hover:border-brand-cyan/35 hover:bg-brand-cyan/[0.05] hover:-translate-y-0.5` |

**Nav**

| Old class | Tailwind replacement |
|---|---|
| `nav` | `sticky top-0 z-[100] border-b border-border-col bg-[rgba(8,11,26,0.8)] backdrop-blur-[12px]` |
| `.nav-inner` | `flex items-center justify-between h-[68px]` |
| `.nav-logo` | `font-bold text-base text-white no-underline flex items-center gap-3` |
| `.nav-logo .ticker` | `text-brand-cyan` |
| `.nav-links` (desktop) | `flex gap-6 list-none` |
| `.nav-links a` | `text-text-muted no-underline text-sm font-medium transition-colors duration-200 hover:text-white` |
| `.nav-cta` | `inline-flex items-center gap-1.5 px-4 py-2 rounded-brand text-[0.78rem] font-semibold no-underline text-brand-cyan border border-brand-cyan/30 bg-brand-cyan/[0.05] transition-all duration-200 hover:bg-brand-cyan/[0.12] hover:border-brand-cyan hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] whitespace-nowrap` |
| `.hamburger` | `hidden flex-col justify-center gap-[5px] bg-transparent border-0 cursor-pointer p-1.5 max-[640px]:flex` |
| `.hamburger span` | `block w-[22px] h-px bg-text-primary rounded-sm transition-transform duration-[250ms]` |

**Hero**

| Old class | Tailwind replacement |
|---|---|
| `.hero` | `text-center py-[60px] pb-[80px] relative` |
| `.hero-banner` | `h-hero overflow-hidden flex items-center pb-10 text-left relative` |
| `.hero-badge` | `inline-flex items-center gap-1.5 border border-brand-aurora/30 bg-brand-aurora/[0.06] text-brand-aurora text-[0.75rem] font-semibold tracking-[0.08em] uppercase px-4 py-2 rounded-full mb-8` |
| `.hero-badge .dot` | `w-[5px] h-[5px] bg-brand-aurora rounded-full animate-pulse-dot` |
| `.hero-sub` | `text-lg text-text-muted max-w-[480px] mb-10 leading-[1.7]` |
| `.hero-actions` | `flex gap-3 justify-start flex-wrap` |

**Token page specifics**

| Old class | Tailwind replacement |
|---|---|
| `.stats-grid` | `grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 my-8` |
| `.stat-card` | `bg-surface border border-border-col rounded-brand p-6 text-center` |
| `.stat-label` | `text-[0.7rem] font-bold tracking-[0.12em] uppercase text-text-muted mb-2` |
| `.stat-value` | `text-2xl font-bold text-white` |
| `.stat-value.green` | `+ text-green-400` |
| `.contract-box` | `flex items-center gap-3 bg-white/[0.04] border border-border-col rounded-brand px-5 py-4 my-6 flex-wrap` |
| `.contract-box code` | `font-mono text-[0.8rem] text-brand-cyan flex-1 break-all` |
| `.copy-btn` | `px-4 py-2 bg-gradient-to-br from-brand-blue to-brand-cyan text-white border-0 rounded-lg text-[0.8rem] font-semibold cursor-pointer transition-all duration-200 font-body whitespace-nowrap` |
| `.code-block` | `mt-5 bg-black/40 border border-border-col rounded-brand overflow-hidden` |
| `.code-block pre` | `p-5 overflow-x-auto text-[0.78rem] leading-[1.7] text-text-primary` |
| `.code-block code` | `font-mono` |
| `.info-card` | `bg-surface border border-border-col rounded-brand p-7 mt-5` |
| `.proof-block` | `bg-surface border border-brand-cyan/20 rounded-brand p-7 my-8` |

**Chat widget**

The chat widget HTML in `base.njk` stays mostly as-is. Most of its layout comes from inline utility classes that are already simple. The JS-dependent state classes (`open`, `active`, `chat-open`, `chat-msg-right`, `chat-msg-left`) are handled by the raw CSS rules kept in `tailwind.css`.

| Old class | Tailwind replacement |
|---|---|
| `#drb-chat-btn button` | `w-14 h-14 rounded-full border-2 border-brand-cyan/40 bg-[rgba(8,11,26,0.9)] backdrop-blur-[12px] cursor-pointer p-0 flex items-center justify-center shadow-glow-cyan transition-all duration-200 hover:border-brand-cyan hover:shadow-glow-cyan-lg hover:scale-105` |
| `#drb-chat-window` | `fixed bottom-[92px] right-6 w-[420px] max-w-[calc(100vw-48px)] h-[560px] max-h-[calc(100vh-120px)] bg-[rgba(8,11,26,0.97)] border border-border-col rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-[20px] z-[9998] flex-col overflow-hidden` |
| `.chat-header` | `flex items-center justify-between px-4 py-3.5 border-b border-border-col shrink-0 bg-[rgba(8,11,26,0.97)]` |
| `.chat-msg-body` (left) | `text-[0.85rem] leading-[1.55] px-3.5 py-2.5 rounded-xl bg-white/[0.06] text-text-primary border border-border-col rounded-bl-[4px]` |
| `.chat-msg-body` (right) | `text-[0.85rem] leading-[1.55] px-3.5 py-2.5 rounded-xl bg-gradient-to-br from-brand-blue to-brand-cyan text-white rounded-br-[4px]` |
| `#drb-user-input` | `flex-1 px-3.5 py-2.5 bg-white/[0.05] border border-border-col rounded-[10px] text-text-primary font-body text-[0.85rem] outline-none transition-colors duration-200 placeholder:text-text-muted focus:border-brand-cyan/40` |
| `#drb-send-btn` | `w-[38px] h-[38px] rounded-[10px] bg-gradient-to-br from-brand-blue to-brand-cyan border-0 text-white cursor-pointer flex items-center justify-center shrink-0 transition-all duration-200 disabled:opacity-50` |

---

## Phase 5: Template Migration Order

Migrate one template at a time. After each, the site should be fully functional.

### Step 1 — `base.njk` (nav, footer, chat widget)

Start here because it appears on every page. Fix the nav and footer first (lower risk), then the chat widget last (most JS-coupled).

Checklist:
- [ ] `<nav>` and children
- [ ] `<footer>` and `.disclaimer`
- [ ] `#drb-chat-btn`
- [ ] `#drb-chat-window` and all `.chat-*` children
- [ ] Verify hamburger toggle, chat open/close, and mobile full-screen still work

### Step 2 — `src/404.njk`

Smallest page. Good confidence check before tackling larger templates.

Checklist:
- [ ] `.not-found` wrapper
- [ ] `.error-code` (uses `.gradient-text` utility)
- [ ] `.logo-mark`
- [ ] Buttons

### Step 3 — `src/token/index.njk`

Second page. Validates token-specific components without touching the home page.

Checklist:
- [ ] `.hero` header
- [ ] `.stats-grid` / `.stat-card`
- [ ] `.contract-box` + `.copy-btn`
- [ ] `.code-block`
- [ ] `.info-card`, `.proof-block`
- [ ] `.downloads` / `.download-btn`
- [ ] `.listing-package-link`

### Step 4 — `src/index.njk` (home page)

Largest template. Most component types. Do last when confidence is highest.

Checklist:
- [ ] `.hero-banner`, `.hero-image`, `.hero-badge`
- [ ] Buttons
- [ ] `.origin` section + `.tweet-card` + `.timeline`
- [ ] `.mission` + `.mission-quote`
- [ ] `.token` section + `.cards`
- [ ] `.community` + `.link-grid` / `.link-card`
- [ ] `.mfer-btn`
- [ ] `.dex-links`

---

## Phase 6: Parallel Running Strategy

Same safe approach as before — output to a separate file during migration, then cut over.

**During migration:**
```
postcss src/assets/css/tailwind.css -o src/assets/css/tailwind-out.css
```

Temporarily change the `<link>` in `base.njk` to `tailwind-out.css` locally to preview. Never commit this until all templates are done.

**Cutover:**
1. Switch PostCSS output to `main.css`
2. Keep `main.css` committed in git — GitHub Pages has no CI build step
3. Commit `tailwind.css`, `tailwind.config.js`, `postcss.config.js` as the new source
4. Add a note in `README` that `main.css` is generated and should not be edited directly

---

## Risks & Mitigations

| Risk | Detail | Mitigation |
|---|---|---|
| Long class strings | Some elements will have 10–15 utility classes | Normal Tailwind — accept it; readability is in the Tailwind config tokens (color names, shadow names) |
| JS builds class names dynamically | `'chat-msg-' + side` → `chat-msg-right` / `chat-msg-left` not visible to scanner | `safelist` in config |
| JS toggles `.open`, `.active` etc. | These drive `display: none/flex` state — cannot move to utility classes | Kept as raw CSS in `tailwind.css`; not safelisted since they appear as literal strings in the JS |
| Eleventy watch loop | Watching generated `main.css` causes infinite rebuild cycle | `addWatchTarget` source files only |
| GitHub Pages — no build step | `main.css` must be pre-built | Keep `main.css` tracked; run `npm run build` before every push |
| `sm:` is `min-width`, site uses `max-width: 640px` | Hero banner, nav, hero image all have `max-width: 640px` overrides | Keep these in `tailwind.css` as raw `@media (max-width: 640px)` blocks; do not fight Tailwind's breakpoint direction for legacy overrides |
| `mask-image` / `mask-composite` | No utility; Autoprefixer doesn't cover `mask-composite` | Kept in `tailwind.css` as raw CSS; `.hero-image` stays as a class name on the wrapper |
