# DRB Task Force - Cloudflare Worker API

Serverless API proxy that keeps API keys secure while serving data to the GitHub Pages frontend.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Local Development

```bash
# Copy example env file
cp .dev.vars.example .dev.vars

# Edit .dev.vars and add your Checkr API key
# (Ask Drew or check internal docs for the API key)
```

### 3. Run Locally

```bash
npm run dev
```

This starts the worker at `http://localhost:8787`

Test it:
```bash
curl http://localhost:8787/health
curl http://localhost:8787/leaderboard
```

### 4. Deploy to Production

First time setup:
```bash
# Login to Cloudflare
npx wrangler login

# Set production secret (only needs to be done once)
npx wrangler secret put CHECKR_API_KEY
# Paste your API key when prompted
```

Deploy:
```bash
npm run deploy
```

Your worker will be live at: `https://drbtaskforce-api.YOUR_SUBDOMAIN.workers.dev`

## API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

### `GET /leaderboard`
Returns X creators ranked by $DRB attention metrics.

**Response:**
```json
{
  "token": "DRB",
  "lastUpdated": 1234567890,
  "accounts": [
    {
      "username": "exampleuser",
      "displayName": "Example User",
      "profileImage": "https://unavatar.io/x/exampleuser",
      "mindshare": 42.5,
      "velocity": 8.2,
      "attentionScore": 95.3,
      "rank": 1
    }
  ]
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CHECKR_API_KEY` | Checkr API key for fetching $DRB metrics | Yes |

Set secrets in production:
```bash
npx wrangler secret put CHECKR_API_KEY
```

For local dev, add to `.dev.vars` file.

## CORS

The worker is configured to accept requests from:
- `https://drbtaskforce.github.io` (production)

To add more origins, edit the `corsHeaders` object in `worker.js`.

## Custom Domain (Optional)

To use `api.drbtaskforce.com` instead of `workers.dev`:

1. Add domain to Cloudflare DNS
2. Uncomment the `[env.production]` section in `wrangler.toml`
3. Update the zone name to match your domain
4. Deploy: `npm run deploy`

## Monitoring

View live logs:
```bash
npm run tail
```

Or check the [Cloudflare Workers dashboard](https://dash.cloudflare.com/).

## Security Notes

- ⚠️ **Never commit `.dev.vars`** — it's gitignored for a reason
- ✅ Use `wrangler secret` for production keys (encrypted at rest)
- ✅ API keys are only accessible server-side, never exposed to frontend

## Troubleshooting

**"Authentication error" when deploying:**
```bash
npx wrangler login
```

**"Secret not found" in production:**
```bash
npx wrangler secret put CHECKR_API_KEY
```

**CORS errors in browser:**
Check that your GitHub Pages URL matches the `Access-Control-Allow-Origin` header in `worker.js`.
