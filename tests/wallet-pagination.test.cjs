const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/fetch-wallet-data.mjs'), 'utf8');
const start = source.indexOf('async function fetchAllEthTxs(');
const end = source.indexOf('// ---------------------------------------------------------------------------', start);
function fixture(page) {
  let requests = 0;
  const context = vm.createContext({ URL, BLOCKSCOUT_API: 'https://fixture.invalid/api', WALLET_ADDRESS: 'fixture',
    INDEXER_PENDING_MESSAGE: 'pending', IndexerPendingError: Error,
    blockscoutFetch: async url => {
      requests++;
      // Bound the unfixed implementation so the regression cannot hang.
      if (requests > 22) throw new Error('fixture safety stop');
      return { ok: true, json: async () => ({ status: '1', result: page(new URL(url)) }) };
    },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.collect = fetchAllEthTxs;', context);
  return { collect: context.collect, get requests() { return requests; } };
}
for (const action of ['txlist', 'txlistinternal']) {
  test(`${action} rejects a repeated full page before duplicate history can be consumed`, async () => {
    const run = fixture(() => Array.from({ length: 10000 }, (_, i) => ({ hash: String(i) })));
    await assert.rejects(run.collect(action), /repeated page/);
    assert.equal(run.requests, 2);
  });
  test(`${action} bounds a provider that returns endless distinct full pages`, async () => {
    const run = fixture(url => Array.from({ length: 10000 }, (_, i) => ({ hash: url.searchParams.get('page') + ':' + i })));
    await assert.rejects(run.collect(action), /page limit/);
    assert.equal(run.requests, 20);
  });
}
test('native history preserves all rows across valid pagination', async () => {
  const run = fixture(url => url.searchParams.get('page') === '1'
    ? Array.from({ length: 10000 }, (_, i) => ({ hash: String(i) })) : [{ hash: 'last' }]);
  const result = await run.collect('txlist');
  assert.equal(result.length, 10001);
  assert.equal(result.at(-1).hash, 'last');
});
