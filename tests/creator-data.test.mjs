import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const NOW = '2026-09-11T14:00:00.000Z'; // Friday, neither Wednesday nor the first.
const entry = (author, impressions) => ({ author, avatar: '', impressions, reactions: 5, posts: 1, pct: 100 });
const response = {
  data: [{ id: '1', author_id: 'u1', text: '$DRB', created_at: '2026-09-11T02:00:00.000Z', public_metrics: { impression_count: 100, like_count: 5 } }],
  includes: { users: [{ id: 'u1', username: 'Today', name: 'Today' }] },
};

// Run the real CLI against disposable files; replace only the clock and network boundary.
function runScript(kind, existing, api = response, status = 200, token = 'test-only-placeholder', pages = null, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'drb-social-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'src/_data'), { recursive: true });
    mkdirSync(join(root, 'data'));
    const cachePath = join(root, 'data/creator-post-cache.json');
    if (options.cache) writeFileSync(cachePath, JSON.stringify(options.cache));
    const script = `fetch-${kind}-data.mjs`;
    copyFileSync(new URL(`../scripts/${script}`, import.meta.url), join(root, 'scripts', script));
    const helper = new URL('../scripts/x-search.mjs', import.meta.url);
    if (existsSync(helper)) copyFileSync(helper, join(root, 'scripts/x-search.mjs'));
    const cacheHelper = new URL('../scripts/creator-post-cache.mjs', import.meta.url);
    if (existsSync(cacheHelper)) copyFileSync(cacheHelper, join(root, 'scripts/creator-post-cache.mjs'));
    const output = join(root, `src/_data/${kind}.json`);
    const before = JSON.stringify(existing) + '\n';
    writeFileSync(output, before);
    const requestsPath = join(root, 'requests.json');
    writeFileSync(requestsPath, '[]');
    writeFileSync(join(root, 'fixture.mjs'), `
      import { writeFileSync, readFileSync } from 'node:fs';
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [${JSON.stringify(options.now ?? NOW)}])); }
        static now() { return new RealDate(${JSON.stringify(options.now ?? NOW)}).getTime(); }
      };
      const pages = ${JSON.stringify(pages)};
      const lookups = ${JSON.stringify(options.lookups ?? [])};
      let index = 0;
      let lookupIndex = 0;
      const requests = [];
      globalThis.fetch = async (url) => {
        // Record request URLs only, never authorization headers.
        requests.push(String(url));
        writeFileSync(${JSON.stringify(requestsPath)}, JSON.stringify(requests));
        if (new URL(url).pathname === '/2/tweets') {
          const page = lookups[lookupIndex++];
          if (!page) throw new Error('Unexpected extra lookup request');
          const cache = JSON.parse(readFileSync(${JSON.stringify(cachePath)}, 'utf8'));
          for (const id of new URL(url).searchParams.get('ids').split(',')) {
            if (cache.posts[id].recheckStatus !== 'attempted') throw new Error('Lookup was not checkpointed');
          }
          if (page.error) throw new Error(page.error);
          return new Response(JSON.stringify(page.body), { status: page.status || 200 });
        }
        if (!pages) return new Response(${JSON.stringify(JSON.stringify(api))}, { status: ${status} });
        const page = pages[index++];
        if (!page) throw new Error('Unexpected extra page request');
        const params = new URL(url).searchParams;
        if ((params.get('next_token') || params.get('pagination_token')) !== (page.token || null)) {
          throw new Error('Incorrect pagination cursor');
        }
        return new Response(JSON.stringify(page.body), { status: page.status || 200 });
      };
    `);
    const result = spawnSync(process.execPath, ['--import', join(root, 'fixture.mjs'), join(root, 'scripts', script)], {
      env: { ...process.env, TWITTER_BEARER_TOKEN: token }, encoding: 'utf8', timeout: 5000,
    });
    return {
      ...result, before, after: readFileSync(output, 'utf8'),
      data: JSON.parse(readFileSync(output, 'utf8')),
      requests: JSON.parse(readFileSync(requestsPath, 'utf8')),
      cache: existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null,
    };
  } finally {
    // Restricted runtimes may allow fixture creation but forbid directory removal.
    if (!process.env.KEEP_TEST_FIXTURES) rmSync(root, { recursive: true, force: true });
  }
}

