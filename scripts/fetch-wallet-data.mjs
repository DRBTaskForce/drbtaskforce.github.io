#!/usr/bin/env node
/**
 * Fetches $DRB, WETH, USDC, and native ETH fee wallet data + historical prices,
 * writes to src/_data/wallet.json. No API key required.
 *
 * Data sources:
 *   - Blockscout Base API  — wallet transfer history
 *   - GeckoTerminal API    — DRB/WETH daily price history
 *   - Kraken public API    — ETH/USD daily price history
 *
 * Usage:
 *   node scripts/fetch-wallet-data.mjs             # full historical rebuild
 *   node scripts/fetch-wallet-data.mjs --incremental  # fast daily update (new transfers + last 8 days of prices)
 */

import { writeFileSync, readFileSync, existsSync, renameSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WALLET_ADDRESS = "0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9";
const DRB_CONTRACT   = "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2";
const WETH_CONTRACT  = "0x4200000000000000000000000000000000000006";
const USDC_CONTRACT  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DRB_POOL       = "0x5116773e18a9c7bb03ebb961b38678e45e238923"; // DRB/WETH pool on Base
const TOKEN_DECIMALS = 18;
const USDC_DECIMALS  = 6;
const BLOCKSCOUT_API = "https://base.blockscout.com/api";
const OUTPUT_PATH    = join(__dirname, "../src/_data/wallet.json");

// ---------------------------------------------------------------------------
// Resilient fetch — retries transient 5xx / 429 / network errors with
// exponential backoff + jitter. Permanent errors (4xx) are returned as-is so
// the existing `if (!res.ok) throw` checks still surface them.
// ---------------------------------------------------------------------------

async function fetchWithRetry(url, options = {}, { retries = 5, baseDelay = 1000, timeoutMs = 30000 } = {}) {
  const label = typeof url === "string" ? url : url.toString();
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      // Read JSON inside the deadline: receiving headers alone is not completion.
      const res = await Promise.race([
        (async () => {
          const response = await fetch(url, { ...options, signal: controller.signal });
          const body = response.ok ? await response.json() : null;
          if (!response.ok) await response.body?.cancel();
          return { ok: response.ok, status: response.status, json: async () => body };
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`Request timed out after ${timeoutMs}ms: ${label}`));
          }, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        const delay = baseDelay * 2 ** attempt + Math.floor(Math.random() * 500);
        console.warn(`HTTP ${res.status} from ${label} — retry ${attempt + 1}/${retries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        const delay = baseDelay * 2 ** attempt + Math.floor(Math.random() * 500);
        console.warn(`Fetch failed for ${label}: ${err.message} — retry ${attempt + 1}/${retries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Blockscout rate-limited fetch — enforces a minimum gap between requests,
// then delegates to fetchWithRetry for 5xx/429/network resilience.
// ---------------------------------------------------------------------------

const BLOCKSCOUT_MIN_GAP_MS = 500;
let lastBlockscoutCallAt = 0;

async function blockscoutFetch(url) {
  const gap = BLOCKSCOUT_MIN_GAP_MS - (Date.now() - lastBlockscoutCallAt);
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  lastBlockscoutCallAt = Date.now();
  return fetchWithRetry(url);
}

// ---------------------------------------------------------------------------
// Blockscout — token transfer history
// ---------------------------------------------------------------------------

async function fetchAllTransfers(contractAddress, fromBlock = 0) {
  const transfers = [];
  const pageSize = 10000;
  let page = 1;

  while (true) {
    const url = new URL(BLOCKSCOUT_API);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("contractaddress", contractAddress);
    url.searchParams.set("address", WALLET_ADDRESS);
    url.searchParams.set("startblock", fromBlock);
    url.searchParams.set("endblock", "latest");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("offset", pageSize);
    url.searchParams.set("page", page);

    const res = await blockscoutFetch(url.toString());
    if (!res.ok) throw new Error(`Blockscout HTTP error: ${res.status}`);
    const data = await res.json();

    if (data.status === "0") {
      if (data.message === "No transactions found" || data.message === "No token transfers found") break;
      throw new Error(`Blockscout API error: ${data.message} — ${data.result}`);
    }

    if (data.status !== "1" || !Array.isArray(data.result)) throw new Error("Invalid Blockscout transfer response");
    transfers.push(...data.result);
    if (data.result.length < pageSize) break;
    page++;
  }

  return transfers;
}

// ---------------------------------------------------------------------------
// Blockscout — native ETH transaction history
// ---------------------------------------------------------------------------

async function fetchAllEthTxs(action, fromBlock = 0) {
  const txs = [];
  const pageSize = 10000;
  let page = 1;

  while (true) {
    const url = new URL(BLOCKSCOUT_API);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", action); // "txlist" or "txlistinternal"
    url.searchParams.set("address", WALLET_ADDRESS);
    url.searchParams.set("startblock", fromBlock);
    url.searchParams.set("endblock", "latest");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("offset", pageSize);
    url.searchParams.set("page", page);

    const res = await blockscoutFetch(url.toString());
    if (!res.ok) throw new Error(`Blockscout HTTP error: ${res.status}`);
    const data = await res.json();

    if (data.status === "0") {
      if (data.message === "No transactions found") break;
      throw new Error(`Blockscout API error: ${data.message} — ${data.result}`);
    }

    if (data.status !== "1" || !Array.isArray(data.result)) throw new Error("Invalid Blockscout transaction response");
    txs.push(...data.result);
    if (data.result.length < pageSize) break;
    page++;
  }

  return txs;
}

// ---------------------------------------------------------------------------
// Price history
// ---------------------------------------------------------------------------

/**
 * GeckoTerminal daily OHLCV for the DRB/WETH pool.
 * Returns {date → priceUsd} map (close price — GeckoTerminal returns USD).
 */
async function fetchDrbPriceHistory(limit = 1000) {
  const url = `https://api.geckoterminal.com/api/v2/networks/base/pools/${DRB_POOL}/ohlcv/day?limit=${limit}`;
  const res = await fetchWithRetry(url, { headers: { Accept: "application/json;version=20230302" } });
  if (!res.ok) throw new Error(`GeckoTerminal HTTP error: ${res.status}`);
  const data = await res.json();
  const candles = data.data?.attributes?.ohlcv_list ?? [];

  const result = {};
  for (const [ts, , , , close] of candles) {
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    result[date] = close; // DRB price in USD (GeckoTerminal OHLCV returns USD)
  }
  validatePrices(result, "DRB");
  return result;
}

/**
 * Kraken public API — ETH/USD daily close prices.
 * No API key required. Returns {date → priceUsd} map.
 */
async function fetchEthPriceHistory(days = 400) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const url = `https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1440&since=${since}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Kraken HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.error?.length) throw new Error(`Kraken API error: ${data.error.join(", ")}`);

  const candles = data.result?.XETHZUSD ?? data.result?.ETHUSD ?? [];
  const result = {};
  for (const [ts, , , , close] of candles) {
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    result[date] = Number(close);
  }
  validatePrices(result, "ETH");
  return result;
}

// ---------------------------------------------------------------------------
// Exact accounting. Chart rows are presentation only; never use their rounded
// balances or decimal totals as the opening state for a later run.
// ---------------------------------------------------------------------------

const LEDGER_VERSION = 1;

function toDateString(unixTimestamp) {
  return new Date(Number(unixTimestamp) * 1000).toISOString().slice(0, 10);
}

function formatUnits(rawValue, decimals = TOKEN_DECIMALS) {
  const big = BigInt(rawValue);
  const magnitude = big < 0n ? -big : big;
  const divisor = 10n ** BigInt(decimals);
  const fraction = (magnitude % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${big < 0n ? "-" : ""}${magnitude / divisor}${fraction ? `.${fraction}` : ""}`;
}

function addDelta(dailyNet, date, value) {
  dailyNet[date] = (dailyNet[date] ?? 0n) + value;
}

function cumulativeFromDeltas(dailyNet, decimals = TOKEN_DECIMALS) {
  const cumByDate = {};
  const sortedDates = Object.keys(dailyNet).sort();
  let balance = 0n;
  for (const date of sortedDates) {
    balance += BigInt(dailyNet[date]);
    if (balance < 0n) throw new Error(`Negative wallet balance on ${date}; transfer history is incomplete or inconsistent`);
    cumByDate[date] = Number(formatUnits(balance, decimals));
  }
  return { cumByDate, sortedDates, balance };
}

function buildCumulativeBalanceMap(transfers, incomingOnly = false, decimals = TOKEN_DECIMALS, replay = true) {
  const dailyNet = {};
  let totalIn = 0n, countIn = 0;
  for (const tx of transfers) {
    if (tx.isError === "1") continue;
    const date = toDateString(tx.timeStamp);
    const value = BigInt(tx.value);
    const incoming = tx.to?.toLowerCase() === WALLET_ADDRESS;
    const outgoing = tx.from?.toLowerCase() === WALLET_ADDRESS;
    // A self-transfer has two equal legs and is not external income.
    if (incoming && !outgoing) { totalIn += value; countIn++; }
    if (incoming && (!incomingOnly || !outgoing)) addDelta(dailyNet, date, value);
    if (outgoing && !incomingOnly) addDelta(dailyNet, date, -value);
  }
  return { dailyNet, totalIn, countIn, ...(replay ? cumulativeFromDeltas(dailyNet, decimals) : {}) };
}

function buildCumulativeEthBalanceMap(normalTxs, internalTxs, replay = true) {
  const dailyNet = {};
  let totalIn = 0n, countIn = 0;
  let missingL1FeeTransactions = 0;
  function applyValue(tx) {
    if (tx.isError === "1" || tx.txreceipt_status === "0") return;
    const date = toDateString(tx.timeStamp);
    const value = BigInt(tx.value || "0");
    const incoming = tx.to?.toLowerCase() === WALLET_ADDRESS;
    const outgoing = tx.from?.toLowerCase() === WALLET_ADDRESS;
    if (incoming && !outgoing && value > 0n) { totalIn += value; countIn++; }
    if (incoming) addDelta(dailyNet, date, value);
    if (outgoing) addDelta(dailyNet, date, -value);
  }
  for (const tx of normalTxs) {
    applyValue(tx);
    if (tx.from?.toLowerCase() === WALLET_ADDRESS) {
      // Failed execution still pays fees. Base's supplied L1 fee is separate
      // from execution gas. If the provider omits it we cannot infer it.
      const gasCost = BigInt(tx.gasUsed || "0") * BigInt(tx.gasPrice || "0");
      const l1Fee = BigInt(tx.l1Fee || "0");
      if (tx.l1Fee == null || tx.l1Fee === "") missingL1FeeTransactions++;
      addDelta(dailyNet, toDateString(tx.timeStamp), -gasCost - l1Fee);
    }
  }
  for (const tx of internalTxs) applyValue(tx);
  return { dailyNet, totalIn, countIn, missingL1FeeTransactions, ...(replay ? cumulativeFromDeltas(dailyNet) : {}) };
}

function mergeAsset(previous, delta, decimals = TOKEN_DECIMALS) {
  const dailyNet = Object.fromEntries(Object.entries(previous?.dailyNet ?? {}).map(([date, raw]) => [date, BigInt(raw)]));
  for (const [date, raw] of Object.entries(delta.dailyNet)) addDelta(dailyNet, date, raw);
  const cumulative = cumulativeFromDeltas(dailyNet, decimals);
  return {
    ...cumulative,
    dailyNet: Object.fromEntries(Object.entries(dailyNet).sort(([a], [b]) => a.localeCompare(b)).map(([date, raw]) => [date, String(raw)])),
    totalIn: String(BigInt(previous?.totalIn ?? "0") + delta.totalIn),
    countIn: (previous?.countIn ?? 0) + delta.countIn,
  };
}

function persistedAsset(asset, cursors) {
  return { dailyNet: asset.dailyNet, totalIn: asset.totalIn, countIn: asset.countIn, ...cursors };
}

function maxBlock(txs, initial = 0) {
  return txs.reduce((max, tx) => {
    const block = Number(tx.blockNumber);
    if (!Number.isSafeInteger(block) || block < 0) throw new Error("Invalid transaction block number");
    return Math.max(max, block);
  }, initial);
}

function validateReplayCoverage(existing, streams) {
  if (!existing) return;
  function requireCheckpoint(label, transactions, checkpoint) {
    if (checkpoint === undefined) return;
    if (!Number.isSafeInteger(checkpoint) || checkpoint < 0) throw new Error(`Invalid saved ${label} history checkpoint`);
    const reached = maxBlock(transactions);
    if (reached < checkpoint) {
      throw new Error(`Incomplete ${label} history: saved checkpoint ${checkpoint} was not reached (latest ${reached}); previous snapshot retained`);
    }
  }
  // Empty-success and truncated API replies are not a valid replacement for
  // history we already observed. Check both public and exact-ledger anchors.
  for (const [asset, field] of [["drb", "lastBlockDrb"], ["weth", "lastBlockWeth"], ["usdc", "lastBlockUsdc"]]) {
    requireCheckpoint(asset.toUpperCase(), streams[asset], existing[field]);
    requireCheckpoint(asset.toUpperCase(), streams[asset], existing.ledger?.[asset]?.lastBlock);
  }
  requireCheckpoint("ETH", [...streams.normal, ...streams.internal], existing.lastBlockEth);
  requireCheckpoint("normal ETH", streams.normal, existing.ledger?.eth?.lastNormalBlock);
  requireCheckpoint("internal ETH", streams.internal, existing.ledger?.eth?.lastInternalBlock);
}

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

function validateLedger(ledger) {
  if (ledger.version !== LEDGER_VERSION) throw new Error("Unsupported wallet ledger version; run a full rebuild");
  for (const key of ["drb", "weth", "usdc", "eth"]) {
    const asset = ledger[key];
    if (!asset || !asset.dailyNet || typeof asset.dailyNet !== "object" || Array.isArray(asset.dailyNet)
      || typeof asset.totalIn !== "string" || !/^\d+$/.test(asset.totalIn)
      || !Number.isSafeInteger(asset.countIn) || asset.countIn < 0) throw new Error(`Invalid ${key} ledger`);
    for (const [date, raw] of Object.entries(asset.dailyNet)) {
      if (!validDate(date) || typeof raw !== "string" || !/^-?\d+$/.test(raw)) throw new Error(`Invalid ${key} ledger delta`);
    }
    for (const cursor of key === "eth" ? ["lastNormalBlock", "lastInternalBlock"] : ["lastBlock"]) {
      if (!Number.isSafeInteger(asset[cursor]) || asset[cursor] < 0) throw new Error(`Invalid ${key} ledger cursor`);
    }
    if (key === "eth" && (!Number.isSafeInteger(asset.missingL1FeeTransactions) || asset.missingL1FeeTransactions < 0)) {
      throw new Error("Invalid ETH ledger fee coverage");
    }
  }
}

// ---------------------------------------------------------------------------
// Prices and chart projections
// ---------------------------------------------------------------------------

function validPrice(price) { return typeof price === "number" && Number.isFinite(price) && price > 0; }

function validatePrices(prices, label) {
  if (!Object.keys(prices).length || Object.entries(prices).some(([date, price]) => !validDate(date) || !validPrice(price))) {
    throw new Error(`${label} price feed is empty or invalid`);
  }
}

function buildValueHistory(drbCumByDate, wethCumByDate, usdcCumByDate, ethCumByDate, drbPriceUsd, ethPriceUsd) {
  const balances = [drbCumByDate, wethCumByDate, usdcCumByDate, ethCumByDate];
  const dates = balances.map(map => Object.keys(map).sort());
  const indices = [0, 0, 0, 0], latest = [0, 0, 0, 0];
  const history = [];
  for (const date of Object.keys(drbPriceUsd).sort()) {
    if (!validPrice(drbPriceUsd[date]) || !validPrice(ethPriceUsd[date])) continue;
    for (let i = 0; i < balances.length; i++) {
      while (indices[i] < dates[i].length && dates[i][indices[i]] <= date) {
        latest[i] = balances[i][dates[i][indices[i]++]];
      }
    }
    const [drb, weth, usdc, eth] = latest;
    const drbPrice = drbPriceUsd[date], ethPrice = ethPriceUsd[date];
    const usd = drb * drbPrice + weth * ethPrice + usdc + eth * ethPrice;
    if (!Number.isFinite(usd)) throw new Error("Invalid wallet valuation");
    history.push({
      date, usd: Math.round(usd * 100) / 100, drb: Math.round(drb),
      weth: Math.round(weth * 10000) / 10000, usdc: Math.round(usdc * 100) / 100,
      eth: Math.round(eth * 10000) / 10000, drbPrice, ethPrice: Math.round(ethPrice * 100) / 100,
    });
  }
  return history;
}

function last30DaysFrom(fullHistory) {
  const sorted = [...fullHistory].sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const result = [];
  let index = 0, last = null;
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    const date = day.toISOString().slice(0, 10);
    while (index < sorted.length && sorted[index].date <= date) last = sorted[index++];
    if (last) result.push({ ...last, date, valuationDate: last.date, carriedForward: last.date !== date });
  }
  return result;
}

function savedPrices(existing) {
  const drb = {}, eth = {};
  // The historical price window may be longer than the providers still serve.
  // Preserve prices, but never preserve the old, possibly corrupted balances.
  for (const row of existing?.walletValueAllTime ?? []) {
    if (validDate(row.date) && validPrice(row.drbPrice) && validPrice(row.ethPrice)) {
      drb[row.date] = row.drbPrice;
      eth[row.date] = row.ethPrice;
    }
  }
  for (const [asset, target] of [["drb", drb], ["eth", eth]]) {
    for (const [date, price] of Object.entries(existing?.priceHistory?.[asset] ?? {})) {
      if (validDate(date) && validPrice(price)) target[date] = price;
    }
  }
  return { drb, eth };
}

function writeSnapshot(output) {
  const temporary = `${OUTPUT_PATH}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(output, null, 2) + "\n");
    renameSync(temporary, OUTPUT_PATH);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

// ---------------------------------------------------------------------------
// Collection is a transaction: all transfers and both prices must succeed.
// Legacy data has no exact ledger; its first incremental run must replay all
// history to recover skipped intervals. Rounded chart balances cannot repair it.
// ---------------------------------------------------------------------------

async function collect(incremental) {
  const existing = existsSync(OUTPUT_PATH) ? JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) : null;
  if (existing?.walletAddress && existing.walletAddress.toLowerCase() !== WALLET_ADDRESS) throw new Error("Existing snapshot belongs to another wallet");
  const previous = incremental ? existing?.ledger : null;
  if (previous) validateLedger(previous);
  if (incremental && !previous) console.log("No exact ledger — rebuilding full transfer history and retaining historical prices.");
  const from = (asset, cursor = "lastBlock") => previous ? previous[asset][cursor] + 1 : 0;

  // Sequential Blockscout calls respect rate limits. No partial result is saved.
  const drbTx = await fetchAllTransfers(DRB_CONTRACT, from("drb"));
  const wethTx = await fetchAllTransfers(WETH_CONTRACT, from("weth"));
  const usdcTx = await fetchAllTransfers(USDC_CONTRACT, from("usdc"));
  const normalTx = await fetchAllEthTxs("txlist", from("eth", "lastNormalBlock"));
  const internalTx = await fetchAllEthTxs("txlistinternal", from("eth", "lastInternalBlock"));
  if (!previous) validateReplayCoverage(existing, {
    drb: drbTx, weth: wethTx, usdc: usdcTx, normal: normalTx, internal: internalTx,
  });
  const [drbPrices, ethPrices] = await Promise.all([
    fetchDrbPriceHistory(previous ? 8 : 1000), fetchEthPriceHistory(previous ? 8 : 400),
  ]);
  if (!Object.keys(drbPrices).some(date => ethPrices[date] !== undefined)) throw new Error("Fresh price feeds have no shared valuation date");

  const drb = mergeAsset(previous?.drb, buildCumulativeBalanceMap(drbTx, false, TOKEN_DECIMALS, false));
  const weth = mergeAsset(previous?.weth, buildCumulativeBalanceMap(wethTx, false, TOKEN_DECIMALS, false));
  const usdc = mergeAsset(previous?.usdc, buildCumulativeBalanceMap(usdcTx, false, USDC_DECIMALS, false), USDC_DECIMALS);
  const ethDelta = buildCumulativeEthBalanceMap(normalTx, internalTx, false);
  const eth = mergeAsset(previous?.eth, ethDelta);
  const prices = savedPrices(existing);
  Object.assign(prices.drb, drbPrices);
  Object.assign(prices.eth, ethPrices);
  const walletValueAllTime = buildValueHistory(drb.cumByDate, weth.cumByDate, usdc.cumByDate, eth.cumByDate, prices.drb, prices.eth);
  if (!walletValueAllTime.length) throw new Error("No usable wallet valuations; previous snapshot retained");

  const ledger = {
    version: LEDGER_VERSION,
    drb: persistedAsset(drb, { lastBlock: maxBlock(drbTx, previous?.drb.lastBlock) }),
    weth: persistedAsset(weth, { lastBlock: maxBlock(wethTx, previous?.weth.lastBlock) }),
    usdc: persistedAsset(usdc, { lastBlock: maxBlock(usdcTx, previous?.usdc.lastBlock) }),
    eth: persistedAsset(eth, {
      lastNormalBlock: maxBlock(normalTx, previous?.eth.lastNormalBlock),
      lastInternalBlock: maxBlock(internalTx, previous?.eth.lastInternalBlock),
      missingL1FeeTransactions: (previous?.eth.missingL1FeeTransactions ?? 0) + ethDelta.missingL1FeeTransactions,
    }),
  };
  const output = {
    lastUpdated: new Date().toISOString(),
    priceAsOfDate: walletValueAllTime.at(-1).date,
    accountingCoverage: {
      chainBalancesReconciled: false,
      missingL1FeeTransactions: ledger.eth.missingL1FeeTransactions,
      note: "Balances replay indexed transfers; omitted Base L1 fees are not inferred. Chain balances and indexer completeness are not independently reconciled.",
    },
    walletAddress: WALLET_ADDRESS, tokenContract: DRB_CONTRACT,
    wethContract: WETH_CONTRACT, usdcContract: USDC_CONTRACT,
    tokenSymbol: "DRB", tokenDecimals: TOKEN_DECIMALS,
    lastBlockDrb: ledger.drb.lastBlock, lastBlockWeth: ledger.weth.lastBlock,
    lastBlockUsdc: ledger.usdc.lastBlock,
    lastBlockEth: Math.max(ledger.eth.lastNormalBlock, ledger.eth.lastInternalBlock),
    cumulativeDrbReceived: formatUnits(drb.totalIn), totalDrbTransactions: drb.countIn,
    // Backward-compatible field name: this counts external WETH received,
    // not independently classified liquidity-provider earnings.
    cumulativeWethEarned: formatUnits(weth.totalIn), totalWethTransactions: weth.countIn,
    cumulativeUsdcReceived: formatUnits(usdc.totalIn, USDC_DECIMALS), totalUsdcTransactions: usdc.countIn,
    cumulativeEthReceived: formatUnits(eth.totalIn), totalEthTransactions: eth.countIn,
    walletValueAllTime, walletValueLast30Days: last30DaysFrom(walletValueAllTime),
    ledger, priceHistory: prices,
  };
  writeSnapshot(output);
  console.log(`Written ${walletValueAllTime.length} valuation days to ${OUTPUT_PATH}`);
}

async function main() { return collect(false); }
async function mainIncremental() { return collect(true); }

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const incremental = process.argv.includes("--incremental");
(incremental ? mainIncremental : main)().catch((err) => {
  console.error(err);
  process.exit(1);
});
