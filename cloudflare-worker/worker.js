/**
 * Cloudflare Worker - DRB Task Force API Proxy
 * 
 * Proxies requests to external APIs (Checkr, Basescan, etc.) while keeping
 * API keys secure on the server side.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers for GitHub Pages origin
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://drbtaskforce.github.io',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: /leaderboard - X creators ranked by $DRB attention metrics
    if (url.pathname === '/leaderboard') {
      return handleLeaderboard(env, corsHeaders);
    }

    // Route: /health - Simple health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Fetch $DRB attention leaderboard from Checkr API
 */
async function handleLeaderboard(env, corsHeaders) {
  try {
    // TODO: Update endpoint when we have the real Checkr API details
    // For now, this is a placeholder structure
    const checkrResponse = await fetch('https://api.checkr.social/v1/tokens/drb/creators', {
      headers: {
        'Authorization': `Bearer ${env.CHECKR_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!checkrResponse.ok) {
      throw new Error(`Checkr API returned ${checkrResponse.status}`);
    }

    const data = await checkrResponse.json();

    // Transform response to match our frontend needs
    const leaderboard = {
      token: 'DRB',
      lastUpdated: Date.now(),
      accounts: data.creators?.map(creator => ({
        username: creator.handle || creator.username,
        displayName: creator.display_name || creator.name,
        profileImage: `https://unavatar.io/x/${creator.handle || creator.username}`,
        mindshare: creator.mindshare || 0,
        velocity: creator.velocity || 0,
        attentionScore: creator.attention_score || 0,
        rank: creator.rank
      })) || []
    };

    return new Response(JSON.stringify(leaderboard), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900' // Cache for 15 minutes
      }
    });

  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch leaderboard',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
