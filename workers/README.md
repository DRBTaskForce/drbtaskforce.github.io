# DRB Chat Worker

Cloudflare Worker that proxies requests from the DRBTaskforce site to the xAI Grok API.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/) with Workers enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- xAI API key from [console.x.ai](https://console.x.ai/)
- Node.js (use nvm: `nvm use 22`)

## First-time setup

```bash
cd workers
wrangler login          # authenticate with Cloudflare
wrangler secret put XAI_API_KEY   # paste your xAI key when prompted
wrangler deploy
```

## Deploy updates

```bash
cd workers
wrangler deploy
```

The worker deploys to `drb-chat-worker.<your-subdomain>.workers.dev`.

## Environment variables

| Variable | How to set | Default | Notes |
|---|---|---|---|
| `XAI_API_KEY` | `wrangler secret put XAI_API_KEY` | — | **Required.** Never commit this. |
| `MODEL` | `wrangler.toml` `[vars]` | `grok-3` | xAI model name |

## Rate limiting

The worker uses Cloudflare's built-in Rate Limiting API (configured in `wrangler.toml`):

- **10 requests per IP per 60 seconds**
- Enforced at the Worker level — no cost for blocked requests
- Returns HTTP 429 with `{ "error": "Too many requests. Please wait a moment." }`

The `RATE_LIMITER` binding is declared as `unsafe.bindings` in `wrangler.toml`. This requires the Workers Paid plan or a free plan with rate limiting enabled in the Cloudflare dashboard.

## xAI spending limits

Set a monthly spending cap in the [xAI console](https://console.x.ai/) under **Billing → Spending Limit** to prevent runaway costs if the worker is abused.

Useful reference points:
- `grok-3` pricing: check [x.ai/api](https://x.ai/api) for current rates
- Each request uses: 1 system prompt (~400 tokens) + user message (≤1000 chars) + response (≤512 tokens)
- Estimated max tokens per request: ~1400 input + 512 output

## Security notes

- The worker URL is visible in page source (unavoidable for a public site). CORS alone won't stop non-browser clients.
- Rate limiting (above) is the primary cost-abuse defense.
- The system prompt contains no secrets — only public information about $DRB.
- Responses use `textContent` (not `innerHTML`), so XSS from model output is not a risk.
- Prompt injection from user messages has no meaningful attack surface — the bot only answers DRB questions.

## Local development

```bash
cd workers
wrangler dev    # starts local worker at http://localhost:8787
```

To test against the local worker, temporarily change `API_URL` in `src/_includes/base.njk` to `http://localhost:8787`.
