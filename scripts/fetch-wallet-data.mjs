#!/usr/bin/env node
/**
 * Fetches $DRB and WETH fee wallet data + historical prices, writes to
 * src/_data/wallet.json. No API key required.
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

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WALLET_ADDRESS = "0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9";
const DRB_CONTRACT   = "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2";
const WETH_CONTRACT  = "0x4200000000000000000000000000000000000006";
const DRB_POOL       = "0x5116773e18a9c7bb03ebb961b38678e45e238923"; // DRB/WETH pool on Base
const TOKEN_DECIMALS = 18;
const BLOCKSCOUT_API = "https://base.blockscout.com/api";
const OUTPUT_PATH    = join(__dirname, "../src/_data/wallet.json");

// ---------------------------------------------------------------------------
// Blockscout — transfer history
// ---------------------------------------------------------------------------

async function fetchAllTransfers(contractAddress, fromBlock = 0) {
  const transfers = [];
  let startBlock = fromBlock;
  const pageSize = 10000;

  while (true) {
    const url = new URL(BLOCKSCOUT_API);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    url.searchParams.set("contractaddress", contractAddress);
    url.searchParams.set("address", WALLET_ADDRESS);
    url.searchParams.set("startblock", startBlock);
    url.searchParams.set("endblock", "latest");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("offset", pageSize);
    url.searchParams.set("page", "1");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Blockscout HTTP error: ${res.status}`);
    const data = await res.json();

    if (data.status === "0") {
      if (data.message === "No transactions found" || data.message === "No token transfers found") break;
      throw new Error(`Blockscout API error: ${data.message} — ${data.result}`);
    }

    transfers.push(...data.result);
    if (data.result.length < pageSize) break;
    startBlock = parseInt(data.result[data.result.length - 1].blockNumber, 10) + 1;
  }

  return transfers;
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
  const res = await fetch(url, { headers: { Accept: "application/json;version=20230302" } });
  if (!res.ok) throw new Error(`GeckoTerminal HTTP error: ${res.status}`);
  const data = await res.json();
  const candles = data.data?.attributes?.ohlcv_list ?? [];

  const result = {};
  for (const [ts, , , , close] of candles) {
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    result[date] = close; // DRB price in USD (GeckoTerminal OHLCV returns USD)
  }
  return result;
}

/**
 * Kraken public API — ETH/USD daily close prices.
 * No API key required. Returns {date → priceUsd} map.
 * Kraken returns up to 720 candles; we fetch from 400 days ago to cover the
 * full DRB price history available from GeckoTerminal.
 */
