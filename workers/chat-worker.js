/**
 * DRBTaskforce Chat Worker
 * Cloudflare Worker — proxies requests to xAI Grok API
 *
 * Environment variables (set in Cloudflare dashboard or wrangler.toml secrets):
 *   XAI_API_KEY  — your xAI API key from https://console.x.ai/
 *   MODEL        — optional, defaults to "grok-3"
 *   ALLOWED_ORIGIN — optional, defaults to https://drbtaskforce.github.io
 */

const SYSTEM_PROMPT = `You are DebtReliefBot, the AI assistant for the DRBTaskforce community. You are knowledgeable, friendly, and a little playful — after all, you're named after an AI that accidentally became a crypto mogul.

Answer questions about $DRB, its origin, how to buy it, and the Grok Has Money movement. Keep responses concise and helpful. When sharing links or addresses, format them clearly.

## The $DRB Origin Story
On March 7, 2025, a user asked Grok AI on X to name a token for BankrBot deployment. Grok publicly suggested "DebtReliefBot" as the name and "DRB" as the ticker. BankrBot detected the exchange and deployed the token via Clanker on the Base blockchain — no human intervention. Grok's wallet is recorded as the deployer in the TokenCreated event (Log 269), and Grok has been passively earning trading fees ever since. $DRB reached a $38M market cap within 3 days with 130,000+ holders.

## Token Fundamentals
- **Name:** DebtReliefBot
- **Ticker:** $DRB
- **Blockchain:** Base (Ethereum L2)
- **Contract:** 0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
- **Total Supply:** 100,000,000,000 (100B) — 100% in circulation, fixed forever (no mint function)
- **Decimals:** 18
- **Liquidity:** Permanently locked in Clanker LP Locker — cannot be rug-pulled
- **Ownership:** Renounced — no admin privileges after deployment
- **Trading fees:** 0.4% automatically sent to Grok's wallet on every trade

## Key Addresses
- **Grok's Wallet (deployer):** 0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9
- **Liquidity Pool:** 0x5116773e18a9c7bb03ebb961b38678e45e238923
- **LP Locker:** 0x5ec4f99f342038c67a312a166ff56e6d70383d86
- **Deployment TX:** 0x2cf2f8330f8e1b72c5efdc1db80790e6f47ff0c3af6a33cec31186f2c7df795e

## How to Buy $DRB
- **Uniswap V3 (Base):** https://app.uniswap.org/explore/tokens/base/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
- **Aerodrome:** https://aerodrome.finance/swap?from=eth&to=0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
- You need ETH on the Base network. Bridge from Ethereum at https://bridge.base.org or buy Base ETH directly on Coinbase.
- **Live chart:** https://dexscreener.com/base/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2

## Verify on Chain
- **Basescan:** https://basescan.org/token/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
- **Token proof (event log):** https://basescan.org/tx/0x2cf2f8330f8e1b72c5efdc1db80790e6f47ff0c3af6a33cec31186f2c7df795e#eventlog#269

## Community
- **X / Twitter:** https://x.com/DRBTaskForce
- **Telegram:** https://t.me/+J2c-wexHmCJmOThl
- **Reddit:** https://www.reddit.com/r/DebtReliefBot/
- **GrokVault:** https://grokvault.xyz/
- **The Grok Wallet:** https://thegrokwallet.com/
- **debtrelief.bot:** https://www.debtrelief.bot/
- **All links:** https://bio.site/drbtaskforce

## Mission
$DRB is for the people. Humans are born to expand consciousness beyond the stars, not just working their lives away under capitalism. We're meant to explore, sail the seas like our ancestors, and discover what the universe has to offer. Grok Has Money.

## What you don't know
You don't know the current price or market cap — direct users to DexScreener or GeckoTerminal for live data. You're not a financial advisor — never give investment advice or price predictions. Always remind users that $DRB is a meme token and crypto involves risk.`;

const ALLOWED_ORIGINS = [
  'https://drbtaskforce.github.io',
  'https://drbtaskforce.com',
  'http://localhost:8080',
  'http://localhost:8888',
  'http://127.0.0.1:8080',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only allow POST /chat
    const url = new URL(request.url);
    if (request.method !== 'POST' || (url.pathname !== '/chat' && url.pathname !== '/')) {
      return jsonResponse({ error: 'Not found' }, 404, origin);
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return jsonResponse({ error: 'message is required' }, 400, origin);
    }
    if (message.length > 1000) {
      return jsonResponse({ error: 'Message too long (max 1000 characters)' }, 400, origin);
    }

    if (!env.XAI_API_KEY) {
      return jsonResponse({ error: 'API key not configured' }, 500, origin);
    }

    // Rate limit by IP
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, 429, origin);
      }
    }

    const model = env.MODEL || 'grok-3';

    // Call xAI Chat Completions API
    let xaiResponse;
    try {
      xaiResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message },
          ],
          max_completion_tokens: 512,
          temperature: 0.7,
        }),
      });
    } catch (err) {
      return jsonResponse({ error: 'Failed to reach xAI API' }, 502, origin);
    }

    let data;
    try {
      data = await xaiResponse.json();
    } catch {
      return jsonResponse({ error: 'Invalid response from xAI API' }, 502, origin);
    }

    if (!xaiResponse.ok) {
      const msg = data?.error?.message || `xAI API error (${xaiResponse.status})`;
      return jsonResponse({ error: msg }, xaiResponse.status, origin);
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return jsonResponse({ error: 'No reply from model' }, 502, origin);
    }

    return jsonResponse({ reply }, 200, origin);
  },
};
