#!/usr/bin/env node
/**
 * Fetches $DRB attention leaders from X API v2, writes to src/_data/creators.json.
 *
 * Schedule (GitHub Actions — update-creators-data.yml):
 *   Daily  08:00 CST (14:00 UTC)  → 24h snapshot stored
 *   Wednesday 08:00 CST            → also computes 7-day rollup
 *   1st of month 08:00 CST         → also computes 30-day rollup
 *
 * Ranking: sorted by impressions, minimum 5 reactions to qualify.
 * Attention %: author impressions / total impressions × 100.
 *
 * Environment variables:
 *   TWITTER_BEARER_TOKEN — X API v2 Bearer Token
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '../src/_data/creators.json');

const BEARER_TOKEN  = process.env.TWITTER_BEARER_TOKEN;
const QUERY         = '$DRB -is:retweet';
const TOP_N         = 15;
const MIN_REACTIONS = 5;
const MAX_HISTORY   = 30;

if (!BEARER_TOKEN) {
  console.error('TWITTER_BEARER_TOKEN is required');
  process.exit(1);
}

async function fetchPosts() {
  const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const posts     = [];
  const usersById = {};
  let nextToken   = null;

  do {
    const params = new URLSearchParams({
      query:          QUERY,
      max_results:    '100',
      start_time:     startTime,
      'tweet.fields': 'public_metrics,author_id,created_at',
      'user.fields':  'username,profile_image_url',
      expansions:     'author_id',
    });
    if (nextToken) params.set('pagination_token', nextToken);

    const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`X API ${res.status}: ${body}`);
    }

    const data = await res.json();

    for (const user of data.includes?.users ?? []) {
      usersById[user.id] = user;
    }
    posts.push(...(data.data ?? []));
    nextToken = data.meta?.next_token ?? null;
  } while (nextToken);

  return { posts, usersById };
}

function buildLeaderboard(posts, usersById) {
  const byAuthor = {};

  for (const post of posts) {
    const m         = post.public_metrics ?? {};
    const reactions = (m.like_count ?? 0) + (m.retweet_count ?? 0) +
                      (m.reply_count ?? 0) + (m.quote_count ?? 0);
    if (reactions < MIN_REACTIONS) continue;

    const user = usersById[post.author_id];
    if (!user) continue;

    const key = user.username.toLowerCase();
    if (!byAuthor[key]) {
      byAuthor[key] = {
        author:      user.username,
        avatar:      (user.profile_image_url ?? '').replace('_normal', '_200x200'),
        impressions: 0,
        reactions:   0,
        posts:       0,
        pct:         0,
      };
    }
    byAuthor[key].impressions += m.impression_count ?? 0;
    byAuthor[key].reactions   += reactions;
    byAuthor[key].posts       += 1;
  }

  const all    = Object.values(byAuthor).sort((a, b) => b.impressions - a.impressions);
  const total  = all.reduce((s, a) => s + a.impressions, 0);
  const sorted = all.slice(0, TOP_N);

  return sorted.map(a => ({
    ...a,
    pct: total > 0 ? Math.round((a.impressions / total) * 1000) / 10 : 0,
  }));
}

function buildRollup(history, days) {
  const dates    = Object.keys(history).sort().slice(-days);
  const byAuthor = {};

  for (const date of dates) {
    for (const entry of history[date] ?? []) {
      const key = entry.author.toLowerCase();
      if (!byAuthor[key]) {
        byAuthor[key] = {
          author:      entry.author,
          avatar:      entry.avatar ?? '',
          impressions: 0,
          reactions:   0,
          posts:       0,
          pct:         0,
        };
      }
      byAuthor[key].impressions += entry.impressions;
      byAuthor[key].reactions   += entry.reactions;
      byAuthor[key].posts       += entry.posts;
      if (entry.avatar) byAuthor[key].avatar = entry.avatar;
    }
  }

  const all    = Object.values(byAuthor).sort((a, b) => b.impressions - a.impressions);
  const total  = all.reduce((s, a) => s + a.impressions, 0);
  const sorted = all.slice(0, TOP_N);

  return sorted.map(a => ({
    ...a,
    pct: total > 0 ? Math.round((a.impressions / total) * 1000) / 10 : 0,
  }));
}

async function main() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const isWed = now.getUTCDay() === 3;
  const is1st = now.getUTCDate() === 1;

  console.log(`Fetching $DRB posts for ${today}...`);
  const { posts, usersById } = await fetchPosts();
  console.log(`Retrieved ${posts.length} posts`);

  const daily = buildLeaderboard(posts, usersById);
  console.log(`${daily.length} qualifying authors`);

  let existing = {
    daily: [], weekly: [], monthly: [],
    lastUpdatedDaily: null, lastUpdatedWeekly: null, lastUpdatedMonthly: null,
    dailyHistory: {},
  };
  if (existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
  }

  const history   = { ...(existing.dailyHistory ?? {}), [today]: daily };
  const allDates  = Object.keys(history).sort();
  if (allDates.length > MAX_HISTORY) delete history[allDates[0]];

  const weekly  = isWed ? buildRollup(history, 7)  : (existing.weekly  ?? []);
  const monthly = is1st ? buildRollup(history, 30) : (existing.monthly ?? []);

  writeFileSync(OUTPUT_PATH, JSON.stringify({
    daily,
    weekly,
    monthly,
    lastUpdatedDaily:   now.toISOString(),
    lastUpdatedWeekly:  isWed ? now.toISOString() : (existing.lastUpdatedWeekly  ?? null),
    lastUpdatedMonthly: is1st ? now.toISOString() : (existing.lastUpdatedMonthly ?? null),
    dailyHistory: history,
  }, null, 2) + '\n');

  console.log(`Done. Daily: ${daily.length}, Weekly: ${weekly.length}, Monthly: ${monthly.length}`);
  if (isWed) console.log('Wednesday — weekly rollup computed.');
  if (is1st) console.log('1st of month — monthly rollup computed.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
