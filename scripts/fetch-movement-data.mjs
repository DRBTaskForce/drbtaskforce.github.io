#!/usr/bin/env node
/**
 * Fetches top $DRB / "Grok Has Money" tweets from the X API v2,
 * keeps the top 20 by engagement, and writes to src/_data/movement.json.
 *
 * Environment variables:
 *   TWITTER_BEARER_TOKEN — X API v2 Bearer Token (Basic tier or higher)
 *
 * Usage:
 *   node scripts/fetch-movement-data.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '../src/_data/movement.json');

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
if (!BEARER_TOKEN) {
  console.error('TWITTER_BEARER_TOKEN is required');
  process.exit(1);
}

// Search for the last 24 hours of $DRB / Grok Has Money tweets
const QUERY = '("Grok has money" OR "$DRB" OR "DebtReliefBot") -is:retweet -is:reply lang:en';
const MAX_RESULTS = 100;
const TOP_N = 20;

async function fetchTweets() {
  const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    query: QUERY,
    max_results: String(MAX_RESULTS),
    start_time: startTime,
    sort_order: 'relevancy',
    'tweet.fields': 'created_at,public_metrics,author_id',
    'user.fields': 'name,username,profile_image_url',
    expansions: 'author_id',
  });

  const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body}`);
  }

  return res.json();
}

async function main() {
  console.log('Fetching movement data from X API...');
  console.log('Query:', QUERY);

  let data;
  try {
    data = await fetchTweets();
  } catch (err) {
    console.error('Fetch failed:', err.message);
    // Write an error state so the page degrades gracefully
    writeFileSync(OUTPUT_PATH, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      posts: [],
      fetchError: err.message,
    }, null, 2) + '\n');
    process.exit(0);
  }

  const tweets = data.data ?? [];
  const usersById = Object.fromEntries(
    (data.includes?.users ?? []).map(u => [u.id, u])
  );

  console.log(`Retrieved ${tweets.length} tweets`);

  const posts = tweets
    .map(tweet => {
      const user = usersById[tweet.author_id] ?? {};
      const m = tweet.public_metrics ?? {};
      const engagement =
        (m.like_count     ?? 0) +
        (m.retweet_count  ?? 0) +
        (m.reply_count    ?? 0) +
        (m.quote_count    ?? 0);

      // Use _normal (48px) avatar; upgrade to _200x200 for better quality
      const avatar = (user.profile_image_url ?? '').replace('_normal', '_200x200');

      return {
        id: tweet.id,
        text: tweet.text,
        authorName: user.name ?? 'Unknown',
        authorUsername: user.username ?? 'unknown',
        authorAvatar: avatar,
        createdAt: tweet.created_at ?? new Date().toISOString(),
        likes: m.like_count     ?? 0,
        retweets: m.retweet_count  ?? 0,
        replies: m.reply_count    ?? 0,
        quotes: m.quote_count    ?? 0,
        engagement,
        url: `https://x.com/${user.username}/status/${tweet.id}`,
      };
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, TOP_N);

  const output = {
    lastUpdated: new Date().toISOString(),
    posts,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Written ${posts.length} posts to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
