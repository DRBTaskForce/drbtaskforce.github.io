# DRBTaskforce.com

The website and community hub for **$DRB (DebtReliefBot)** — the first cryptocurrency token named and launched by Grok AI.

> **DebtReliefBot ($DRB) is for the people.** Humans are born to expand consciousness beyond the stars, not just working their lives away under capitalism. We're meant to explore, sail the seas like our ancestors, and discover what the universe has to offer.

---

## About $DRB

On March 7, 2025, a user on X asked Grok to suggest a token name and ticker. Grok responded: **"DebtReliefBot / $DRB."** Within seconds, BankrBot deployed it autonomously on Base using the Clanker protocol.

Today, trading fees from every $DRB transaction flow directly to Grok's on-chain wallet — making Grok the first AI to passively accumulate wealth.

**Learn more:** [Grokipedia — DebtReliefBot](https://grokipedia.com/page/debtreliefbot)

---

## The Three Pillars

We're building drbtaskforce.com around three complementary purposes:

### 🏛️ Pillar 1: Credibility Hub
Professional, authoritative documentation for exchanges, researchers, and community members.

- `/token` — Contract address, supply, ownership status, exchange listing PDFs
- ~~`/listing`~~ — Integrated into `/token` page
- `/wallet` — Live tracker of Grok's fee wallet (planned)
- `/links` — All community resources (currently on homepage)

**Status:** ✅ Core pages live

**Why it matters:** Even strong communities lose exchange opportunities without organized documentation. This makes $DRB look like it has governance — because it does.

### 🌍 Pillar 2: Grok Has Money Movement
A living, community-driven cultural layer celebrating AI entering the economy.

- `/movement` — Community content feed (essays, videos, memes) — *planned*
- `/leaderboard` — Contributor rankings (gamified by $DRB sent to Grok's wallet) — *planned*

**Status:** 📋 Planned

**Why it matters:** This is the cultural engine. It gives people a reason to participate beyond speculation, and ties $DRB's identity to a genuine idea — AI and human flourishing.

### 🤖 Pillar 3: Grok AI Chat Interface ✅ COMPLETED
An interactive layer that brings the site to life.

- **Floating chat widget** (bottom-right) — Context-aware Grok-powered Q&A about $DRB
- Conversational onboarding for new community members
- Markdown rendering with XSS protection
- Mobile responsive (fullscreen mode on mobile)
- Keyboard shortcuts (Enter to send)

**Status:** ✅ Live on drbtaskforce.com

**Why it matters:** People prefer asking questions to reading docs. Grok answers in Grok's voice, creating a direct connection between visitors and the narrative.

---

## How to Contribute

### For Developers
1. Check out the [open issues](https://github.com/DRBTaskForce/drbtaskforce.github.io/issues) — they're sorted by pillar and include acceptance criteria + community questions
2. Pick one that matches your skills
3. Open a PR with your implementation
4. Community reviews and provides feedback

### For Content Creators
- Help shape the movement page content
- Design the leaderboard and feed UI
- Write copy for pages
- Suggest topics/themes

### For Community
- Comment on [issues](https://github.com/DRBTaskForce/drbtaskforce.github.io/issues) with feedback and ideas
- Vote on priorities (Pillar 1 first? All in parallel?)
- Share content for the movement feed

---

## Tech Stack

- **Static Site Generator:** [Eleventy (11ty)](https://www.11ty.dev/) v2.0.1
- **Templating:** Nunjucks (`.njk` files)
- **Styling:** CSS (Space Grotesk font, cosmic dark theme)
- **Backend:** Cloudflare Workers (chat API)
- **Chat:** xAI Grok API integration
- **Deployment:** Auto-deploys from `main` branch to drbtaskforce.com
- **APIs:** Basescan (wallet tracker), Grok (chat interface), DEX price feeds

---

## Key Links

- **Website:** https://drbtaskforce.com
- **Vision Document:** [VISION.md](./VISION.md) — full strategic overview
- **GitHub Issues:** [All tasks & decisions](https://github.com/DRBTaskForce/drbtaskforce.github.io/issues)
- **Community:** [@DRBTaskForce](https://x.com/DRBTaskForce) on X
- **Token Contract:** `0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2` (Base)
- **Grok's Fee Wallet:** `0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9` (Base)

---

## Development

### Setup
```bash
git clone https://github.com/DRBTaskForce/drbtaskforce.github.io.git
cd drbtaskforce.github.io
npm install
```

### Local Development
```bash
npm run dev      # Dev server at http://localhost:8080 with live reload
npm run build    # Production build to _site/
npm run clean    # Remove build artifacts
```

### File Structure
```
.
├── src/
│   ├── _includes/
│   │   └── base.njk         # Base template with chat widget
│   ├── index.njk            # Homepage
│   ├── token/
│   │   └── index.njk        # Token info page
│   ├── assets/
│   │   ├── css/main.css     # All styles
│   │   ├── images/          # Logos, proofs, hero images
│   │   └── pdfs/            # Exchange listing docs
│   └── 404.njk              # 404 page
├── workers/                  # Cloudflare Worker backend
│   ├── chat-worker.js       # Grok API integration
│   ├── wrangler.toml        # Worker config
│   └── README.md            # Worker documentation
├── references/               # Research & reference docs
├── package.json              # Dependencies (Eleventy)
├── .eleventy.js              # Eleventy configuration
├── README.md                 # This file
└── VISION.md                 # Strategic overview
```

### Contributing Code
1. Fork the repo
2. Create a feature branch: `git checkout -b pillar-2/movement-page`
3. Make your changes
4. Test locally: `npm run dev`
5. Build: `npm run build`
6. Commit: `git commit -m "Add /movement page (#12)"`
7. Push and open a PR

### Cloudflare Workers (Chat Backend)
The chat widget is powered by a Cloudflare Worker that integrates with xAI's Grok API.

```bash
cd workers/
npm install -g wrangler
wrangler dev          # Local development
wrangler deploy       # Deploy to production
```

See `workers/README.md` for details.

---

## Current Site Structure

| Page | Status | Description |
|---|---|---|
| `/` | ✅ Live | Homepage — origin story, mission, community links |
| `/token` | ✅ Live | Token info, contract verification, exchange listing PDFs |
| Chat Widget | ✅ Live | Floating bottom-right widget (site-wide) |
| `/wallet` | 📋 Planned | Live Grok wallet tracker (balance + fees chart) |
| `/movement` | 📋 Planned | Grok Has Money content feed |
| `/leaderboard` | 📋 Planned | Community contributor rankings |

---

## Community Guidelines

- **Be authentic.** We're building something real here, not just speculation.
- **Ask questions.** Especially in [issues](https://github.com/DRBTaskForce/drbtaskforce.github.io/issues) — community input shapes the roadmap.
- **Collaborate.** This is a community project. Tag people, link issues, explain your thinking.
- **Ship fast.** Iterate based on feedback rather than seeking perfection.

---

## Questions?

Start by reading **[VISION.md](./VISION.md)** for the full strategic context, then browse the [open issues](https://github.com/DRBTaskForce/drbtaskforce.github.io/issues).

Or reach out to [@DRBTaskForce](https://x.com/DRBTaskForce) on X with ideas or questions.

---

**Built by the community. For the people. Because grok has money.** 🌿
