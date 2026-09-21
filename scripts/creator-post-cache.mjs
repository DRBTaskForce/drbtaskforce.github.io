import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;

export function readPostCache(path) {
  if (!existsSync(path)) return { version: 1, dates: [], posts: {} };
  const cache = JSON.parse(readFileSync(path, 'utf8'));
  if (cache.version !== 1 || !Array.isArray(cache.dates) || !cache.posts || Array.isArray(cache.posts)) {
    throw new Error('Invalid creator post cache; no collection was started.');
  }
  for (const [id, record] of Object.entries(cache.posts)) {
    if (record.post?.id !== id || !Number.isFinite(Date.parse(record.post.created_at)) ||
        !Number.isFinite(record.initialImpressions) || !record.user?.username ||
        !cache.dates.includes(record.snapshotDate) ||
        !['pending', 'attempted', 'final', 'expired'].includes(record.recheckStatus)) {
      throw new Error('Invalid saved post record; no collection was started.');
    }
  }
  return cache;
}

export function savePostCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(cache, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}

// Cache only public post/author data. A post belongs to its first collection day;
// later metrics replace that contribution rather than creating another snapshot.
export async function updatePostCache(cache, posts, usersById, now, bearerToken, save) {
  // Validate discovery before changing cache state or starting a billable recheck.
  for (const post of posts) {
    const metrics = post.public_metrics;
    if (!metrics || !Number.isSafeInteger(metrics.impression_count) || metrics.impression_count < 0 ||
        ['like_count', 'retweet_count', 'reply_count', 'quote_count'].some(key =>
          metrics[key] !== undefined && (!Number.isSafeInteger(metrics[key]) || metrics[key] < 0))) {
      throw new Error('X returned invalid initial metrics; saved rankings were not replaced.');
    }
  }
  const today = now.toISOString().slice(0, 10);
  const firstDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 29 * DAY)
    .toISOString().slice(0, 10);
  cache.dates = [...new Set([...cache.dates, today])].filter(date => date >= firstDate && date <= today).sort();
  for (const [id, record] of Object.entries(cache.posts)) {
    if (!cache.dates.includes(record.snapshotDate)) delete cache.posts[id];
  }
  for (const post of posts) {
    const created = Date.parse(post.created_at);
    if (!Number.isFinite(created) || created > Date.now()) {
      throw new Error('X returned an invalid post creation time; saved rankings were not replaced.');
    }
    if (Object.hasOwn(cache.posts, post.id)) continue;
    const { id, author_id, created_at, text, note_tweet, referenced_tweets, public_metrics } = post;
    const user = usersById[author_id];
    cache.posts[id] = {
      post: { id, author_id, created_at, text, note_tweet, referenced_tweets, public_metrics },
      user: { id: author_id, username: user.username, profile_image_url: user.profile_image_url ?? '' },
      snapshotDate: today,
      initialImpressions: public_metrics.impression_count ?? 0,
      recheckStatus: 'pending',
      checkedAt: new Date().toISOString(),
    };
  }

  const pending = Object.values(cache.posts).filter(record => record.recheckStatus === 'pending');
  // Each batch is reconsidered against the actual clock, so a slow earlier
  // request cannot cause a later request to cross a post's age cutoff.
  for (let offset = 0; offset < pending.length; offset += 100) {
    const checkedAt = new Date();
    let batch = pending.slice(offset, offset + 100).filter(record => {
      const age = checkedAt.getTime() - Date.parse(record.post.created_at);
      const finalAge = record.initialImpressions >= 1000 ? 3 * DAY : 2 * DAY;
      if (age >= finalAge) record.recheckStatus = 'expired';
      return record.recheckStatus === 'pending' && age >= finalAge - DAY;
    });
    if (!batch.length) continue;
    for (const record of batch) {
      record.recheckStatus = 'attempted';
      record.attemptedAt = checkedAt.toISOString();
    }
    // Persist BEFORE a potentially billable call. A failed/partial response
    // keeps the previous metrics and consumes the one attempt; no paid retries.
    save(cache);
    // Checkpoint writes take time. Drop posts that expired while saving before
    // issuing the lookup; their persisted attempted marker already prevents retry.
    batch = batch.filter(record => {
      const finalAge = record.initialImpressions >= 1000 ? 3 * DAY : 2 * DAY;
      if (Date.now() - Date.parse(record.post.created_at) < finalAge) return true;
      record.recheckStatus = 'expired';
      return false;
    });
    if (!batch.length) continue;
    const ids = batch.map(record => record.post.id);
    const params = new URLSearchParams({ ids: ids.join(','), 'tweet.fields': 'public_metrics' });
    let byId;
    try {
      const res = await fetch(`https://api.twitter.com/2/tweets?${params}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`X final recheck HTTP ${res.status}.`);
      const result = await res.json();
      if (!Array.isArray(result?.data) || result.errors?.length || result.data.length !== ids.length) {
        throw new Error('Incomplete final recheck.');
      }
      byId = new Map();
      for (const post of result.data) {
        const metrics = post?.public_metrics;
        if (!ids.includes(post?.id) || byId.has(post.id) || !metrics ||
            !Number.isSafeInteger(metrics.impression_count) || metrics.impression_count < 0 ||
            ['like_count', 'retweet_count', 'reply_count', 'quote_count'].some(key =>
              metrics[key] !== undefined && (!Number.isSafeInteger(metrics[key]) || metrics[key] < 0))) {
          throw new Error('Invalid final recheck metrics.');
        }
        byId.set(post.id, metrics);
      }
    } catch (error) {
      // Discovery is complete; an optional later observation must not discard it.
      // Preserve this entire batch's old metrics and its consumed-attempt markers.
      // Stop further paid lookups for this run. Checkpoint/write errors stay fatal.
      console.warn(`Final metrics unavailable: ${error.message} Retained saved counts; no automatic retry.`);
      break;
    }
    for (const record of batch) {
      record.post.public_metrics = byId.get(record.post.id);
      record.recheckStatus = 'final';
      record.checkedAt = checkedAt.toISOString();
    }
    save(cache);
  }
  save(cache);
  return cache;
}

export function postCacheSnapshots(cache) {
  const snapshots = Object.fromEntries(cache.dates.map(date => [date, { posts: [], usersById: {} }]));
  for (const record of Object.values(cache.posts)) {
    const snapshot = snapshots[record.snapshotDate];
    snapshot.posts.push(record.post);
    snapshot.usersById[record.post.author_id] = record.user;
  }
  return snapshots;
}
