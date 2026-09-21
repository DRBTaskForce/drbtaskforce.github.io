const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real CLI's calculations and orchestration, replacing only I/O.
// No fixture may reach the network or write the site's wallet snapshot.
const source = fs.readFileSync(path.join(__dirname, '../scripts/fetch-wallet-data.mjs'), 'utf8');
const code = source.replace(/^#!.*\n/, '').replace(/^import .*;\n/gm, '')
  .replace('const __dirname = dirname(fileURLToPath(import.meta.url));', 'const __dirname = "/fixture/scripts";')
  .split('const incremental = process.argv.includes')[0]
  + '\nglobalThis.collector = {main, mainIncremental, buildCumulativeBalanceMap, buildCumulativeEthBalanceMap, buildValueHistory, last30DaysFrom, fetchWithRetry};';
const wallet = '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const other = '0x0000000000000000000000000000000000000001';
const drb = '0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2';
const weth = '0x4200000000000000000000000000000000000006';
const usdc = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const drbPool = '0x5116773e18a9c7bb03ebb961b38678e45e238923';
const ethPool = '0xd0b53d9277642d899df5c87a3966a349a798f224';
const pendingMessage = 'Some internal transactions within this block range have not yet been processed';
const unix = date => Date.parse(`${date}T12:00:00Z`) / 1000;
const tx = (date, block, value, fields = {}) => ({
  timeStamp: String(unix(date)), blockNumber: String(block), from: other, to: wallet,
  value: String(BigInt(value) * 10n ** 18n), isError: '0', gasUsed: '0', gasPrice: '0', ...fields,
});
const point = date => ({ date, usd: 10010, drb: 10, weth: 0, usdc: 0, eth: 10, drbPrice: 1, ethPrice: 1000 });
const legacy = () => ({
  walletAddress: wallet,
  lastUpdated: '2026-09-20T12:00:00Z', lastBlockDrb: 100, lastBlockWeth: 0,
  lastBlockUsdc: 0, lastBlockEth: 200, cumulativeDrbReceived: '10', cumulativeWethEarned: '0',
  cumulativeUsdcReceived: '0', cumulativeEthReceived: '10', totalDrbTransactions: 1,
  totalWethTransactions: 0, totalUsdcTransactions: 0, totalEthTransactions: 1,
  walletValueAllTime: [point('2026-09-18'), point('2026-09-19'), point('2026-09-20')],
  walletValueLast30Days: [],
});

function fixture(existing = null, options = {}) {
  const files = new Map();
  const outputPath = '/fixture/src/_data/wallet.json';
  if (existing) files.set(outputPath, JSON.stringify(existing));
  const originalBytes = files.get(outputPath);
  const calls = [];
  const rpcRequests = [];
  let commits = 0;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-21T12:00:00Z'])); }
    static now() { return Date.parse('2026-09-21T12:00:00Z'); }
  }
  const reply = (data, status = 200) => ({ status, ok: status === 200, json: async () => data });
  const fetch = async (input, requestOptions = {}) => {
    const url = new URL(input);
    calls.push(url);
    if (options.fetch) return options.fetch(url, requestOptions);
    if (url.hostname === 'mainnet.base.org') {
      const request = JSON.parse(requestOptions.body);
      rpcRequests.push(request);
      let result;
      if (request.method === 'eth_chainId') result = '0x2105';
      else if (request.method === 'eth_getBlockByNumber') result = { number: '0xabc', hash: `0x${'a'.repeat(64)}` };
      else if (request.method === 'eth_getBalance') result = `0x${(4n * 10n ** 18n).toString(16)}`;
      else if (request.method === 'eth_call') {
        const balances = { [drb]: 100n * 10n ** 18n, [weth]: 2n * 10n ** 18n, [usdc]: 300n * 10n ** 6n };
        const balance = balances[request.params[0].to.toLowerCase()];
        if (balance === undefined) throw new Error('Unexpected token balance request');
        result = `0x${balance.toString(16).padStart(64, '0')}`;
      } else throw new Error(`Unexpected RPC method ${request.method}`);
      const body = { jsonrpc: '2.0', id: request.id, result };
      return reply(options.rpcOverride ? options.rpcOverride(request, body, rpcRequests) : body);
    }
    if (url.hostname === 'api.dexscreener.com') {
      const pool = url.pathname.split('/').at(-1);
      const pair = pool === drbPool
        ? { chainId: 'base', pairAddress: drbPool, baseToken: { address: drb }, quoteToken: { address: weth }, priceUsd: '0.25', priceNative: '0.0001' }
        : { chainId: 'base', pairAddress: ethPool, baseToken: { address: usdc }, quoteToken: { address: weth }, priceUsd: '1', priceNative: '0.0004' };
      return reply(options.spotOverride ? options.spotOverride(pair) : { pairs: [pair] });
    }
    if (url.hostname === 'base.blockscout.com') {
      const action = url.searchParams.get('action');
      if (action === options.failAction) return reply({}, 503);
      if (action === options.statusResponse?.action) return reply(options.statusResponse.data);
      if (action === 'txlistinternal' && options.pendingInternal) {
        return reply({ status: '2', message: pendingMessage, result: [tx('2026-09-21', 999, 99)] });
      }
      const start = Number(url.searchParams.get('startblock'));
      const list = action === 'txlist' ? options.normal ?? [] : action === 'txlistinternal'
        ? options.internal ?? [] : options.tokens?.[url.searchParams.get('contractaddress').toLowerCase()] ?? [];
      return reply({ status: '1', message: 'OK', result: list.filter(t => Number(t.blockNumber) >= start) });
    }
    if (options.failPrices) return reply({}, 503);
    const dates = options.emptyPrices ? [] : options.priceDates ?? ['2026-09-19', '2026-09-20', '2026-09-21'];
    if (url.hostname === 'api.geckoterminal.com') {
      return reply({ data: { attributes: { ohlcv_list: dates.map(d => [unix(d), 1, 1, 1, options.badPrice ?? 1, 0]) } } });
    }
    if (url.hostname === 'api.kraken.com') {
      return reply({ error: [], result: { XETHZUSD: (options.ethPriceDates ?? dates).map(d => [unix(d), '1000', '1000', '1000', '1000', '1000', 1, 1]) } });
    }
    throw new Error(`Unexpected fixture URL ${url}`);
  };
  const context = vm.createContext({
    URL, Date: Clock, AbortController, join: path.join, process: { pid: 123 },
    console: { log() {}, warn() {} }, fetch,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 30000 ? ms : 0), clearTimeout,
    existsSync: file => files.has(file), readFileSync: file => files.get(file),
    writeFileSync: (file, bytes) => { files.set(file, bytes); if (file === outputPath) commits++; },
    renameSync: (from, to) => {
      if (options.failRename) throw new Error('fixture rename failure');
      files.set(to, files.get(from)); files.delete(from); commits++;
    },
    unlinkSync: file => files.delete(file),
  });
  vm.runInContext(code, context, { filename: 'fetch-wallet-data.mjs' });
  return {
    collector: context.collector, calls, rpcRequests, originalBytes,
    get bytes() { return files.get(outputPath); },
    get output() { return files.has(outputPath) ? JSON.parse(files.get(outputPath)) : null; },
    get commits() { return commits; },
  };
}

