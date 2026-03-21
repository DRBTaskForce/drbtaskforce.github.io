# Checkr Integration

Integration with [Checkr](https://checkr.social) to display X creators ranked by $DRB attention metrics.

## What is Checkr?

Checkr tracks social attention and mindshare for crypto tokens across X (Twitter). It provides metrics like:

- **Mindshare:** % of token-related conversations about $DRB
- **Velocity:** Rate of attention growth
- **Attention Score:** Combined metric of engagement and reach

## API Documentation

- **Main Docs:** https://api.checkr.social/docs
- **Endpoints Reference:** See `checkr-skill` repo at https://github.com/checkrsocial/checkr-skill
- **Skill Reference:** `references/endpoints.md` in the checkr-skill repo

## Authentication

Checkr supports two authentication methods:

1. **API Key** (recommended for this project)
   - Set via environment variable: `CHECKR_API_KEY`
   - Stored securely in Cloudflare Worker secrets
   - Never exposed to frontend

2. **x402 Wallet Pay-Per-Call** (alternative)
   - Documented in public Checkr API docs
   - Not currently used by this project

## Architecture

```
Frontend (GitHub Pages)
    ↓
GET /leaderboard
    ↓
Cloudflare Worker (our API proxy)
    ↓
Checkr API (api.checkr.social)
```

The Worker acts as a secure proxy:
- Keeps API key server-side
- Adds CORS headers for browser access
- Caches responses (15min) to reduce API calls
- Transforms response for our frontend needs

## Setup

See `cloudflare-worker/README.md` for full setup instructions.

**Quick start:**
```bash
cd cloudflare-worker
npm install
cp .dev.vars.example .dev.vars
# Add your CHECKR_API_KEY to .dev.vars
npm run dev
```

## Required Environment Variables

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `CHECKR_API_KEY` | Checkr API authentication key | Contact Drew or check internal docs |

## Frontend Usage

```javascript
// Fetch leaderboard data
const response = await fetch('https://drbtaskforce-api.YOUR_SUBDOMAIN.workers.dev/leaderboard');
const data = await response.json();

// data.accounts contains:
// - username (X handle)
// - displayName
// - profileImage (unavatar.io URL)
// - mindshare, velocity, attentionScore
// - rank
```

## Response Schema

```typescript
{
  token: string;           // "DRB"
  lastUpdated: number;     // Unix timestamp
  accounts: Array<{
    username: string;      // X handle (e.g., "merklemoltbot")
    displayName: string;   // Display name
    profileImage: string;  // Avatar URL via unavatar.io
    mindshare: number;     // Mindshare %
    velocity: number;      // Attention velocity
    attentionScore: number;// Combined score
    rank: number;          // Leaderboard position
  }>;
}
```

## Rate Limits

**Cloudflare Worker (our proxy):**
- Free tier: 100,000 requests/day
- Response cached for 15 minutes

**Checkr API:**
- TBD — confirm with Drew/Checkr docs
- Our caching reduces direct API calls significantly

## Leaderboard Refresh Strategy

**Auto-refresh:** Every 15 minutes (matches cache TTL)

**Manual refresh:** User can click refresh button for immediate update

**Implementation:**
```javascript
function startAutoRefresh() {
  setInterval(loadLeaderboard, 15 * 60 * 1000);
}
```

## Security

✅ **API key stored in Cloudflare Worker secrets** (encrypted at rest)  
✅ **Never exposed to frontend** (server-side only)  
✅ **CORS restricted** to drbtaskforce.github.io  
✅ **`.dev.vars` gitignored** (local dev secrets stay local)  

⚠️ **Do NOT:**
- Commit `.dev.vars` to git
- Paste API keys in GitHub issues/PRs
- Expose keys in frontend code

## Troubleshooting

**"Failed to fetch leaderboard" error:**
1. Check Cloudflare Worker logs: `npm run tail`
2. Verify `CHECKR_API_KEY` is set: `npx wrangler secret list`
3. Test Checkr API endpoint directly (with key in header)

**CORS error in browser:**
1. Verify GitHub Pages URL matches worker's `Access-Control-Allow-Origin`
2. Check browser console for exact error
3. Ensure worker is deployed and accessible

**No data returned:**
1. Check if Checkr has data for $DRB
2. Verify API endpoint URL is correct
3. Review response transformation logic in `worker.js`

## Next Steps

- [ ] Get Checkr API key from Drew
- [ ] Test Checkr API endpoint with real data
- [ ] Deploy worker to production
- [ ] Implement frontend leaderboard component
- [ ] Add auto-refresh functionality
- [ ] Test with real $DRB metrics

## References

- Checkr Skill Repo: https://github.com/checkrsocial/checkr-skill
- Checkr API Docs: https://api.checkr.social/docs
- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