const history = {
  '2026-07-10': [entry('Ancient', 9000)],
  '2026-08-12': [entry('OutsideMonth', 8000)],
  '2026-08-13': [entry('MonthBoundary', 300)],
  '2026-09-04': [entry('OutsideWeek', 200)],
  '2026-09-05': [entry('WeekBoundary', 100)],
  '2026-09-12': [entry('Future', 7000)],
};
const creators = { daily: [], weekly: [], monthly: [], dailyHistory: history };

test('refreshes 7-day and 30-day rankings on every successful daily run', () => {
  const result = runScript('creators', creators);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.data.lastUpdatedWeekly, NOW);
  assert.equal(result.data.lastUpdatedMonthly, NOW);
  assert.deepEqual(result.data.weekly.map(x => x.author).sort(), ['Today', 'WeekBoundary']);
  assert.deepEqual(result.data.monthly.map(x => x.author).sort(), ['MonthBoundary', 'OutsideWeek', 'Today', 'WeekBoundary']);
  assert.equal(result.data.weekly.find(x => x.author === 'Today').pct, 50);
});

test('retains only history inside the current 30 calendar dates', () => {
  const result = runScript('creators', creators);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(result.data.dailyHistory).sort(), ['2026-08-13', '2026-09-04', '2026-09-05', '2026-09-11']);
});

const savedFeed = { lastUpdated: '2026-09-10T02:00:00Z', posts: [{ id: 'saved-post' }] };
test('missing credential preserves saved data and fails before fetching', () => {
  for (const kind of ['creators']) {
    const result = runScript(kind, kind === 'movement' ? savedFeed : creators, response, 200, '');
    assert.notEqual(result.status, 0);
    assert.equal(result.after, result.before);
    assert.match(result.stderr, /TWITTER_BEARER_TOKEN/);
  }
});

