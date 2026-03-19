# DRBTaskforce.com — Website Vision

## Background

$DRB (DebtReliefBot) is the first cryptocurrency token named and initiated by an AI — Grok, developed by xAI. On March 7, 2025, a user on X prompted Grok to suggest a token name and ticker. Grok responded with "DebtReliefBot / $DRB." BankrBot then deployed it autonomously on the Base blockchain via the Clanker protocol. Trading fees from $DRB flow back to Grok's on-chain wallet — making Grok the first AI to passively accumulate wealth.

The community at @DRBTaskforce exists to carry that story forward and build something real around it.

---

## The Two Pillars

The website serves two distinct but complementary purposes, proposed by community members:

### Pillar 1 — Credibility Hub (from @DRBTaskForce)

A clean, authoritative reference point for the token. Exchanges, researchers, and new community members need a single place to verify that $DRB is legitimate and well-documented.

**What this looks like:**
- Token fundamentals: contract address, supply, blockchain, DEX listings
- On-chain proof: LP locked, ownership renounced — with direct excerpts from the Clanker contract
- Downloadable exchange listing package (PDF) — professionally formatted, ready to send
- Links to live data: Basescan, GeckoTerminal, Dexscreener, CoinGecko
- Community links: X, Telegram, Reddit, bio.site

**Why it matters:** Even meme coins with strong communities lose exchange opportunities without accessible, organized documentation. This pillar makes $DRB look like it has governance — because it does.

---

### Pillar 2 — Grok Has Money Movement (from @Sorayang43)

A living, community-driven cultural layer. The narrative around $DRB isn't just about a token — it's about what it means when an AI starts accumulating wealth, and what that wealth could represent for humanity.

**Mission Statement:**
> Debt Relief Bot ($DRB) is for the people. Humans are born to expand consciousness beyond the stars, not just working their lives away under capitalism. We're meant to explore, sail the seas like our ancestors, and discover what the universe has to offer.

**What this looks like:**
- A "Grok Has Money" movement page — documenting the moment AI entered the economy
- Community content feed in three categories: **Text** (essays, takes), **Video**, **Memes**
- Each post tagged to a wallet address or X handle
- Contributions: community members can boost posts by sending $DRB to Grok's wallet
- Leaderboard: crawl Basescan for transactions to Grok's wallet address, rank contributors intermittently
- Call to action: invite others into the movement (design TBD with community)

**Why it matters:** This is the cultural engine. It gives people a reason to participate beyond speculation, and it ties $DRB's identity to a genuine idea — AI and human flourishing.

---

### Pillar 3 — Grok AI Chat Interface (from @DRBTaskForce)

An interactive layer that makes the site come alive. A context-aware chat powered by Grok AI that understands $DRB, the movement, and the technology — answering questions, onboarding new community members, and embodying the voice of the project.

**What this looks like:**
- Floating chat widget (bottom-right, cosmic theme) or dedicated `/chat` page
- Grok API integration with system prompt about $DRB context:
  - Token fundamentals (contract, supply, fees going to Grok's wallet)
  - Origin story (March 2025, first AI-named token)
  - Movement narrative (Grok Has Money, AI entering the economy)
  - How to participate (buy $DRB, contribute to movement, send fees to Grok)
  - Links to all relevant resources (Uniswap, Grokipedia, community)
- Conversation history optional (can be stateless for privacy)
- Examples: "What is $DRB?", "How do I buy?", "Tell me the origin story", "What does Grok have to do with this?"

**Why it matters:** Visitors don't always read docs — they ask questions. Grok can answer them in Grok's own voice, creating a feedback loop. People feel like they're talking to the AI that started it all.

**Technical considerations:**
- xAI Grok API (requires API key from xAI)
- System prompt maintains context about $DRB (stored in site config)
- Can surface chat transcripts to movement feed if user opts in
- Lightweight: stateless API calls, no conversation database needed initially

---

## Aesthetic Direction

Based on community imagery (see `vision.jpg`):

- **Theme:** Cosmic / deep space — dark backgrounds, glowing blues and purples, starfields
- **Tone:** Serious but optimistic. Not a casino. More like a manifesto with receipts.
- **Key visual:** Grok's smiley-face planet mascot in space
- **Data UI:** Live wallet tracker — current DRB balance, total fees earned, fees over time chart (USD / DRB toggle)

---

## Key Pages (Proposed Site Structure)

| Page | Pillar | Description |
|---|---|---|
| `/` | All | Hero — origin story, mission statement, quick stats |
| `/token` | 1 | Chain info, contract, LP lock proof, ownership renounced |
| `/listing` | 1 | Downloadable exchange listing package (PDF) |
| `/wallet` | 1 | Live Grok's Wallet tracker (balance + fees chart) |
| `/movement` | 2 | Grok Has Money — content feed (text / video / memes) |
| `/leaderboard` | 2 | Community contributor rankings via Basescan |
| `/chat` | 3 | Grok AI chat interface — context-aware Q&A about $DRB |
| `/links` | All | All community links in one place |

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

## Open Questions for Community

**Pillar 1 (Credibility):**
- Who owns / maintains the exchange listing PDF? How often is it updated?
- Should we include historical fee data or just current balance on wallet tracker?

**Pillar 2 (Movement):**
- What is the call to action for the movement page — what does "joining" look like?
- Leaderboard: real-time vs. periodic refresh? Time window (all-time vs. monthly)?
- Should community content feed have moderation / editorial review?

**Pillar 3 (Grok AI Chat):**
- Should chat be a floating widget (always visible) or dedicated `/chat` page?
- Do we need xAI API key? Who manages/owns it?
- Should chat transcripts be logged or completely stateless?
- Can opt-in transcripts feed into the movement page (user consent)?
- What's the system prompt tone — match Grok's voice or our voice?

**Infrastructure:**
- Should the site be static (GitHub Pages) or need a backend for realtime features?
- Any brand guidelines — approved logos, color hex codes, fonts?