async function fetchEthPriceHistory(days = 400) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const url = `https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1440&since=${since}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kraken HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.error?.length) throw new Error(`Kraken API error: ${data.error.join(", ")}`);

  const candles = data.result?.XETHZUSD ?? data.result?.ETHUSD ?? [];
  const result = {};
  for (const [ts, , , , close] of candles) {
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    result[date] = parseFloat(close);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

function toDateString(unixTimestamp) {
  return new Date(parseInt(unixTimestamp, 10) * 1000).toISOString().slice(0, 10);
}

function formatUnits(rawValue) {
  const big = BigInt(rawValue);
  const divisor = BigInt(10) ** BigInt(TOKEN_DECIMALS);
  const whole = big / divisor;
  const remainder = big % divisor;
  const fracStr = remainder.toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}

/**
 * Build a {date → cumulative_balance_float} map from transfers.
 * incomingOnly=false accounts for outgoing transfers too (net balance).
 */
function buildCumulativeBalanceMap(transfers, incomingOnly = false) {
  const walletLower = WALLET_ADDRESS.toLowerCase();
  const dailyNet = {};
  let totalIn = BigInt(0);
  let countIn = 0;

  for (const tx of transfers) {
    const date = toDateString(tx.timeStamp);
    const value = BigInt(tx.value);
    if (tx.to.toLowerCase() === walletLower) {
      totalIn += value;
      countIn++;
      dailyNet[date] = (dailyNet[date] ?? BigInt(0)) + value;
    } else if (!incomingOnly && tx.from.toLowerCase() === walletLower) {
      dailyNet[date] = (dailyNet[date] ?? BigInt(0)) - value;
    }
  }

  const sortedDates = Object.keys(dailyNet).sort();
  const divisor = BigInt(10) ** BigInt(TOKEN_DECIMALS);
  const cumByDate = {};
  let running = BigInt(0);

  for (const date of sortedDates) {
    running += dailyNet[date];
    const clamped = running < BigInt(0) ? BigInt(0) : running;
    cumByDate[date] = Number(clamped / divisor) + Number(clamped % divisor) / Number(divisor);
  }

  return { cumByDate, sortedDates, totalIn, countIn };
}

// ---------------------------------------------------------------------------
// Wallet value history
// ---------------------------------------------------------------------------

/**
 * For each day where we have both DRB and ETH prices, compute the wallet's
 * total USD value and return an array sorted by date.
 */
function buildValueHistory(drbCumByDate, wethCumByDate, drbPriceUsd, ethPriceUsd) {
  // Backbone: dates from DRB price history, sorted ascending
  const priceDates = Object.keys(drbPriceUsd).sort();

  let lastDrb = 0;
  let lastWeth = 0;
  const history = [];

  for (const date of priceDates) {
    const ethUsd = ethPriceUsd[date];
    if (ethUsd == null) continue; // no ETH price for this date — skip

    // Carry forward balances
    if (drbCumByDate[date]  !== undefined) lastDrb  = drbCumByDate[date];
    if (wethCumByDate[date] !== undefined) lastWeth = wethCumByDate[date];

    const drbUsd   = drbPriceUsd[date]; // already USD — do not multiply by ethUsd
    const usdValue = lastDrb * drbUsd + lastWeth * ethUsd;

    history.push({
      date,
      usd:      Math.round(usdValue * 100) / 100,
      drb:      Math.round(lastDrb),
      weth:     Math.round(lastWeth * 10000) / 10000,
      drbPrice: drbUsd,
      ethPrice: Math.round(ethUsd * 100) / 100,
    });
  }

  return history;
}

/**
 * Extract the last 30 calendar days from a full value history array.
 * Days with no price entry carry forward the previous day's value.
 */
function last30DaysFrom(fullHistory) {
  if (fullHistory.length === 0) return [];

  const byDate = Object.fromEntries(fullHistory.map(d => [d.date, d]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const result = [];
  let last = null;

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if (byDate[dateStr]) last = byDate[dateStr];
    if (last) result.push({ ...last, date: dateStr });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main — full rebuild
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching wallet data for:", WALLET_ADDRESS);

  // 1. Transfer history + price history (in parallel)
  const [drbTransfers, wethTransfers, drbPriceUsd, ethPriceUsd] = await Promise.all([
    fetchAllTransfers(DRB_CONTRACT),
    fetchAllTransfers(WETH_CONTRACT),
    fetchDrbPriceHistory().catch(e => { console.warn("DRB price history failed:", e.message); return {}; }),
    fetchEthPriceHistory().catch(e => { console.warn("ETH price history failed:", e.message); return {}; }),
  ]);

  console.log(`DRB transfers: ${drbTransfers.length} | WETH transfers: ${wethTransfers.length}`);
  console.log(`DRB price days: ${Object.keys(drbPriceUsd).length} | ETH price days: ${Object.keys(ethPriceUsd).length}`);

  // 2. Cumulative balance maps
  const drb  = buildCumulativeBalanceMap(drbTransfers,  false); // net (in - out)
  const weth = buildCumulativeBalanceMap(wethTransfers, true);  // incoming only

  // 3. Wallet USD value history
  const walletValueAllTime   = buildValueHistory(drb.cumByDate, weth.cumByDate, drbPriceUsd, ethPriceUsd);
  const walletValueLast30Days = last30DaysFrom(walletValueAllTime);

  console.log(`Value history: ${walletValueAllTime.length} days | 30d: ${walletValueLast30Days.length} days`);

  // Store last seen block numbers so incremental runs can resume from there
  const lastBlockDrb  = drbTransfers.length  ? parseInt(drbTransfers[drbTransfers.length - 1].blockNumber, 10)   : 0;
  const lastBlockWeth = wethTransfers.length ? parseInt(wethTransfers[wethTransfers.length - 1].blockNumber, 10) : 0;

  const output = {
    lastUpdated: new Date().toISOString(),
    walletAddress: WALLET_ADDRESS,
    tokenContract: DRB_CONTRACT,
    wethContract: WETH_CONTRACT,
    tokenSymbol: "DRB",
    tokenDecimals: TOKEN_DECIMALS,
    lastBlockDrb,
    lastBlockWeth,
    cumulativeDrbReceived: formatUnits(drb.totalIn),
    totalDrbTransactions: drb.countIn,
    cumulativeWethEarned: formatUnits(weth.totalIn),
    totalWethTransactions: weth.countIn,
    walletValueAllTime,
    walletValueLast30Days,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log("Written to", OUTPUT_PATH);
}

// ---------------------------------------------------------------------------
// Main — incremental update (--incremental flag)
// Fetches only new transfers since the last known block, refreshes the last
// 8 days of price data, then merges the deltas into the existing JSON.
// ---------------------------------------------------------------------------

async function mainIncremental() {
  if (!existsSync(OUTPUT_PATH)) {
    console.log("No existing wallet.json — falling back to full rebuild.");
    return main();
  }

  const existing = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
  const fromBlockDrb  = (existing.lastBlockDrb  ?? 0) + 1;
  const fromBlockWeth = (existing.lastBlockWeth ?? 0) + 1;

  console.log(`Incremental update from blocks DRB=${fromBlockDrb} WETH=${fromBlockWeth}`);

  // Fetch only new transfers + last 8 days of prices
  const [newDrbTx, newWethTx, newDrbPrices, newEthPrices] = await Promise.all([
    fetchAllTransfers(DRB_CONTRACT,  fromBlockDrb),
    fetchAllTransfers(WETH_CONTRACT, fromBlockWeth),
    fetchDrbPriceHistory(8).catch(e => { console.warn("DRB price history failed:", e.message); return {}; }),
    fetchEthPriceHistory(8).catch(e => { console.warn("ETH price history failed:", e.message); return {}; }),
  ]);

  console.log(`New transfers — DRB: ${newDrbTx.length} | WETH: ${newWethTx.length}`);

  // Rebuild cumulative maps: start from existing totals + apply new transfers
  const walletLower = WALLET_ADDRESS.toLowerCase();
  const divisor = BigInt(10) ** BigInt(TOKEN_DECIMALS);

  function applyNewTransfers(existing, newTxs, incomingOnly) {
    let totalIn  = BigInt(0);
    let countIn  = incomingOnly ? (existing.totalWethTransactions ?? 0) : (existing.totalDrbTransactions ?? 0);
    const balanceKey = incomingOnly ? "weth" : "drb";
    // Seed cumByDate from existing history using the correct balance field
    const cumByDate = Object.fromEntries(
      (existing.walletValueAllTime ?? []).map(d => [d.date, d[balanceKey]])
    );
    // Last known balance as our running baseline
    const allTime = existing.walletValueAllTime ?? [];
    let runningFloat = allTime.length ? allTime[allTime.length - 1][balanceKey] : 0;

    const dailyNet = {};
    for (const tx of newTxs) {
      const date  = toDateString(tx.timeStamp);
      const value = BigInt(tx.value);
      if (tx.to.toLowerCase() === walletLower) {
        totalIn += value;
        countIn++;
        dailyNet[date] = (dailyNet[date] ?? 0) + Number(value / divisor) + Number(value % divisor) / Number(divisor);
      } else if (!incomingOnly && tx.from.toLowerCase() === walletLower) {
        dailyNet[date] = (dailyNet[date] ?? 0) - Number(value / divisor) - Number(value % divisor) / Number(divisor);
      }
    }

    // Apply daily deltas to running balance, updating/adding entries in cumByDate
    for (const date of Object.keys(dailyNet).sort()) {
      runningFloat = Math.max(0, runningFloat + dailyNet[date]);
      cumByDate[date] = runningFloat;
    }

    return { cumByDate, totalIn, countIn };
  }

  const drbResult  = applyNewTransfers(existing, newDrbTx,  false);
  const wethResult = applyNewTransfers(existing, newWethTx, true);

  // Merge new prices into existing price maps (built from existing walletValueAllTime)
  const existingDrbPrices  = Object.fromEntries((existing.walletValueAllTime ?? []).map(d => [d.date, d.drbPrice]));
  const existingEthPrices  = Object.fromEntries((existing.walletValueAllTime ?? []).map(d => [d.date, d.ethPrice]));
  const mergedDrbPrices    = { ...existingDrbPrices, ...newDrbPrices };
  const mergedEthPrices    = { ...existingEthPrices, ...newEthPrices };

  const walletValueAllTime   = buildValueHistory(drbResult.cumByDate, wethResult.cumByDate, mergedDrbPrices, mergedEthPrices);
  const walletValueLast30Days = last30DaysFrom(walletValueAllTime);

  const lastBlockDrb  = newDrbTx.length  ? parseInt(newDrbTx[newDrbTx.length - 1].blockNumber, 10)    : (existing.lastBlockDrb  ?? 0);
  const lastBlockWeth = newWethTx.length ? parseInt(newWethTx[newWethTx.length - 1].blockNumber, 10)  : (existing.lastBlockWeth ?? 0);

  // Recalculate cumulative totals: existing + new
  const existingDrbIn  = BigInt(Math.round(parseFloat(existing.cumulativeDrbReceived)  * 1e18));
  const existingWethIn = BigInt(Math.round(parseFloat(existing.cumulativeWethEarned)   * 1e18));

  const output = {
    lastUpdated: new Date().toISOString(),
    walletAddress: WALLET_ADDRESS,
    tokenContract: DRB_CONTRACT,
    wethContract: WETH_CONTRACT,
    tokenSymbol: "DRB",
    tokenDecimals: TOKEN_DECIMALS,
    lastBlockDrb,
    lastBlockWeth,
    cumulativeDrbReceived:  formatUnits(existingDrbIn  + drbResult.totalIn),
    totalDrbTransactions:   drbResult.countIn,
    cumulativeWethEarned:   formatUnits(existingWethIn + wethResult.totalIn),
    totalWethTransactions:  wethResult.countIn,
    walletValueAllTime,
    walletValueLast30Days,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Incremental update complete. Value history: ${walletValueAllTime.length} days`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const incremental = process.argv.includes("--incremental");
(incremental ? mainIncremental : main)().catch((err) => {
  console.error(err);
  process.exit(1);
});