test('duplicate post IDs across pages count once in creator attention', () => {
  const result = runScript('creators', creators, response, 200, 'test-only-placeholder', [
    { body: { ...response, meta: { next_token: 'page2' } } },
    { token: 'page2', body: response },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.data.daily[0].impressions, 100);
  assert.equal(result.data.daily[0].posts, 1);
});

test('partial or malformed HTTP-200 results cannot overwrite saved data', () => {
  for (const kind of ['creators']) {
    for (const payload of [{ ...response, errors: [{ title: 'Partial failure' }] }, {}]) {
      const result = runScript(kind, kind === 'movement' ? savedFeed : creators, payload);
      assert.notEqual(result.status, 0);
      assert.equal(result.after, result.before);
    }
  }
});

test('second-page HTTP failure preserves all previously published data', () => {
  for (const kind of ['creators']) {
    const result = runScript(kind, kind === 'movement' ? savedFeed : creators, response, 200, 'test-only-placeholder', [
      { body: { ...response, meta: { next_token: 'page2' } } },
      { token: 'page2', body: { title: 'Rate limited' }, status: 429 },
    ]);
    assert.notEqual(result.status, 0);
    assert.equal(result.after, result.before);
  }
});

test('posts missing author details or metrics cannot replace published data', () => {
  const invalidPages = [
    { data: [{ id: '1' }] },
    { ...response, data: [{ ...response.data[0], public_metrics: null }] },
    { data: response.data, includes: { users: [] } },
    { data: response.data, includes: { users: [{ id: 'u1' }] } },
  ];
  for (const kind of ['creators']) {
    for (const payload of invalidPages) {
      const result = runScript(kind, kind === 'movement' ? savedFeed : creators, payload);
      assert.notEqual(result.status, 0);
      assert.equal(result.after, result.before);
    }
  }
});

test('creator requests cover all three DRB forms and full quote text on every page', () => {
  const result = runScript('creators', creators, response, 200, 'test-only-placeholder', [
    { body: { ...response, meta: { next_token: 'page2' } } },
    { token: 'page2', body: response },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.requests.length, 2);
  for (const url of result.requests) {
    const params = new URL(url).searchParams;
    assert.equal(params.get('query'), '($DRB OR "debtreliefbot:native" OR "DebtReliefBot")');
    const fields = params.get('tweet.fields').split(',');
    assert.ok(fields.includes('note_tweet'), 'request full-length own text');
    assert.ok(fields.includes('referenced_tweets'), 'identify quote authors');
    assert.equal(params.get('start_time'), '2026-09-10T14:00:00.000Z');
    assert.equal(params.get('max_results'), '100');
    assert.equal(params.get('expansions'), 'author_id');
  }
});

test('recorded diagnostic examples contribute once, including linked quotes, notes and the five-reaction reply', () => {
  // Public excerpts and totals from 2026-09-17-MOVEMENT-SEARCH-RESULTS-HANDOFF.md.
  // This is a six-day eligibility/aggregation fixture, NOT a corrected daily snapshot.
  // Truncated previews, dates and reaction splits are synthetic; sums match the report.
  const samples = [
    { id: '2100239676212662606', text: 'groks genesis coin $DRB over the past 18 months:', impressions: 1618, reactions: 111 },
    { id: '2100570950479573197', text: 'groks genesis coin debtreliefbot:native is the #1 performer in the world over the past month', impressions: 2333, reactions: 102 },
    { id: '2100230191859515463', text: 'debtreliefbot:native is up +523% trailing 1 month', impressions: 2043, reactions: 132 },
    { id: '2099900227004010562', text: 'we can now buy groks genesis coin debtreliefbot:native directly through the cashtag on 𝕏', impressions: 5607, reactions: 230,
      referenced_tweets: [{ type: 'quoted', id: '2099892416979284471' }] },
    { id: '2099899267133403139', text: '@grok @coinbase @XBusiness @grok does this work for debtreliefbot:native on @base?', impressions: 174, reactions: 5,
      referenced_tweets: [{ type: 'replied_to', id: '2099895228303855644' }] },
    { id: '2098816848284291237', text: 'A longer post…', impressions: 7195, reactions: 206,
      note_tweet: { text: 'and why did grok name it debtreliefbot? we may never know…' } },
    { id: '2098595686879044009', text: 'Another longer post…', impressions: 12221, reactions: 329,
      note_tweet: { text: 'prompt the creation of debtreliefbot to bankr' } },
  ].map(({ impressions, reactions, ...post }) => ({
    ...post, author_id: 'mlee', created_at: '2026-09-11T02:00:00.000Z', public_metrics: { impression_count: impressions, like_count: reactions },
  }));
  const includes = { users: [{ id: 'mlee', username: 'MLeeJr' }] };
  const result = runScript('creators', creators, response, 200, 'test-only-placeholder', [
    { body: { data: samples.slice(0, 4), includes, meta: { next_token: 'page2' } } },
    { token: 'page2', body: { data: samples.slice(3), includes } },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.data.daily, [{
    author: 'MLeeJr', avatar: '', impressions: 31191, reactions: 1115, posts: 7, pct: 100,
  }]);
  assert.deepEqual(result.data.dailyHistory['2026-09-11'], result.data.daily);
});

test('quotes require an eligible term in their own full text, never the quoted original', () => {
  const cases = [
    { text: 'Following $DRB.', qualifies: true },
    { text: 'Following $drb!', qualifies: true },
    { text: 'Following debtreliefbot:native.', qualifies: true },
    { text: 'Following DebtReliefBot.', qualifies: true },
    { text: 'A longer thought…', note_tweet: { text: 'A longer thought about debtreliefbot.' }, qualifies: true },
    { text: 'A longer thought…', note_tweet: { text: 'A longer thought about $DRB.' }, qualifies: true },
    { text: 'A longer thought…', note_tweet: { text: 'A longer thought about debtreliefbot:native.' }, qualifies: true },
    { text: 'Interesting!', qualifies: false },
    { text: '$DRBigger and OtherDebtReliefBotProject', qualifies: false },
    { text: '$DRB in a preview', note_tweet: { text: 'The full own text is authoritative.' }, qualifies: false },
  ];
  for (const { qualifies, ...content } of cases) {
    const api = {
      ...response,
      data: [{ ...response.data[0], ...content, referenced_tweets: [{ type: 'quoted', id: 'original' }] }],
      includes: { ...response.includes, tweets: [{ id: 'original', text: '$DRB debtreliefbot:native DebtReliefBot',
        note_tweet: { text: '$DRB in the quoted original' } }] },
    };
    const result = runScript('creators', creators, api);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.data.daily.length, qualifies ? 1 : 0, JSON.stringify(content));
    assert.equal(result.data.dailyHistory['2026-09-11'].length, qualifies ? 1 : 0);
    assert.equal(result.data.weekly.some(x => x.author === 'Today'), qualifies);
    assert.equal(result.data.monthly.some(x => x.author === 'Today'), qualifies);
  }
});

test('five combined reactions qualify and impressions determine rank while replies and reposts retain eligibility', () => {
  const api = {
    data: [
      { id: 'reply', author_id: 'five', text: 'debtreliefbot:native', referenced_tweets: [{ type: 'replied_to', id: 'parent' }],
        public_metrics: { impression_count: 500, like_count: 1, retweet_count: 1, reply_count: 1, quote_count: 2 } },
      { id: 'popular', author_id: 'popular', text: '$DRB', public_metrics: { impression_count: 100, like_count: 1000 } },
      { id: 'below', author_id: 'four', text: 'DebtReliefBot', public_metrics: { impression_count: 99999, like_count: 4 } },
      { id: 'repost', author_id: 'reposter', text: 'RT @Today: $DRB', referenced_tweets: [{ type: 'retweeted', id: 'source' }],
        public_metrics: { impression_count: 25, like_count: 5 } },
    ],
    includes: { users: ['five', 'popular', 'four', 'reposter'].map(id => ({ id, username: id })) },
  };
  api.data.forEach(post => { post.created_at = '2026-09-11T02:00:00.000Z'; });
  const result = runScript('creators', creators, api);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.data.daily.map(x => [x.author, x.impressions, x.reactions, x.pct]), [
    ['five', 500, 5, 80], ['popular', 100, 1000, 16], ['reposter', 25, 5, 4],
  ]);
});

test('creator pagination loops and the 20-page cap preserve saved data without retries', () => {
  const loopingPages = [
    { body: { ...response, meta: { next_token: 'same' } } },
    { token: 'same', body: { ...response, meta: { next_token: 'same' } } },
  ];
  const cappedPages = Array.from({ length: 20 }, (_, i) => ({
    token: i ? `page${i}` : null,
    body: { ...response, meta: { next_token: `page${i + 1}` } },
  }));
  for (const pages of [loopingPages, cappedPages]) {
    const result = runScript('creators', creators, response, 200, 'test-only-placeholder', pages);
    assert.notEqual(result.status, 0);
    assert.equal(result.after, result.before);
    assert.equal(result.requests.length, pages.length);
    assert.match(result.stderr, /pagination cursor|exceeded 20 pages/);
  }
});

const emptySearch = { meta: { result_count: 0 } };
const metrics = (impressions, likes = 5) => ({ impression_count: impressions, like_count: likes, retweet_count: 0, reply_count: 0, quote_count: 0 });
const discovery = {
  ...response,
  data: [
    { ...response.data[0], id: 'ordinary', public_metrics: metrics(999, 4) },
    { ...response.data[0], id: 'strong', public_metrics: metrics(1000) },
  ],
};
const runCreators = (existing, api, options = {}) => runScript('creators', existing, api, 200, 'test-only-placeholder', null, options);
const lookupRequests = result => result.requests.filter(url => new URL(url).pathname === '/2/tweets');

test('one final recheck uses initial 1000-view threshold, updates the original day, then freezes forever', () => {
  const first = runCreators(creators, discovery);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.cache?.posts?.ordinary?.initialImpressions, 999);
  assert.equal(first.cache?.posts?.strong?.initialImpressions, 1000);
  assert.equal(first.data.daily[0].posts, 1); // Four reactions do not qualify yet.
  assert.equal(lookupRequests(first).length, 0);

  const second = runCreators(first.data, emptySearch, {
    now: '2026-09-12T14:00:00.000Z', cache: first.cache,
    lookups: [{ body: { data: [{ id: 'ordinary', public_metrics: metrics(5000) }] } }],
  });
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(lookupRequests(second).map(url => new URL(url).searchParams.get('ids')), ['ordinary']);
  assert.equal(second.cache.posts.ordinary.recheckStatus, 'final');
  assert.equal(second.cache.posts.strong.recheckStatus, 'pending');
  assert.equal(second.data.dailyHistory['2026-09-11'][0].impressions, 6000);
  assert.equal(second.data.dailyHistory['2026-09-11'][0].posts, 2);
  assert.deepEqual(second.data.daily, []);

  const third = runCreators(second.data, emptySearch, {
    now: '2026-09-13T14:00:00.000Z', cache: second.cache,
    lookups: [{ body: { data: [{ id: 'strong', public_metrics: metrics(7000) }] } }],
  });
  assert.equal(third.status, 0, third.stderr);
  assert.deepEqual(lookupRequests(third).map(url => new URL(url).searchParams.get('ids')), ['strong']);
  assert.equal(third.data.dailyHistory['2026-09-11'][0].impressions, 12000);
  assert.equal(third.data.weekly.find(x => x.author === 'Today').impressions, 12000);
  assert.equal(third.data.monthly.find(x => x.author === 'Today').impressions, 12000);
  for (const now of ['2026-09-13T15:00:00.000Z', '2026-09-20T14:00:00.000Z']) {
    const later = runCreators(third.data, emptySearch, { now, cache: third.cache });
    assert.equal(later.status, 0, later.stderr);
    assert.equal(lookupRequests(later).length, 0);
    assert.equal(later.cache.posts.ordinary.post.public_metrics.impression_count, 5000);
    assert.equal(later.cache.posts.strong.post.public_metrics.impression_count, 7000);
  }
});