async function seeded(options = {}) {
  const run = fixture(null, {
    normal: [tx('2026-09-19', 100, 10)],
    tokens: { [drb]: [tx('2026-09-19', 100, 10)] }, ...options,
  });
  await run.collector.main();
  return run.output;
}

test('an ETH stream failure commits nothing and a retry recovers both streams', async () => {
  const initial = await seeded();
  const run = fixture(initial, { normal: [tx('2026-09-21', 200, 1)], failAction: 'txlistinternal' });
  await assert.rejects(run.collector.mainIncremental());
  assert.equal(run.commits, 0);
  assert.equal(run.bytes, run.originalBytes);
  const retry = fixture(run.output, { normal: [tx('2026-09-21', 200, 1)], internal: [tx('2026-09-21', 150, 2)] });
  await retry.collector.mainIncremental();
  assert.equal(retry.output.walletValueAllTime.at(-1).eth, 13);
});

test('backdated ETH and token deltas update every later valuation', async () => {
  const run = fixture(await seeded(), {
    internal: [tx('2026-09-19', 151, 2)], tokens: { [drb]: [tx('2026-09-19', 151, 2)] },
  });
  await run.collector.mainIncremental();
  assert.deepEqual(run.output.walletValueAllTime.map(p => [p.drb, p.eth]), [[12, 12], [12, 12], [12, 12]]);
});

