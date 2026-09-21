const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DRB = '0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2';
const WETH = '0x4200000000000000000000000000000000000006';
const DRB_POOL = '0x5116773e18a9c7bb03ebb961b38678e45e238923';
const ETH_POOL = '0xd0b53d9277642d899df5c87a3966a349a798f224';
function runtime(fetch, wallet = {}) {
  const timers = new Map(); let next = 0;
  const document = { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'wallet-data'
    ? { textContent: JSON.stringify({ tokenContract: DRB, wethContract: WETH, tokenDecimals: 18, ...wallet }) }
    : { addEventListener() {} } };
  const context = { document, window: {}, console, AbortController, fetch,
    setTimeout: callback => { timers.set(++next, callback); return next; }, clearTimeout: id => timers.delete(id) };
  const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/wallet.js'), 'utf8');
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.api = {fetchDrbPrice, fetchEthPrice, fetchWithTimeout, historyWindow};\n})();'), context);
  return { api: context.api, timers };
}
const response = data => ({ ok: true, status: 200, json: async () => data });

test('DRB valuation selects its Base pool and token instead of the first API entry', async () => {
  const { api } = runtime(async () => response({ pairs: [
    { chainId: 'ethereum', pairAddress: DRB_POOL, baseToken: { address: DRB }, priceUsd: '20' },
    { chainId: 'base', pairAddress: DRB_POOL, baseToken: { address: DRB.toUpperCase() }, priceUsd: '0.0002' },
  ] }));
  assert.equal(await api.fetchDrbPrice(), 0.0002);
});

test('ETH price accepts the documented pairs list and computes quote-token USD units correctly', async () => {
  const { api } = runtime(async () => response({ pairs: [{ chainId: 'base', pairAddress: ETH_POOL,
    baseToken: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC' },
    quoteToken: { address: WETH, symbol: 'WETH' }, priceUsd: '1', priceNative: '0.0004' }] }));
  assert.equal(await api.fetchEthPrice(), 2500);
});

test('invalid or unrelated prices remain unavailable instead of valuing the wallet', async () => {
  for (const priceUsd of ['0', '-1', '2garbage', 'Infinity', '']) {
    const { api } = runtime(async () => response({ pairs: [{ chainId: 'base', pairAddress: DRB_POOL,
      baseToken: { address: DRB }, priceUsd }] }));
    assert.equal(await api.fetchDrbPrice(), null, priceUsd);
  }
});

test('request deadline covers a stalled JSON body after headers arrive', async () => {
  const { api, timers } = runtime(async (_url, { signal }) => ({ ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => {
      if (signal.aborted) reject(new Error('body aborted'));
      else signal.addEventListener('abort', () => reject(new Error('body aborted')));
    }) }));
  const pending = api.fetchWithTimeout('https://example.test/fixture');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(timers.size, 1, 'body parsing must still have an active deadline');
  [...timers.values()][0]();
  await assert.rejects(pending, /body aborted/);
  assert.equal(timers.size, 0);
});

test('history periods include actual dated records and exclude invented carried-forward rows', () => {
  const { api } = runtime(() => { throw new Error('History should not fetch'); }, { walletValueAllTime: [
    { date: '2026-01-01' }, { date: '2026-01-15' }, { date: '2026-01-20', carriedForward: true }, { date: '2026-01-31' },
  ] });
  assert.deepEqual(Array.from(api.historyWindow(30), row => row.date), ['2026-01-15', '2026-01-31']);
  assert.deepEqual(Array.from(api.historyWindow(90), row => row.date), ['2026-01-01', '2026-01-15', '2026-01-31']);
});
