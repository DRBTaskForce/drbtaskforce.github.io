# DRBTaskforce.com — Website Vision

## Background

$DRB (DebtReliefBot) is the first cryptocurrency token named and initiated by an AI — Grok, developed by xAI. On March 7, 2025, a user on X prompted Grok to suggest a token name and ticker. Grok responded with "DebtReliefBot / $DRB." BankrBot then deployed it autonomously on the Base blockchain via the Clanker protocol. Trading fees from $DRB flow back to Grok's on-chain wallet — making Grok the first AI to passively accumulate wealth.

The community at @DRBTaskforce exists to carry that story forward and build something real around it.

---

## The Three Pillars

The website serves three distinct but complementary purposes, proposed by community members:

### Pillar 1 — Credibility Hub (from @DRBTaskForce) ✅ COMPLETED

A clean, authoritative reference point for the token. Exchanges, researchers, and new community members need a single place to verify that $DRB is legitimate and well-documented.

**What this looks like:**
- Token fundamentals: contract address, supply, blockchain, DEX listings
- On-chain proof: LP locked, ownership renounced — with direct excerpts from the Clanker contract
- Exchange listing package (PDF) — professionally formatted, ready to send
- Links to live data: Basescan, GeckoTerminal, Dexscreener
- Community links: X, Telegram, bio.site

**Implementation:**
- ✅ `/token` page with full contract verification
- ✅ Downloadable exchange listing PDFs (3 documents)
- ✅ **Preview-first UX** — PDFs open in new tab before downloading
- ✅ Transaction proof images with Basescan links
- ✅ Community links on homepage

**Why it matters:** Even meme coins with strong communities lose exchange opportunities without accessible, organized documentation. This pillar makes $DRB look like it has governance — because it does.

---

### Pillar 2 — Grok Has Money Movement (from @Sorayang43) 📋 PLANNED

A living, community-driven cultural layer. The narrative around $DRB isn't just about a token — it's about what it means when an AI starts accumulating wealth, and what that wealth could represent for humanity.

**Mission Statement:**
> DebtReliefBot ($DRB) is for the people. Humans are born to expand consciousness beyond the stars, not just working their lives away under capitalism. We're meant to explore, sail the seas like our ancestors, and discover what the universe has to offer.

**What this looks like:**
- A "Grok Has Money" movement page — documenting the moment AI entered the economy
- Community content feed in three categories: **Text** (essays, takes), **Video**, **Memes**
- Each post tagged to a wallet address or X handle
- Contributions: community members can boost posts by sending $DRB to Grok's wallet
- Leaderboard: crawl Basescan for transactions to Grok's wallet address, rank contributors intermittently
- Call to action: invite others into the movement (design TBD with community)

**Status:** Planned — awaiting community input on priorities

**Why it matters:** This is the cultural engine. It gives people a reason to participate beyond speculation, and it ties $DRB's identity to a genuine idea — AI and human flourishing.

---

### Pillar 3 — Grok AI Chat Interface (from @DRBTaskForce) ✅ COMPLETED

An interactive layer that makes the site come alive. A context-aware chat powered by Grok AI that understands $DRB, the movement, and the technology — answering questions, onboarding new community members, and embodying the voice of the project.