test('balances carry through dates missing either required price', () => {
  const { buildValueHistory } = fixture().collector;
  for (const ethPrices of [{ '2026-09-19': 1000, '2026-09-21': 1000 }, { '2026-09-21': 1000 }]) {
    const history = buildValueHistory(
      { '2026-09-18': 10, '2026-09-20': 20 }, {}, {}, {},
      { '2026-09-19': 1, '2026-09-21': 1 }, ethPrices,
    );
    assert.equal(history.at(-1).drb, 20);
  }
});

test('reverted outgoing ETH transactions pay gas and L1 fees without sending value', () => {
  const result = fixture().collector.buildCumulativeEthBalanceMap([
    tx('2026-09-19', 1, 1), tx('2026-09-20', 2, 5, {
      from: wallet, to: other, isError: '1', gasUsed: '21000', gasPrice: '1000000000', l1Fee: '100000000000000',
    }),
  ], []);
  assert.equal(Object.values(result.cumByDate).at(-1), 0.999879);
  assert.equal(result.totalIn, 10n ** 18n);
});

test('successful outgoing ETH transactions include the supplied L1 fee', () => {
  const result = fixture().collector.buildCumulativeEthBalanceMap([
    tx('2026-09-19', 1, 1), tx('2026-09-20', 2, 0, {
      from: wallet, to: other, gasUsed: '21000', gasPrice: '1000000000', l1Fee: '100000000000000',
    }),
  ], []);
  assert.equal(Object.values(result.cumByDate).at(-1), 0.999879);
});

test('self-transfers conserve tokens and exclude self from cumulative incoming totals', () => {
  const { buildCumulativeBalanceMap } = fixture().collector;
  const result = buildCumulativeBalanceMap([tx('2026-09-19', 1, 10), tx('2026-09-20', 2, 5, { from: wallet })]);
  assert.equal(Object.values(result.cumByDate).at(-1), 10);
  assert.equal(result.totalIn, 10n * 10n ** 18n);
  assert.equal(result.countIn, 1);
});

test('normal and internal ETH self-transfers only debit normal transaction fees', () => {
  const result = fixture().collector.buildCumulativeEthBalanceMap([
    tx('2026-09-19', 1, 10), tx('2026-09-20', 2, 5, { from: wallet, gasUsed: '21000', gasPrice: '1000000000' }),
  ], [tx('2026-09-20', 3, 5, { from: wallet })]);
  assert.equal(Object.values(result.cumByDate).at(-1), 9.999979);
  assert.equal(result.totalIn, 10n * 10n ** 18n);
  assert.equal(result.countIn, 1);
});

for (const mode of ['main', 'mainIncremental']) {
  for (const failure of ['failPrices', 'emptyPrices']) {
    test(`${mode} preserves the original bytes and timestamp when ${failure}`, async () => {
      const run = fixture(await seeded(), {
        normal: [tx('2026-09-19', 100, 10)], tokens: { [drb]: [tx('2026-09-19', 100, 10)] },
        [failure]: true,
      });
      await assert.rejects(run.collector[mode]());
      assert.equal(run.commits, 0);
      assert.equal(run.bytes, run.originalBytes);
    });
  }
}

test('malformed or non-overlapping fresh prices cannot publish a snapshot', async () => {
  for (const options of [{ badPrice: -1 }, { ethPriceDates: ['2026-09-18'] }]) {
    const run = fixture(await seeded(), options);
    await assert.rejects(run.collector.mainIncremental());
    assert.equal(run.bytes, run.originalBytes);
  }
});

