const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime(fetch, wallet) {
  const elements = new Map();
  class Clock extends Date { static now() { return Date.parse('2026-10-23T12:34:00Z'); } }
  const context = {
    document: { readyState: 'loading', addEventListener() {}, getElementById(id) {
      if (id === 'wallet-data') return { textContent: JSON.stringify(wallet) };
      if (!elements.has(id)) elements.set(id, { addEventListener() {} });
      return elements.get(id);
    } }, window: {}, console, AbortController, fetch, Date: Clock, setTimeout, clearTimeout,
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/wallet.js'), 'utf8');
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.refresh = updateLiveStats; })();'), context);
  return { refresh: context.refresh, elements };
}
const saved = { date: '2026-09-19', drb: 10, weth: 1, eth: 2, usdc: 100, drbPrice: 2, ethPrice: 1000, usd: 3120 };
const wallet = { tokenDecimals: 18, walletValueAllTime: [saved] };

test('synthetic trailing rows never advance the saved balance date or value', async () => {
  const { refresh, elements } = runtime(async () => ({ ok: false, status: 403 }), {
    walletValueAllTime: [saved, { ...saved, date: '2026-10-23', usd: 999999, carriedForward: true }],
  });
  await refresh();
  assert.equal(elements.get('stat-total').textContent, '$3,120.00');
  assert.match(elements.get('stat-updated-sub').textContent, /Sep 19, 2026/);
  assert.doesNotMatch(elements.get('stat-updated-sub').textContent, /Oct 23/);
});

test('partial refresh labels the total as a mixture of saved and current data', async () => {
  const { refresh, elements } = runtime(async url => url.includes('action=balance')
    ? { ok: true, status: 200, json: async () => ({ status: '1', result: '3000000000000000000' }) }
    : { ok: false, status: 403 }, wallet);
  await refresh();
  assert.match(elements.get('stat-total-sub').textContent, /saved and current data/i);
});

test('complete refresh includes its UTC calendar date as well as time', async () => {
  // Exercise the renderer directly so this date check does not depend on API fixtures.
  const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/wallet.js'), 'utf8');
  const nodes = new Map();
  const context = { document: { readyState: 'loading', addEventListener() {}, getElementById(id) {
    if (id === 'wallet-data') return { textContent: JSON.stringify(wallet) };
    if (!nodes.has(id)) nodes.set(id, { addEventListener() {} }); return nodes.get(id);
  } }, window: {}, console, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.render = renderStats; })();'), context);
  context.render({ drbBalance: 10, wethBalance: 1, ethBalance: 2, usdcBalance: 100,
    drbPrice: 2, ethPrice: 1000, usingCached: false, fetchedAt: '2026-10-23T12:34:00Z' });
  assert.match(nodes.get('stat-updated-sub').textContent, /Oct 23, 2026/);
  assert.match(nodes.get('stat-updated-sub').textContent, /12:34.*UTC/);
});

test('partial refresh without a saved snapshot does not claim saved inputs', async () => {
  const { refresh, elements } = runtime(async url => url.includes('contractaddress=0x833589')
    ? { ok: true, status: 200, json: async () => ({ status: '1', result: '3000000000000000000' }) }
    : { ok: false, status: 403 }, {});
  await refresh();
  assert.doesNotMatch(elements.get('stat-total-sub').textContent, /saved and current data/i);
});

test('independent price requests start before the slow sequential balance requests finish', async () => {
  const requests = [];
  const { refresh } = runtime(async url => {
    requests.push(url);
    return { ok: false, status: 403 };
  }, wallet);
  const pending = refresh();
  assert.equal(requests.filter(url => url.includes('dexscreener')).length, 2);
  await pending;
});

for (const invalid of [null, '', ' ', false, true, '0x10', '-1', '1.5']) {
  test(`malformed successful balances retain saved values: ${JSON.stringify(invalid)}`, async () => {
    const { refresh, elements } = runtime(async () => ({
      ok: true, status: 200, json: async () => ({ status: '1', result: invalid }),
    }), wallet);
    await refresh();
    assert.equal(elements.get('stat-total').textContent, '$3,120.00');
    assert.equal(elements.get('stat-weth').textContent, '1.0000 WETH');
    assert.equal(elements.get('stat-eth').textContent, '2.0000 ETH');
  });
}

test('a successful decimal-string zero is a real balance, not a failed observation', async () => {
  const { refresh, elements } = runtime(async () => ({
    ok: true, status: 200, json: async () => ({ status: '1', result: '0' }),
  }), wallet);
  await refresh();
  assert.equal(elements.get('stat-total').textContent, '$0.00');
  assert.equal(elements.get('stat-weth').textContent, '0.0000 WETH');
  assert.equal(elements.get('stat-eth').textContent, '0.0000 ETH');
});
