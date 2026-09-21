const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bin = path.join(path.dirname(require.resolve('@11ty/eleventy/package.json')), 'cmd.js');
function render(wallet, page = 'index.html') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drb-wallet-home-'));
  try {
    fs.cpSync(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
    fs.cpSync(path.join(root, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(root, '.eleventy.js'), path.join(dir, '.eleventy.js'));
    fs.writeFileSync(path.join(dir, 'src/_data/wallet.json'), JSON.stringify(wallet));
    execFileSync(process.execPath, [bin, '--quiet'], { cwd: dir, stdio: 'pipe', timeout: 15000 });
    return fs.readFileSync(path.join(dir, '_site', page), 'utf8');
  } finally {
    if (!process.env.KEEP_TEST_FIXTURES) fs.rmSync(dir, { recursive: true, force: true });
  }
}
const point = (date, usd, drb) => ({ date, usd, drb, weth: 1, eth: 1, usdc: 100, drbPrice: 1, ethPrice: 1000 });
const fixture = () => {
  const points = [point('2026-01-31', 2110, 10), point('2026-02-01', 2200, 100), point('2026-02-02', 2150, 50)];
  return { walletAddress: '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9', lastUpdated: '2026-02-02T12:34:56Z',
    cumulativeWethEarned: '8.75', walletValueAllTime: points, walletValueLast30Days: points };
};
const panel = html => html.slice(html.indexOf('<section id="wallet"'), html.indexOf('<section id="token"'));
const value = (html, className) => html.match(new RegExp('<[^>]+class="' + className + '"[^>]*>([^<]*)'))?.[1];

test('homepage wallet values, date and chart follow the saved wallet input on every build', () => {
  const first = fixture();
  const before = render(first);
  assert.equal(value(before, 'wallet-total'), '$2,150.00');
  assert.match(panel(before), /Feb 2, 2026, 12:34 UTC/);
  assert.match(panel(before), /8\.7500 WETH/);
  assert.match(panel(before), /<dt>DRB<\/dt><dd>50<\/dd>/);
  const updated = structuredClone(first);
  updated.lastUpdated = '2026-02-03T06:07:00Z';
  updated.walletValueAllTime.push(point('2026-02-03', 2750, 650));
  updated.walletValueLast30Days = updated.walletValueAllTime;
  updated.cumulativeWethEarned = '9.1255';
  const after = render(updated);
  assert.equal(value(after, 'wallet-total'), '$2,750.00');
  assert.match(panel(after), /Feb 3, 2026, 06:07 UTC/);
  assert.match(panel(after), /9\.1255 WETH/);
  assert.match(panel(after), /<dt>DRB<\/dt><dd>650<\/dd>/);
  assert.match(panel(after), /4 daily samples/);
  assert.notEqual(panel(after).match(/class="chart-line" d="([^"]+)/)?.[1], panel(before).match(/class="chart-line" d="([^"]+)/)?.[1]);
  assert.equal(before.replace(panel(before), ''), after.replace(panel(after), ''), 'wallet data must not alter another homepage section');
});

test('a later collection or carried-forward row cannot make an old valuation look current', () => {
  const summarize = require('../scripts/wallet-summary.cjs');
  const saved = fixture();
  saved.lastUpdated = '2026-02-05T06:07:00Z';
  saved.walletValueLast30Days = [...saved.walletValueLast30Days, { ...saved.walletValueAllTime.at(-1), date: '2026-02-05', valuationDate: '2026-02-02', carriedForward: true }];
  const summary = summarize(saved);
  assert.match(summary.asOf, /^Feb 2, 2026/);
  assert.match(summary.chart.caption, /3 daily samples/);
  assert.doesNotMatch(summary.chart.caption, /Feb 5/);
});

test('a genuine zero balance still produces a finite readable chart', () => {
  const summarize = require('../scripts/wallet-summary.cjs');
  const saved = fixture();
  saved.cumulativeWethEarned = '0';
  saved.walletValueAllTime = [{ date: '2026-02-02', usd: 0, drb: 0, weth: 0, eth: 0, usdc: 0 }];
  const summary = summarize(saved);
  assert.equal(summary.total, '$0.00');
  assert.equal(summary.balances.eth, '0.0000');
  assert.equal(summary.chart.end.x, '512.00');
  assert.doesNotMatch(summary.chart.line, /NaN|Infinity/);
});

test('current chain balances update both pages without making retained history or receipts look new', () => {
  const saved = fixture();
  saved.currentSnapshot = { ...point('2026-02-05', 3950, 1850), observedAt: '2026-02-05T10:20:00Z' };
  saved.historyStatus = { state: 'pending', checkedAt: '2026-02-05T10:20:00Z' };
  const before = render(fixture());
  const home = render(saved);
  assert.equal(value(home, 'wallet-total'), '$3,950.00');
  assert.match(panel(home), /As of Feb 5, 2026, 10:20 UTC/);
  assert.match(panel(home), /History update pending/);
  assert.match(panel(home), /WETH received · cumulative · Feb 2, 2026/);
  assert.match(panel(home), /3 daily samples · Jan 31–Feb 2, 2026/);
  assert.equal(panel(home).match(/class="chart-line" d="([^"]+)/)?.[1], panel(before).match(/class="chart-line" d="([^"]+)/)?.[1]);
  assert.equal(home.replace(panel(home), ''), before.replace(panel(before), ''), 'current observation affects only the wallet section');
  const walletPage = render(saved, 'wallet/index.html');
  assert.match(walletPage, /id="stat-total">\$3950</);
  assert.match(walletPage, /datetime="2026-02-05T10:20:00Z"/);
  assert.match(walletPage, /History update pending/);
  assert.match(walletPage, /Daily snapshots through Feb 2, 2026/);
  const table = walletPage.slice(walletPage.indexOf('<tbody id="history-rows">'), walletPage.indexOf('</tbody>'));
  assert.doesNotMatch(table, /2026-02-05/);
});

test('invalid current observations cannot masquerade as a valid current snapshot', () => {
  const summarize = require('../scripts/wallet-summary.cjs');
  for (const changes of [{ usd: -1 }, { observedAt: 'invalid' }, { eth: NaN }]) {
    const saved = fixture();
    saved.currentSnapshot = { ...point('2026-02-05', 3950, 1850), observedAt: '2026-02-05T10:20:00Z', ...changes };
    assert.throws(() => summarize(saved), /snapshot|observation/i);
  }
});