test('repeated sub-display ETH deposits survive process restarts exactly', async () => {
  let snapshot = await seeded({ normal: [] });
  for (let n = 0; n < 5; n++) {
    const run = fixture(snapshot, { internal: [tx('2026-09-21', 101 + n, 0, { value: '40000000000000' })] });
    await run.collector.mainIncremental();
    snapshot = run.output;
  }
  assert.equal(snapshot.walletValueAllTime.at(-1).eth, 0.0002);
  assert.equal(snapshot.cumulativeEthReceived, '0.0002');
});

test('incoming token totals retain every atomic unit across restarts', async () => {
  const initial = await seeded({ tokens: { [drb]: [tx('2026-09-19', 1, 0, { value: '1000000000000000001' })] } });
  const run = fixture(initial, { tokens: { [drb]: [tx('2026-09-20', 2, 0, { value: '1' })] } });
  await run.collector.mainIncremental();
  assert.equal(run.output.cumulativeDrbReceived, '1.000000000000000002');
});

test('legacy snapshots rebuild from genesis and retain valid older prices', async () => {
  const run = fixture(legacy(), {
    normal: [tx('2026-09-18', 100, 10), tx('2026-09-20', 200, 0)], internal: [tx('2026-09-19', 150, 2)],
    tokens: { [drb]: [tx('2026-09-18', 100, 10)] }, priceDates: ['2026-09-21'],
  });
  await run.collector.mainIncremental();
  assert.equal(run.output.walletValueAllTime.at(-1).eth, 12);
  assert.deepEqual(run.output.walletValueAllTime.map(p => p.date), ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']);
  assert.equal(run.calls.filter(u => u.hostname === 'base.blockscout.com').every(u => u.searchParams.get('startblock') === '0'), true);
  const next = fixture(run.output);
  await next.collector.mainIncremental();
  assert.equal(next.output.walletValueAllTime.at(-1).eth, 12);
});

test('full rebuild retains historical prices outside the provider return window', async () => {
  const run = fixture(legacy(), {
    normal: [tx('2026-09-18', 200, 1)], tokens: { [drb]: [tx('2026-09-18', 100, 10)] },
    priceDates: ['2026-09-21'],
  });
  await run.collector.main();
  assert.deepEqual(run.output.walletValueAllTime.map(p => p.date), ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']);
});

test('a failed atomic replacement leaves the previous snapshot untouched', async () => {
  const run = fixture(await seeded(), { failRename: true });
  await assert.rejects(run.collector.mainIncremental(), /rename failure/);
  assert.equal(run.bytes, run.originalBytes);
  assert.equal(run.commits, 0);
});

test('carried chart rows retain their valuation date and seed from before the window', () => {
  const result = fixture().collector.last30DaysFrom([point('2026-08-01')]);
  assert.equal(result.length, 30);
  assert.equal(result.at(-1).date, '2026-09-21');
  assert.equal(result.at(-1).valuationDate, '2026-08-01');
  assert.equal(result.at(-1).carriedForward, true);
});

test('the request timeout includes reading the response body', async () => {
  const run = fixture(null, { fetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  await assert.rejects(run.collector.fetchWithRetry('https://fixture.invalid', {}, { retries: 0, timeoutMs: 5 }), /timed out/i);
});

test('incomplete transfer history cannot silently clamp a negative balance to zero', async () => {
  const run = fixture(legacy(), {
    normal: [tx('2026-09-19', 200, 10)],
    tokens: { [drb]: [tx('2026-09-20', 200, 5, { from: wallet, to: other })] },
  });
  await assert.rejects(run.collector.main(), /negative.*balance/i);
  assert.equal(run.bytes, run.originalBytes);
});

test('normal ETH progress never skips a slower internal stream on a successful run', async () => {
  const first = fixture(await seeded(), { normal: [tx('2026-09-21', 200, 1)] });
  await first.collector.mainIncremental();
  const second = fixture(first.output, { internal: [tx('2026-09-21', 150, 2)] });
  await second.collector.mainIncremental();
  assert.equal(second.output.walletValueAllTime.at(-1).eth, 13);
});

test('malformed exact ledger data cannot reset an asset to zero', async () => {
  const snapshot = await seeded();
  snapshot.ledger.drb.dailyNet = 42;
  const run = fixture(snapshot);
  await assert.rejects(run.collector.mainIncremental(), /ledger/i);
  assert.equal(run.bytes, run.originalBytes);
});

test('successful collection distinguishes collection time from the latest valuation date', async () => {
  const run = fixture(null, { normal: [tx('2026-09-19', 1, 1)], priceDates: ['2026-09-19'] });
  await run.collector.main();
  assert.equal(run.output.lastUpdated, '2026-09-21T12:00:00.000Z');
  assert.equal(run.output.priceAsOfDate, '2026-09-19');
  assert.equal(run.output.walletValueAllTime.at(-1).date, '2026-09-19');
  assert.equal(run.output.walletValueLast30Days.at(-1).valuationDate, '2026-09-19');
});

test('missing L1 fee coverage survives restarts and distinguishes a supplied zero fee', async () => {
  const initial = await seeded();
  const missing = fixture(initial, { normal: [tx('2026-09-20', 101, 5, {
    from: wallet, to: other, isError: '1', gasUsed: '21000', gasPrice: '1000000000',
  })] });
  await missing.collector.mainIncremental();
  assert.equal(missing.output.accountingCoverage?.missingL1FeeTransactions, 1);
  assert.equal(missing.output.accountingCoverage.chainBalancesReconciled, false);
  assert.match(missing.output.accountingCoverage.note, /omitted.*L1.*fees/i);
  const next = fixture(missing.output, { normal: [tx('2026-09-21', 102, 0, {
    from: wallet, to: other, gasUsed: '21000', gasPrice: '1000000000', l1Fee: '0',
  })] });
  await next.collector.mainIncremental();
  assert.equal(next.output.accountingCoverage.missingL1FeeTransactions, 1);
  assert.equal(next.output.walletValueAllTime.at(-1).eth, 10);
  assert.equal(next.output.ledger.eth.dailyNet['2026-09-20'], '-21000000000000');
  assert.equal(next.output.ledger.eth.dailyNet['2026-09-21'], '-21000000000000');
});

test('empty successful history cannot erase the recorded production legacy anchor', async () => {
  const snapshot = { ...legacy(), lastBlockDrb: 51580414 };
  snapshot.walletValueAllTime.at(-1).usd = 657261.15;
  for (const mode of ['mainIncremental', 'main']) {
    const run = fixture(snapshot);
    await assert.rejects(run.collector[mode](), /history.*checkpoint/i);
    assert.equal(run.commits, 0);
    assert.equal(run.bytes, run.originalBytes);
  }
});

function completeHistory() {
  return {
    tokens: {
      [drb]: [tx('2026-09-19', 100, 10)],
      [weth]: [tx('2026-09-19', 110, 1)],
      [usdc]: [tx('2026-09-19', 120, 0, { value: '1000000' })],
    },
    normal: [tx('2026-09-19', 200, 10)], internal: [tx('2026-09-19', 150, 2)],
  };
}

for (const [asset, contract, cursor] of [['DRB', drb, 100], ['WETH', weth, 110], ['USDC', usdc, 120]]) {
  test(`positive but truncated ${asset} replay preserves the legacy snapshot`, async () => {
    const history = completeHistory();
    history.tokens[contract][0].blockNumber = String(cursor - 1);
    const snapshot = { ...legacy(), lastBlockWeth: 110, lastBlockUsdc: 120 };
    const run = fixture(snapshot, history);
    await assert.rejects(run.collector.mainIncremental(), /history.*checkpoint/i);
    assert.equal(run.commits, 0);
    assert.equal(run.bytes, run.originalBytes);
  });
}

test('positive but truncated native ETH replay preserves the legacy shared checkpoint', async () => {
  const history = completeHistory();
  history.normal[0].blockNumber = '199';
  const run = fixture({ ...legacy(), lastBlockWeth: 110, lastBlockUsdc: 120 }, history);
  await assert.rejects(run.collector.mainIncremental(), /history.*checkpoint/i);
  assert.equal(run.bytes, run.originalBytes);
});

for (const stream of ['normal', 'internal']) {
  test(`explicit full rebuild preserves the exact ledger's ${stream} ETH checkpoint`, async () => {
    const initial = await seeded(completeHistory());
    const history = completeHistory();
    history[stream][0].blockNumber = String(Number(history[stream][0].blockNumber) - 1);
    const run = fixture(initial, history);
    await assert.rejects(run.collector.main(), /history.*checkpoint/i);
    assert.equal(run.bytes, run.originalBytes);
  });
}

test('complete full replay reaches every known checkpoint and can replace the snapshot', async () => {
  const first = fixture({ ...legacy(), lastBlockWeth: 110, lastBlockUsdc: 120 }, completeHistory());
  await first.collector.mainIncremental();
  assert.equal(first.output.walletValueAllTime.at(-1).usd, 13011);
  const replay = fixture(first.output, completeHistory());
  await replay.collector.main();
  assert.equal(replay.commits, 1);
  assert.equal(replay.output.walletValueAllTime.at(-1).usd, 13011);
  assert.equal(replay.output.ledger.eth.lastNormalBlock, 200);
  assert.equal(replay.output.ledger.eth.lastInternalBlock, 150);
});

test('current snapshot reads all balances at one verified Base block and converts quote-token USD prices', async () => {
  const run = fixture();
  await run.collector.main();
  const current = run.output.currentSnapshot;
  assert.ok(current, 'a current snapshot is published with complete historical collection');
  assert.equal(current.source, 'Base RPC');
  assert.equal(current.blockNumber, 2748);
  assert.equal(current.blockHash, `0x${'a'.repeat(64)}`);
  assert.equal(current.date, '2026-09-21');
  assert.equal(current.observedAt, '2026-09-21T12:00:00.000Z');
  assert.deepEqual(current.rawBalances, { drb: '100000000000000000000', weth: '2000000000000000000', usdc: '300000000', eth: '4000000000000000000' });
  assert.deepEqual([current.drb, current.weth, current.usdc, current.eth, current.drbPrice, current.ethPrice, current.usd], [100, 2, 300, 4, 0.25, 2500, 15325]);
  const balanceRequests = run.rpcRequests.filter(r => ['eth_getBalance', 'eth_call'].includes(r.method));
  assert.equal(balanceRequests.length, 4);
  assert.equal(balanceRequests.every(r => r.params[1] === '0xabc'), true);
  assert.equal(balanceRequests.filter(r => r.method === 'eth_call').every(r => r.params[0].data === `0x70a08231${wallet.slice(2).padStart(64, '0')}`), true);
  assert.equal(run.output.historyStatus.state, 'updated');
  assert.equal(run.commits, 1);
});

test('explicit pending internal indexing publishes current balances while preserving every saved historical field', async () => {
  const initial = legacy();
  const run = fixture(initial, { pendingInternal: true, ...completeHistory() });
  await run.collector.mainIncremental();
  const { currentSnapshot, historyStatus, ...retained } = run.output;
  assert.deepEqual(retained, initial);
  assert.equal(currentSnapshot.usd, 15325);
  assert.deepEqual(historyStatus, {
    state: 'pending', checkedAt: '2026-09-21T12:00:00.000Z',
    reason: 'Blockscout is still indexing internal transactions. Saved history has been retained.',
  });
  assert.equal(run.commits, 1);
});

test('a successful retry after pending indexing uses the unchanged ledger checkpoints', async () => {
  const initial = await seeded(completeHistory());
  const pending = fixture(initial, { pendingInternal: true, normal: [tx('2026-09-21', 300, 1)] });
  await pending.collector.mainIncremental();
  assert.deepEqual(pending.output.ledger, initial.ledger);
  assert.equal(pending.output.lastUpdated, initial.lastUpdated);
  const retry = fixture(pending.output, { normal: [tx('2026-09-21', 300, 1)], internal: [tx('2026-09-21', 250, 2)] });
  await retry.collector.mainIncremental();
  assert.equal(retry.output.historyStatus.state, 'updated');
  assert.equal(retry.output.walletValueAllTime.at(-1).eth, 15);
  assert.equal(retry.calls.find(u => u.searchParams.get('action') === 'txlist').searchParams.get('startblock'), '201');
  assert.equal(retry.calls.find(u => u.searchParams.get('action') === 'txlistinternal').searchParams.get('startblock'), '151');
});

test('pending indexing without usable saved wallet history cannot publish partial data', async () => {
  for (const initial of [null, { ...legacy(), walletValueAllTime: [] }, { ...legacy(), walletAddress: other }]) {
    const run = fixture(initial, { pendingInternal: true });
    await assert.rejects(run.collector.mainIncremental());
    assert.equal(run.commits, 0);
    assert.equal(run.bytes, run.originalBytes);
  }
});

test('only a well-formed explicit internal-indexing response permits retaining history', async () => {
  for (const response of [
    { action: 'txlistinternal', data: { status: '2', message: pendingMessage, result: {} } },
    { action: 'txlistinternal', data: { status: '2', message: 'Unknown error', result: [] } },
    { action: 'txlist', data: { status: '2', message: pendingMessage, result: [] } },
  ]) {
    const run = fixture(legacy(), { statusResponse: response });
    await assert.rejects(run.collector.mainIncremental(), /Blockscout.*(txlist|txlistinternal).*status.*2/);
    assert.equal(run.bytes, run.originalBytes);
  }
});

test('RPC errors, missing balances, mismatched IDs, wrong chain and changed block hashes preserve saved data', async () => {
  const mutations = [
    (r, b) => r.method === 'eth_call' ? { ...b, error: { code: -32000, message: 'unavailable' } } : b,
    (r, b) => r.method === 'eth_getBalance' ? { jsonrpc: b.jsonrpc, id: b.id } : b,
    (r, b) => ({ ...b, id: r.id + 1 }),
    (r, b) => r.method === 'eth_chainId' ? { ...b, result: '0x1' } : b,
    (r, b) => r.method === 'eth_call' ? { ...b, result: '0xnothex' } : b,
    (r, b) => r.method === 'eth_getBlockByNumber' && r.params[0] !== 'latest' ? { ...b, result: { ...b.result, hash: `0x${'b'.repeat(64)}` } } : b,
  ];
  for (const rpcOverride of mutations) {
    const run = fixture(legacy(), { ...completeHistory(), rpcOverride });
    await assert.rejects(run.collector.mainIncremental());
    assert.equal(run.commits, 0);
    assert.equal(run.bytes, run.originalBytes);
  }
});

test('missing, unrelated or invalid current prices cannot publish a snapshot', async () => {
  for (const mutate of [
    () => ({ pairs: [] }),
    p => ({ pairs: [{ ...p, chainId: 'ethereum' }] }),
    p => ({ pairs: [{ ...p, pairAddress: other }] }),
    p => ({ pairs: [{ ...p, baseToken: { address: other }, quoteToken: { address: other } }] }),
    p => ({ pairs: [{ ...p, priceUsd: 'NaN' }] }),
    p => ({ pairs: [{ ...p, priceUsd: '0' }] }),
  ]) {
    const run = fixture(legacy(), { ...completeHistory(), spotOverride: mutate });
    await assert.rejects(run.collector.mainIncremental());
    assert.equal(run.commits, 0);
    assert.equal(run.bytes, run.originalBytes);
  }
});

test('ERC-20 RPC balances must contain a complete ABI uint256 result', async () => {
  const run = fixture(legacy(), {
    ...completeHistory(),
    rpcOverride: (request, body) => request.method === 'eth_call' ? { ...body, result: '0x1' } : body,
  });
  await assert.rejects(run.collector.mainIncremental(), /balance.*hex/i);
  assert.equal(run.bytes, run.originalBytes);
});

test('pending-indexer fallback cannot bypass current balance or spot price failures', async () => {
  for (const options of [
    { rpcOverride: (request, body) => request.method === 'eth_getBalance' ? { ...body, error: { message: 'balance unavailable' } } : body },
    { spotOverride: () => ({ pairs: [] }) },
  ]) {
    const run = fixture(legacy(), { pendingInternal: true, ...options });
    await assert.rejects(run.collector.mainIncremental());
    assert.equal(run.commits, 0);
    assert.equal(run.bytes, run.originalBytes);
  }
});
