#!/usr/bin/env node
/**
 * Fetches $DRB attention leaders from X API v2, writes to src/_data/creators.json.
 *
 * Schedule (GitHub Actions — update-creators-data.yml):
 *   Daily at 14:00 UTC: store a 24h snapshot and refresh both rollups.
 *   Rollups use available snapshots from the last 7/30 UTC calendar dates.
 *   Missing dates are not backfilled with older snapshots.
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
import { fetchRecentPosts } from './x-search.mjs';
import { readPostCache, savePostCache, updatePostCache, postCacheSnapshots } from './creator-post-cache.mjs';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '../src/_data/creators.json');
const CACHE_PATH  = join(__dirname, '../data/creator-post-cache.json');

const BEARER_TOKEN  = process.env.TWITTER_BEARER_TOKEN;
const QUERY         = '($DRB OR "debtreliefbot:native" OR "DebtReliefBot")';
const TOP_N         = 15;
const MIN_REACTIONS = 5;
const MAX_HISTORY   = 30;

if (!BEARER_TOKEN) {
  console.error('TWITTER_BEARER_TOKEN is required');
  process.exit(1);
}

async function fetchPosts() {
  const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
      query:          QUERY,
      max_results:    '100',
      start_time:     startTime,
      'tweet.fields': 'public_metrics,author_id,created_at,note_tweet,referenced_tweets',
      'user.fields':  'username,profile_image_url',
      expansions:     'author_id',
  });
  const data = await fetchRecentPosts(params, BEARER_TOKEN);
  return {
    posts: data.data,
    usersById: Object.fromEntries(data.includes.users.map(user => [user.id, user])),
  };
}

function hasEligibleOwnText(post) {
  // Only quotes need this guard; other search results retain their eligibility.
  if (!post.referenced_tweets?.some(ref => ref.type === 'quoted')) return true;
  return /(?:\$DRB\b|\bDebtReliefBot\b)/i.test(post.note_tweet?.text ?? post.text ?? '');
}

function buildLeaderboard(posts, usersById) {
  const byAuthor = {};

  for (const post of posts) {
    if (!hasEligibleOwnText(post)) continue;

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

  return all.map(a => ({
    ...a,
    pct: total > 0 ? Math.round((a.impressions / total) * 1000) / 10 : 0,
  }));
}

function historyDates(history, days, today) {
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const firstDate = start.toISOString().slice(0, 10);
  return Object.keys(history).filter(date => date >= firstDate && date <= today).sort();
}

function buildRollup(history, days, today) {
  const dates    = historyDates(history, days, today);
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

  return all.map(a => ({
    ...a,
    pct: total > 0 ? Math.round((a.impressions / total) * 1000) / 10 : 0,
  }));
}

async function main() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const cache = readPostCache(CACHE_PATH);

  console.log(`Fetching $DRB posts for ${today}...`);
  const { posts, usersById } = await fetchPosts();
  console.log(`Retrieved ${posts.length} posts`);

  let existing = {
    daily: [], weekly: [], monthly: [],
    lastUpdatedDaily: null, lastUpdatedWeekly: null, lastUpdatedMonthly: null,
    dailyHistory: {},
  };
  if (existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
  }

  await updatePostCache(cache, posts.filter(hasEligibleOwnText), usersById, now, BEARER_TOKEN,
    value => savePostCache(CACHE_PATH, value));
  const history = { ...(existing.dailyHistory ?? {}) };
  for (const [date, snapshot] of Object.entries(postCacheSnapshots(cache))) {
    history[date] = buildLeaderboard(snapshot.posts, snapshot.usersById);
  }
  const daily = history[today].slice(0, TOP_N);
  console.log(`${history[today].length} qualifying authors, showing top ${daily.length}`);
  const retainedDates = new Set(historyDates(history, MAX_HISTORY, today));
  for (const date of Object.keys(history)) {
    if (!retainedDates.has(date)) delete history[date];
  }

  const weekly  = buildRollup(history, 7, today);
  const monthly = buildRollup(history, 30, today);

  writeFileSync(OUTPUT_PATH, JSON.stringify({
    daily,
    weekly,
    monthly,
    lastUpdatedDaily:   now.toISOString(),
    lastUpdatedWeekly:  now.toISOString(),
    lastUpdatedMonthly: now.toISOString(),
    dailyHistory: history,
    metricRechecks: {
      unavailablePosts: Object.values(cache.posts).filter(record => record.recheckStatus === 'attempted').length,
    },
  }, null, 2) + '\n');

  console.log(`Done. Daily: ${daily.length}, Weekly: ${weekly.length}, Monthly: ${monthly.length}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
