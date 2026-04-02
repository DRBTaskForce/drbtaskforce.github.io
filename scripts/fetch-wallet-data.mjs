#!/usr/bin/env node
/**
 * Fetches $DRB and WETH fee wallet data + historical prices, writes to
 * src/_data/wallet.json. No API key required.
 *
 * Data sources:
 *   - Blockscout Base API  — wallet transfer history
 *   - GeckoTerminal API    — DRB/WETH daily price history
 *   - CoinGecko free API   — ETH/USD daily price history
 *
 * Usage: node scripts/fetch-wallet-data.mjs
 */

import { writeFileSync } from "fs";
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

async function fetchAllTransfers(contractAddress) {
  const transfers = [];
  let startBlock = 0;
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
      if (data.message === "No transactions found") break;
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
 * Returns {date → priceInWeth} map (close price).
 */
async function fetchDrbPriceHistory() {
  const url = `https://api.geckoterminal.com/api/v2/networks/base/pools/${DRB_POOL}/ohlcv/day?limit=1000`;
  const res = await fetch(url, { headers: { Accept: "application/json;version=20230302" } });
  if (!res.ok) throw new Error(`GeckoTerminal HTTP error: ${res.status}`);
  const data = await res.json();
  const candles = data.data?.attributes?.ohlcv_list ?? [];

  const result = {};
  for (const [ts, , , , close] of candles) {
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    result[date] = close; // DRB price in WETH
  }
  return result;
}

/**
 * Kraken public API — ETH/USD daily close prices.
 * No API key required. Returns {date → priceUsd} map.
 * Kraken returns up to 720 candles; we fetch from 400 days ago to cover the
 * full DRB price history available from GeckoTerminal.
 */
async function fetchEthPriceHistory() {
  const since = Math.floor(Date.now() / 1000) - 400 * 86400;
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
function buildValueHistory(drbCumByDate, wethCumByDate, drbPriceWeth, ethPriceUsd) {
  // Backbone: dates from DRB price history, sorted ascending
  const priceDates = Object.keys(drbPriceWeth).sort();

  let lastDrb = 0;
  let lastWeth = 0;
  const history = [];

  for (const date of priceDates) {
    const ethUsd = ethPriceUsd[date];
    if (ethUsd == null) continue; // no ETH price for this date — skip

    // Carry forward balances
    if (drbCumByDate[date]  !== undefined) lastDrb  = drbCumByDate[date];
    if (wethCumByDate[date] !== undefined) lastWeth = wethCumByDate[date];

    const drbWeth  = drbPriceWeth[date];
    const drbUsd   = drbWeth * ethUsd;
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching wallet data for:", WALLET_ADDRESS);

  // 1. Transfer history + price history (in parallel)
  const [drbTransfers, wethTransfers, drbPriceWeth, ethPriceUsd] = await Promise.all([
    fetchAllTransfers(DRB_CONTRACT),
    fetchAllTransfers(WETH_CONTRACT),
    fetchDrbPriceHistory().catch(e => { console.warn("DRB price history failed:", e.message); return {}; }),
    fetchEthPriceHistory().catch(e => { console.warn("ETH price history failed:", e.message); return {}; }),
  ]);

  console.log(`DRB transfers: ${drbTransfers.length} | WETH transfers: ${wethTransfers.length}`);
  console.log(`DRB price days: ${Object.keys(drbPriceWeth).length} | ETH price days: ${Object.keys(ethPriceUsd).length}`);

  // 2. Cumulative balance maps
  const drb  = buildCumulativeBalanceMap(drbTransfers,  false); // net (in - out)
  const weth = buildCumulativeBalanceMap(wethTransfers, true);  // incoming only

  // 3. Wallet USD value history
  const walletValueAllTime   = buildValueHistory(drb.cumByDate, weth.cumByDate, drbPriceWeth, ethPriceUsd);
  const walletValueLast30Days = last30DaysFrom(walletValueAllTime);

  console.log(`Value history: ${walletValueAllTime.length} days | 30d: ${walletValueLast30Days.length} days`);

  const output = {
    lastUpdated: new Date().toISOString(),
    walletAddress: WALLET_ADDRESS,
    tokenContract: DRB_CONTRACT,
    wethContract: WETH_CONTRACT,
    tokenSymbol: "DRB",
    tokenDecimals: TOKEN_DECIMALS,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
