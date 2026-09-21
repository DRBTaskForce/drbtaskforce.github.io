const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bin = path.join(path.dirname(require.resolve('@11ty/eleventy/package.json')), 'cmd.js');
const panel = html => html.slice(html.indexOf('<section id="movement"'), html.indexOf('<section id="wallet"'));
function render(creators) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drb-movement-home-'));
  try {
    for (const name of ['src', 'scripts']) fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
    fs.copyFileSync(path.join(root, '.eleventy.js'), path.join(dir, '.eleventy.js'));
    fs.writeFileSync(path.join(dir, 'src/_data/creators.json'), JSON.stringify(creators));
    execFileSync(process.execPath, [bin, '--quiet'], { cwd: dir, stdio: 'pipe', timeout: 15000 });
    return { home: fs.readFileSync(path.join(dir, '_site/index.html'), 'utf8'), movement: fs.readFileSync(path.join(dir, '_site/movement/index.html'), 'utf8') };
  } finally {
    if (!process.env.KEEP_TEST_FIXTURES) fs.rmSync(dir, { recursive: true, force: true });
  }
}
const row = (author, impressions) => ({ author, impressions, reactions: 10, posts: 1, pct: 0 });
const rows = html => [...panel(html).matchAll(/class="account"[^>]*><a[^>]*>@([^<]+)<\/a><\/td><td class="metric"><span class="metric-value">([^<]+)/g)].map(m => [m[1], Number(m[2].replaceAll(',', ''))]);
const movementRows = html => [...html.slice(html.indexOf('id="lb-period-daily"'), html.indexOf('id="lb-period-weekly"')).matchAll(/data-author="([^"]+)"[^>]*data-impressions="([^"]+)"/g)].map(m => [m[1], Number(m[2])]);

test('home and Movement advance together from saved creator data, without changing other home sections', () => {
  const first = render({ lastUpdatedDaily: '2026-02-01T23:59:00Z', dailyHistory: { '2026-02-01': [row('Sixth', 1), row('Fifth', 25), row('Third', 750), row('First', 3000), row('Fourth', 100), row('Second', 1500)] } });
  const expected = [['First', 3000], ['Second', 1500], ['Third', 750], ['Fourth', 100], ['Fifth', 25]];
  assert.deepEqual(rows(first.home), expected);
  assert.deepEqual(movementRows(first.movement).slice(0, 5), expected);
  assert.match(panel(first.home), /datetime="2026-02-01T23:59:00.000Z"/);
  assert.match(panel(first.home), /Feb 1, 2026/);
  assert.match(panel(first.home), /--bar:50(?:\.0+)?%/);
  const second = render({ lastUpdatedDaily: '2026-02-02T00:01:00Z', dailyHistory: { '2026-02-02': [row('DRBTaskForce', 1800), row('NewLeader', 7200)] }, metricRechecks: { unavailablePosts: 1 } });
  assert.deepEqual(rows(second.home), [['NewLeader', 7200], ['DRBTaskForce', 1800]]);
  assert.deepEqual(rows(second.home), movementRows(second.movement));
  assert.match(panel(second.home), /datetime="2026-02-02T00:01:00.000Z"/);
  assert.match(panel(second.home), /Feb 2, 2026/);
  assert.match(panel(second.home), /--bar:25(?:\.0+)?%/);
  assert.match(panel(second.home), /href="#official-x-profile">@DRBTaskForce/);
  assert.ok(/id="official-x-profile"[^>]*href="https:\/\/x.com\/DRBTaskForce"/.test(second.home), "official account link must resolve to the existing footer profile");
  assert.match(panel(second.home), /earlier saved counts/);
  assert.equal(first.home.replace(panel(first.home), ''), second.home.replace(panel(second.home), ''));
});

test('missing and empty rankings never leave old homepage accounts or invent a collection date', () => {
  for (const input of [{}, { lastUpdatedDaily: '2026-02-03T01:00:00Z', dailyHistory: { '2026-02-03': [] } }]) {
    const result = render(input);
    assert.deepEqual(rows(result.home), []);
    assert.match(panel(result.home), /No saved daily ranking available/);
    assert.doesNotMatch(panel(result.home), /Sep 18|NaN|Infinity/);
    if (!input.lastUpdatedDaily) assert.match(panel(result.home), /date unavailable/);
  }
});

test('saved-list fallback preserves counts and handles zero totals and escaped author text', () => {
  const result = render({ lastUpdatedDaily: '2026-02-04T12:00:00Z', daily: [row('Zero', 0), row('A&B', 0)] });
  assert.deepEqual(rows(result.home), [['Zero', 0], ['A&amp;B', 0]]);
  assert.match(panel(result.home), /--bar:0%/);
  assert.doesNotMatch(panel(result.home), /NaN|Infinity|>\s*@A&B</);
});