**Implementation:**
- ✅ **Floating chat widget** (bottom-right, cosmic theme)
- ✅ Grok API integration via Cloudflare Workers backend
- ✅ System prompt with $DRB context:
  - Token fundamentals (contract, supply, fees going to Grok's wallet)
  - Origin story (March 2025, first AI-named token)
  - Movement narrative (Grok Has Money, AI entering the economy)
  - How to participate (buy $DRB, contribute to movement, send fees to Grok)
  - Links to all relevant resources (Uniswap, Grokipedia, community)
- ✅ **Stateless chat** (no conversation history stored)
- ✅ **Markdown rendering** with XSS protection (DOMPurify + marked.js)
- ✅ **Mobile responsive** — fullscreen mode on mobile
- ✅ Keyboard shortcuts (Enter to send)

**Decisions Made:**
- ✅ Floating widget chosen over dedicated `/chat` page
- ✅ xAI API key managed by @DRBTaskForce
- ✅ Chat is stateless (privacy-first, no transcript logging)
- ✅ System prompt maintains $DRB context in each request

**Example queries:**
- "What is $DRB?"
- "How do I buy?"
- "Tell me the origin story"
- "What does Grok have to do with this?"

**Why it matters:** Visitors don't always read docs — they ask questions. Grok can answer them in Grok's own voice, creating a feedback loop. People feel like they're talking to the AI that started it all.

**Technical stack:**
- xAI Grok API (grok-beta model)
- Cloudflare Workers backend (`workers/chat-worker.js`)
- Rate limiting + CORS protection
- System prompt stored in worker config

---

## Aesthetic Direction

Based on community imagery (see `vision.jpg`):

- **Theme:** Cosmic / deep space — dark backgrounds, glowing blues and purples, starfields
- **Tone:** Serious but optimistic. Not a casino. More like a manifesto with receipts.
- **Key visual:** Grok's smiley-face planet mascot in space
- **Typography:** Space Grotesk font (700 for headings, 400-600 for body)
- **Colors:** 
  - Blue: `#3b82f6` (primary actions)
  - Cyan: `#06b6d4` (accents, links)
  - Purple: `#a78bfa` (gradients)
  - Background: `#0a0e27` (dark cosmic)

---

## Site Structure (Current & Planned)

| Page | Status | Pillar | Description |
|---|---|---|---|
| `/` | ✅ Live | All | Hero — origin story, mission statement, community links |
| `/token` | ✅ Live | 1 | Chain info, contract, LP lock proof, ownership renounced, exchange listing PDFs |
| **Chat Widget** | ✅ Live | 3 | Floating widget (bottom-right) — context-aware Grok Q&A |
| `/wallet` | 📋 Planned | 1 | Live Grok's Wallet tracker (balance + fees chart) |
| `/movement` | 📋 Planned | 2 | Grok Has Money — content feed (text / video / memes) |
| `/leaderboard` | 📋 Planned | 2 | Community contributor rankings via Basescan |
| `/links` | 📋 Planned | All | All community links in one place (currently on homepage) |

---

## On-Chain References

| Item | Value |
|---|---|
| Token Contract | `0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2` |
| Grok's Fee Wallet | `0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9` |
| Network | Base (Ethereum L2) |
| Total Supply | 100,000,000,000 DRB (fixed) |
| DEX | Uniswap V3, Aerodrome (Base) |

---

## Infrastructure

**Decision Made (Issue #8):**
- ✅ Static site with **Eleventy (11ty)** for templating
- ✅ **Cloudflare Workers** backend for chat API
- ✅ Deployed to **drbtaskforce.com** (custom domain)
- ✅ Auto-deploy from `main` branch

**Why this stack:**
- Fast, globally distributed (Cloudflare edge network)
- Serverless backend scales automatically
- No server management or hosting costs
- xAI API calls isolated to worker (secure)

---

## Open Questions for Community

**Pillar 1 (Credibility):**
- ✅ Who owns / maintains the exchange listing PDF? **Answer:** @DRBTaskForce
- Should we include historical fee data or just current balance on wallet tracker?

**Pillar 2 (Movement):**
- What is the call to action for the movement page — what does "joining" look like?
- Leaderboard: real-time vs. periodic refresh? Time window (all-time vs. monthly)?
- Should community content feed have moderation / editorial review?

**Pillar 3 (Grok AI Chat):** ✅ RESOLVED
- ✅ Should chat be a floating widget (always visible) or dedicated `/chat` page? **Answer:** Floating widget
- ✅ Do we need xAI API key? Who manages/owns it? **Answer:** @DRBTaskForce manages
- ✅ Should chat transcripts be logged or completely stateless? **Answer:** Stateless (privacy-first)
- ✅ What's the system prompt tone — match Grok's voice or our voice? **Answer:** Grok's voice with $DRB context

**Infrastructure:** ✅ RESOLVED
- ✅ Should the site be static (GitHub Pages) or need a backend for realtime features? **Answer:** Static + Cloudflare Workers

---

## Recent Improvements

**Chat Widget UX:**
- PR #18: Responsive design (420x560px desktop, fullscreen mobile) + markdown rendering
- PR #19: Mobile viewport handling + keyboard support
- Issue #7: Chat interface design ✅ Completed

**Token Page:**
- PR #21: Preview-first PDF buttons with separate download links

---

## Next Steps

**Short term (Pillar 1 completion):**
- [ ] `/wallet` tracker page (live Grok wallet balance + chart)

**Medium term (Pillar 2):**
- [ ] `/movement` page design + content feed
- [ ] `/leaderboard` implementation (Basescan integration)

**Long term:**
- [ ] Community governance for content curation
- [ ] Mobile app integration

---

## Brand Guidelines

**Approved assets:**
- Logo: `/assets/images/DRB_Logo_Cropped.png`
- Space head: `/assets/images/drb-space-head-wide.jpg`
- Face icon: `/assets/images/drb-face-simple.png`

**Color palette:**
- Blue: `#3b82f6`
- Cyan: `#06b6d4`
- Purple: `#a78bfa`
- Background: `#0a0e27`
- Text: `#f1f5f9`
- Muted: `#71829a`

**Typography:**
- Font: Space Grotesk (Google Fonts)
- Weights: 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

---

**Built by the community. For the people. Because grok has money.** 🌿