test('recheck age boundaries never fetch ordinary posts at 48h or strong posts at 72h', () => {
  const first = runCreators(creators, discovery);
  assert.equal(first.status, 0, first.stderr);
  const cases = [
    ['2026-09-12T01:59:59.999Z', []],
    ['2026-09-12T02:00:00.000Z', ['ordinary']],
    ['2026-09-13T02:00:00.000Z', ['strong']],
    ['2026-09-14T02:00:00.000Z', []],
  ];
  for (const [now, ids] of cases) {
    const result = runCreators(first.data, emptySearch, {
      now, cache: first.cache,
      lookups: ids.length ? [{ body: { data: ids.map(id => ({ id, public_metrics: metrics(2000) })) } }] : [],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(lookupRequests(result).flatMap(url => new URL(url).searchParams.get('ids').split(',')), ids);
  }
});

test('a failed final read retains old metrics, publishes complete new discovery, and never retries its attempt', () => {
  const first = runCreators(creators, discovery);
  assert.equal(first.status, 0, first.stderr);
  for (const page of [
    { status: 429, body: { title: 'Rate limited' } },
    { error: 'Network unavailable' },
    { body: { data: [], errors: [{ title: 'Not found' }] } },
    { body: { data: [] } },
    { body: { data: [{ id: 'ordinary', public_metrics: { like_count: 5 } }] } },
  ]) {
    const options = { now: '2026-09-12T14:00:00.000Z', cache: first.cache, lookups: [page] };
    const newDiscovery = { ...response, data: [{ ...response.data[0], id: 'new-day', created_at: '2026-09-12T12:00:00.000Z' }] };
    const failed = runCreators(first.data, newDiscovery, options);
    assert.equal(failed.status, 0, failed.stderr);
    assert.equal(failed.data.lastUpdatedDaily, options.now);
    assert.equal(failed.data.daily[0].impressions, 100);
    assert.deepEqual(failed.data.dailyHistory['2026-09-11'], first.data.dailyHistory['2026-09-11']);
    assert.equal(failed.data.metricRechecks.unavailablePosts, 1);
    assert.match(failed.stderr, /retained|retaining/i);
    assert.equal(lookupRequests(failed).length, 1);
    assert.equal(failed.cache?.posts?.ordinary?.recheckStatus, 'attempted');
    const rerun = runCreators(first.data, emptySearch, { ...options, cache: failed.cache, lookups: [] });
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.equal(lookupRequests(rerun).length, 0);
    assert.equal(rerun.cache.posts.ordinary.post.public_metrics.impression_count, 999);
    assert.equal(rerun.data.metricRechecks.unavailablePosts, 1);
  }
});

test('mixed and malformed final lookup batches never apply partial metrics or start later paid batches', () => {
  const posts = Array.from({ length: 101 }, (_, i) => ({ ...response.data[0], id: String(i + 1) }));
  const first = runCreators(creators, { ...response, data: posts });
  for (const body of [
    { data: [{ id: '1', public_metrics: metrics(9999) }], errors: [{ resource_id: '2', resource_type: 'tweet', type: 'https://api.x.com/2/problems/resource-not-found' }] },
    { data: posts.slice(0, 100).map((post, i) => ({ id: i === 99 ? '1' : post.id, public_metrics: metrics(9999) })) },
    { data: posts.slice(0, 100).map((post, i) => ({ id: post.id, public_metrics: metrics(i === 99 ? -1 : 9999) })) },
  ]) {
    const result = runCreators(first.data, emptySearch, {
      now: '2026-09-12T14:00:00.000Z', cache: first.cache, lookups: [{ body }],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lookupRequests(result).length, 1);
    assert.equal(result.cache.posts['1'].post.public_metrics.impression_count, 100);
    assert.equal(result.cache.posts['100'].recheckStatus, 'attempted');
    assert.equal(result.cache.posts['101'].recheckStatus, 'pending');
    assert.equal(result.data.metricRechecks.unavailablePosts, 100);
    assert.equal(result.data.weekly[0].impressions, 10100);
  }
});

test('unknown or invalid initial impressions fail before any cache checkpoint or final lookup', () => {
  for (const impression_count of [undefined, null, -1, '100', 1.5]) {
    const result = runCreators(creators, { ...response, data: [{ ...response.data[0], public_metrics: { like_count: 5, impression_count } }] });
    assert.notEqual(result.status, 0);
    assert.equal(result.after, result.before);
    assert.equal(result.cache, null);
    assert.equal(lookupRequests(result).length, 0);
  }
});

test('overlapping discovery does not change initial tier or count a post twice across dates', () => {
  const first = runCreators(creators, discovery);
  const again = runCreators(first.data, {
    ...discovery, data: discovery.data.map(post => ({ ...post, public_metrics: metrics(20000) })),
  }, { cache: first.cache, now: '2026-09-12T01:00:00.000Z' });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.cache?.posts?.ordinary?.initialImpressions, 999);
  assert.equal(again.data.weekly.find(x => x.author === 'Today').impressions, 1000);
  assert.deepEqual(again.data.dailyHistory['2026-09-12'], []);
});

test('rechecks batch at 100 post IDs, use no author expansion, and expire cached history at 30 dates', () => {
  const posts = Array.from({ length: 101 }, (_, i) => ({ ...response.data[0], id: String(i + 1) }));
  const first = runCreators(creators, { ...response, data: posts });
  const refreshed = runCreators(first.data, emptySearch, {
    now: '2026-09-12T14:00:00.000Z', cache: first.cache,
    lookups: [posts.slice(0, 100), posts.slice(100)].map(batch => ({ body: {
      data: batch.map(post => ({ id: post.id, public_metrics: metrics(200) })).reverse(),
    } })),
  });
  assert.equal(refreshed.status, 0, refreshed.stderr);
  const requests = lookupRequests(refreshed).map(url => new URL(url).searchParams);
  assert.deepEqual(requests.map(params => params.get('ids').split(',').length), [100, 1]);
  for (const params of requests) {
    assert.equal(params.get('tweet.fields'), 'public_metrics');
    assert.equal(params.has('expansions'), false);
  }
  assert.equal(refreshed.data.weekly.find(x => x.author === 'Today').impressions, 20200);
  const expired = runCreators(refreshed.data, emptySearch, { cache: refreshed.cache, now: '2026-10-11T14:00:00.000Z' });
  assert.equal(expired.status, 0, expired.stderr);
  assert.deepEqual(expired.cache.posts, {});
  assert.equal(expired.data.dailyHistory['2026-09-11'], undefined);
});

test('missing or invalid creation time cannot start a recheck schedule or replace rankings', () => {
  for (const created_at of [undefined, 'invalid', '2026-09-12T14:00:00.000Z']) {
    const result = runCreators(creators, { ...response, data: [{ ...response.data[0], created_at }] });
    assert.notEqual(result.status, 0);
    assert.equal(result.after, result.before);
    assert.equal(lookupRequests(result).length, 0);
  }
});

test('checkpoint time cannot push a paid recheck across either age cutoff', async () => {
  const { updatePostCache } = await import('../scripts/creator-post-cache.mjs');
  const RealDate = Date;
  const realFetch = globalThis.fetch;
  try {
    for (const [initialImpressions, beforeCutoff] of [
      [999, '2026-09-13T01:59:59.999Z'], [1000, '2026-09-14T01:59:59.999Z'],
    ]) {
      let time = RealDate.parse(beforeCutoff);
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [time])); }
        static now() { return time; }
      };
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ data: [{ id: '1', public_metrics: metrics(2000) }] }));
      };
      const cache = { version: 1, dates: ['2026-09-11'], posts: { '1': {
        post: response.data[0], user: response.includes.users[0], snapshotDate: '2026-09-11',
        initialImpressions, recheckStatus: 'pending',
      } } };
      await updatePostCache(cache, [], {}, new Date(), 'test-only-placeholder', () => { time++; });
      assert.equal(calls, 0, 'post reached its cutoff during checkpoint');
      assert.equal(cache.posts['1'].recheckStatus, 'expired');
    }
  } finally {
    globalThis.Date = RealDate;
    globalThis.fetch = realFetch;
  }
});

test('checkpoint storage failure stays fatal and cannot become a successful partial update', async () => {
  const { updatePostCache } = await import('../scripts/creator-post-cache.mjs');
  const first = runCreators(creators, discovery);
  const RealDate = Date;
  const realFetch = globalThis.fetch;
  try {
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ['2026-09-12T14:00:00.000Z'])); }
      static now() { return RealDate.parse('2026-09-12T14:00:00.000Z'); }
    };
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
    await assert.rejects(updatePostCache(first.cache, [], {}, new Date(), 'test-only-placeholder', () => {
      throw new Error('checkpoint disk full');
    }), /checkpoint disk full/);
    assert.equal(calls, 0);
  } finally {
    globalThis.Date = RealDate;
    globalThis.fetch = realFetch;
  }
});
