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

import { writeFileSync, readFileSync, existsSync } from "fs";
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
// Blockscout — token transfer history
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
// Blockscout — native ETH transaction history
// ---------------------------------------------------------------------------

async function fetchAllEthTxs(action, fromBlock = 0) {
  const txs = [];
  let startBlock = fromBlock;
  const pageSize = 10000;

  while (true) {
    const url = new URL(BLOCKSCOUT_API);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", action); // "txlist" or "txlistinternal"
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

    txs.push(...data.result);
    if (data.result.length < pageSize) break;
    startBlock = parseInt(data.result[data.result.length - 1].blockNumber, 10) + 1;
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

function formatUnits(rawValue, decimals = TOKEN_DECIMALS) {
  const big = BigInt(rawValue);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = big / divisor;
  const remainder = big % divisor;
  const fracStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}

/**
 * Build a {date → cumulative_balance_float} map from ERC-20 token transfers.
 * incomingOnly=false accounts for outgoing transfers too (net balance).
 */
function buildCumulativeBalanceMap(transfers, incomingOnly = false, decimals = TOKEN_DECIMALS) {
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
  const divisor = BigInt(10) ** BigInt(decimals);
  const cumByDate = {};
  let running = BigInt(0);

  for (const date of sortedDates) {
    running += dailyNet[date];
    const clamped = running < BigInt(0) ? BigInt(0) : running;
    cumByDate[date] = Number(clamped / divisor) + Number(clamped % divisor) / Number(divisor);
  }

  return { cumByDate, sortedDates, totalIn, countIn };
}

/**
 * Build a {date → cumulative_balance_float} map from native ETH transactions.
 * Accounts for gas costs on outgoing normal transactions.
 */
function buildCumulativeEthBalanceMap(normalTxs, internalTxs) {
  const walletLower = WALLET_ADDRESS.toLowerCase();
  const dailyNet = {}; // date → BigInt
  let totalIn = BigInt(0);
  let countIn = 0;

  for (const tx of normalTxs) {
    if (tx.isError === "1") continue;
    const date = toDateString(tx.timeStamp);
    const value = BigInt(tx.value || "0");
    if (tx.to?.toLowerCase() === walletLower && value > BigInt(0)) {
      totalIn += value;
      countIn++;
      dailyNet[date] = (dailyNet[date] ?? BigInt(0)) + value;
    }
    if (tx.from?.toLowerCase() === walletLower) {
      const gasCost = BigInt(tx.gasUsed || "0") * BigInt(tx.gasPrice || "0");
      dailyNet[date] = (dailyNet[date] ?? BigInt(0)) - value - gasCost;
    }
  }

  for (const tx of internalTxs) {
    if (tx.isError === "1") continue;
    const date = toDateString(tx.timeStamp);
    const value = BigInt(tx.value || "0");
    if (value === BigInt(0)) continue;
    if (tx.to?.toLowerCase() === walletLower) {
      totalIn += value;
      countIn++;
      dailyNet[date] = (dailyNet[date] ?? BigInt(0)) + value;
    } else if (tx.from?.toLowerCase() === walletLower) {
      dailyNet[date] = (dailyNet[date] ?? BigInt(0)) - value;
    }
  }

  const sortedDates = Object.keys(dailyNet).sort();
  const divisor = BigInt(10) ** BigInt(18);
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
 * total USD value across all four assets and return an array sorted by date.
 * USDC is treated as a $1 stablecoin (no price feed needed).
 */
function buildValueHistory(drbCumByDate, wethCumByDate, usdcCumByDate, ethCumByDate, drbPriceUsd, ethPriceUsd) {
  const priceDates = Object.keys(drbPriceUsd).sort();

  let lastDrb = 0, lastWeth = 0, lastUsdc = 0, lastEth = 0;
  const history = [];

  for (const date of priceDates) {
    const ethUsd = ethPriceUsd[date];
    if (ethUsd == null) continue;

    if (drbCumByDate[date]  !== undefined) lastDrb  = drbCumByDate[date];
    if (wethCumByDate[date] !== undefined) lastWeth = wethCumByDate[date];
    if (usdcCumByDate[date] !== undefined) lastUsdc = usdcCumByDate[date];
    if (ethCumByDate[date]  !== undefined) lastEth  = ethCumByDate[date];

    const drbUsd = drbPriceUsd[date];
    const usdValue = lastDrb * drbUsd + lastWeth * ethUsd + lastUsdc + lastEth * ethUsd;

    history.push({
      date,
      usd:      Math.round(usdValue * 100) / 100,
      drb:      Math.round(lastDrb),
      weth:     Math.round(lastWeth * 10000) / 10000,
      usdc:     Math.round(lastUsdc * 100) / 100,
      eth:      Math.round(lastEth * 10000) / 10000,
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

  const [drbTransfers, wethTransfers, usdcTransfers, ethNormalTxs, ethInternalTxs, drbPriceUsd, ethPriceUsd] = await Promise.all([
    fetchAllTransfers(DRB_CONTRACT),
    fetchAllTransfers(WETH_CONTRACT),
    fetchAllTransfers(USDC_CONTRACT),
    fetchAllEthTxs("txlist"),
    fetchAllEthTxs("txlistinternal"),
    fetchDrbPriceHistory().catch(e => { console.warn("DRB price history failed:", e.message); return {}; }),
    fetchEthPriceHistory().catch(e => { console.warn("ETH price history failed:", e.message); return {}; }),
  ]);

  console.log(`DRB: ${drbTransfers.length} | WETH: ${wethTransfers.length} | USDC: ${usdcTransfers.length} | ETH: ${ethNormalTxs.length}+${ethInternalTxs.length}`);
  console.log(`DRB price days: ${Object.keys(drbPriceUsd).length} | ETH price days: ${Object.keys(ethPriceUsd).length}`);

  const drb  = buildCumulativeBalanceMap(drbTransfers,  false);
  const weth = buildCumulativeBalanceMap(wethTransfers, false);
  const usdc = buildCumulativeBalanceMap(usdcTransfers, false, USDC_DECIMALS);
  const eth  = buildCumulativeEthBalanceMap(ethNormalTxs, ethInternalTxs);

  const walletValueAllTime    = buildValueHistory(drb.cumByDate, weth.cumByDate, usdc.cumByDate, eth.cumByDate, drbPriceUsd, ethPriceUsd);
  const walletValueLast30Days = last30DaysFrom(walletValueAllTime);

  console.log(`Value history: ${walletValueAllTime.length} days | 30d: ${walletValueLast30Days.length} days`);

  const lastBlockDrb  = drbTransfers.length  ? parseInt(drbTransfers[drbTransfers.length - 1].blockNumber, 10)   : 0;
  const lastBlockWeth = wethTransfers.length ? parseInt(wethTransfers[wethTransfers.length - 1].blockNumber, 10) : 0;
  const lastBlockUsdc = usdcTransfers.length ? parseInt(usdcTransfers[usdcTransfers.length - 1].blockNumber, 10) : 0;
  const allEthTxs     = [...ethNormalTxs, ...ethInternalTxs];
  const lastBlockEth  = allEthTxs.length
    ? Math.max(...allEthTxs.map(t => parseInt(t.blockNumber, 10)))
    : 0;

  const output = {
    lastUpdated: new Date().toISOString(),
    walletAddress: WALLET_ADDRESS,
    tokenContract: DRB_CONTRACT,
    wethContract: WETH_CONTRACT,
    usdcContract: USDC_CONTRACT,
    tokenSymbol: "DRB",
    tokenDecimals: TOKEN_DECIMALS,
    lastBlockDrb,
    lastBlockWeth,
    lastBlockUsdc,
    lastBlockEth,
    cumulativeDrbReceived:  formatUnits(drb.totalIn),
    totalDrbTransactions:   drb.countIn,
    cumulativeWethEarned:   formatUnits(weth.totalIn),
    totalWethTransactions:  weth.countIn,
    cumulativeUsdcReceived: formatUnits(usdc.totalIn, USDC_DECIMALS),
    totalUsdcTransactions:  usdc.countIn,
    cumulativeEthReceived:  formatUnits(eth.totalIn),
    totalEthTransactions:   eth.countIn,
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
  const fromBlockUsdc = (existing.lastBlockUsdc ?? 0) + 1;
  const fromBlockEth  = (existing.lastBlockEth  ?? 0) + 1;

  console.log(`Incremental update from blocks DRB=${fromBlockDrb} WETH=${fromBlockWeth} USDC=${fromBlockUsdc} ETH=${fromBlockEth}`);

  const [newDrbTx, newWethTx, newUsdcTx, newEthNormalTxs, newEthInternalTxs, newDrbPrices, newEthPrices] = await Promise.all([
    fetchAllTransfers(DRB_CONTRACT,  fromBlockDrb),
    fetchAllTransfers(WETH_CONTRACT, fromBlockWeth),
    fetchAllTransfers(USDC_CONTRACT, fromBlockUsdc),
    fetchAllEthTxs("txlist",         fromBlockEth),
    fetchAllEthTxs("txlistinternal", fromBlockEth),
    fetchDrbPriceHistory(8).catch(e => { console.warn("DRB price history failed:", e.message); return {}; }),
    fetchEthPriceHistory(8).catch(e => { console.warn("ETH price history failed:", e.message); return {}; }),
  ]);

  console.log(`New transfers — DRB: ${newDrbTx.length} | WETH: ${newWethTx.length} | USDC: ${newUsdcTx.length}`);
  console.log(`New ETH txs — normal: ${newEthNormalTxs.length} | internal: ${newEthInternalTxs.length}`);

  const walletLower = WALLET_ADDRESS.toLowerCase();

  // Rebuild cumulative maps: start from existing totals + apply new transfers
  function applyNewTransfers(existing, newTxs, incomingOnly, balanceKey, countKey, decimals = TOKEN_DECIMALS) {
    const localDivisor = BigInt(10) ** BigInt(decimals);
    let totalIn  = BigInt(0);
    let countIn  = existing[countKey] ?? 0;
    const cumByDate = Object.fromEntries(
      (existing.walletValueAllTime ?? []).map(d => [d.date, d[balanceKey] ?? 0])
    );
    const allTime = existing.walletValueAllTime ?? [];
    let runningFloat = allTime.length ? (allTime[allTime.length - 1][balanceKey] ?? 0) : 0;

    const dailyNet = {};
    for (const tx of newTxs) {
      const date  = toDateString(tx.timeStamp);
      const value = BigInt(tx.value);
      if (tx.to.toLowerCase() === walletLower) {
        totalIn += value;
        countIn++;
        dailyNet[date] = (dailyNet[date] ?? 0) + Number(value / localDivisor) + Number(value % localDivisor) / Number(localDivisor);
      } else if (!incomingOnly && tx.from.toLowerCase() === walletLower) {
        dailyNet[date] = (dailyNet[date] ?? 0) - Number(value / localDivisor) - Number(value % localDivisor) / Number(localDivisor);
      }
    }

    for (const date of Object.keys(dailyNet).sort()) {
      runningFloat = Math.max(0, runningFloat + dailyNet[date]);
      cumByDate[date] = runningFloat;
    }

    return { cumByDate, totalIn, countIn };
  }

  function applyNewEthTxs(existing, newNormalTxs, newInternalTxs) {
    const ethDivisor = BigInt(10) ** BigInt(18);
    let totalIn = BigInt(0);
    let countIn = existing.totalEthTransactions ?? 0;
    const cumByDate = Object.fromEntries(
      (existing.walletValueAllTime ?? []).map(d => [d.date, d.eth ?? 0])
    );
    const allTime = existing.walletValueAllTime ?? [];
    let runningFloat = allTime.length ? (allTime[allTime.length - 1].eth ?? 0) : 0;

    const dailyNet = {};

    for (const tx of newNormalTxs) {
      if (tx.isError === "1") continue;
      const date = toDateString(tx.timeStamp);
      const value = BigInt(tx.value || "0");
      if (tx.to?.toLowerCase() === walletLower && value > BigInt(0)) {
        totalIn += value;
        countIn++;
        dailyNet[date] = (dailyNet[date] ?? 0) + Number(value / ethDivisor) + Number(value % ethDivisor) / Number(ethDivisor);
      }
      if (tx.from?.toLowerCase() === walletLower) {
        const gasCost = BigInt(tx.gasUsed || "0") * BigInt(tx.gasPrice || "0");
        const total = value + gasCost;
        dailyNet[date] = (dailyNet[date] ?? 0) - Number(total / ethDivisor) - Number(total % ethDivisor) / Number(ethDivisor);
      }
    }

    for (const tx of newInternalTxs) {
      if (tx.isError === "1") continue;
      const date = toDateString(tx.timeStamp);
      const value = BigInt(tx.value || "0");
      if (value === BigInt(0)) continue;
      if (tx.to?.toLowerCase() === walletLower) {
        totalIn += value;
        countIn++;
        dailyNet[date] = (dailyNet[date] ?? 0) + Number(value / ethDivisor) + Number(value % ethDivisor) / Number(ethDivisor);
      } else if (tx.from?.toLowerCase() === walletLower) {
        dailyNet[date] = (dailyNet[date] ?? 0) - Number(value / ethDivisor) - Number(value % ethDivisor) / Number(ethDivisor);
      }
    }

    for (const date of Object.keys(dailyNet).sort()) {
      runningFloat = Math.max(0, runningFloat + dailyNet[date]);
      cumByDate[date] = runningFloat;
    }

    return { cumByDate, totalIn, countIn };
  }

  const drbResult  = applyNewTransfers(existing, newDrbTx,  false, "drb",  "totalDrbTransactions");
  const wethResult = applyNewTransfers(existing, newWethTx, false, "weth", "totalWethTransactions");
  const usdcResult = applyNewTransfers(existing, newUsdcTx, false, "usdc", "totalUsdcTransactions", USDC_DECIMALS);
  const ethResult  = applyNewEthTxs(existing, newEthNormalTxs, newEthInternalTxs);

  // Merge new prices into existing price maps (built from existing walletValueAllTime)
  const existingDrbPrices = Object.fromEntries((existing.walletValueAllTime ?? []).map(d => [d.date, d.drbPrice]));
  const existingEthPrices = Object.fromEntries((existing.walletValueAllTime ?? []).map(d => [d.date, d.ethPrice]));
  const mergedDrbPrices   = { ...existingDrbPrices, ...newDrbPrices };
  const mergedEthPrices   = { ...existingEthPrices, ...newEthPrices };

  const walletValueAllTime    = buildValueHistory(drbResult.cumByDate, wethResult.cumByDate, usdcResult.cumByDate, ethResult.cumByDate, mergedDrbPrices, mergedEthPrices);
  const walletValueLast30Days = last30DaysFrom(walletValueAllTime);

  const lastBlockDrb  = newDrbTx.length  ? parseInt(newDrbTx[newDrbTx.length - 1].blockNumber, 10)   : (existing.lastBlockDrb  ?? 0);
  const lastBlockWeth = newWethTx.length ? parseInt(newWethTx[newWethTx.length - 1].blockNumber, 10) : (existing.lastBlockWeth ?? 0);
  const lastBlockUsdc = newUsdcTx.length ? parseInt(newUsdcTx[newUsdcTx.length - 1].blockNumber, 10) : (existing.lastBlockUsdc ?? 0);
  const allNewEthTxs  = [...newEthNormalTxs, ...newEthInternalTxs];
  const lastBlockEth  = allNewEthTxs.length
    ? Math.max(...allNewEthTxs.map(t => parseInt(t.blockNumber, 10)))
    : (existing.lastBlockEth ?? 0);

  // Recalculate cumulative totals: existing + new
  const existingDrbIn  = BigInt(Math.round(parseFloat(existing.cumulativeDrbReceived)  * 1e18));
  const existingWethIn = BigInt(Math.round(parseFloat(existing.cumulativeWethEarned)   * 1e18));
  const existingUsdcIn = BigInt(Math.round(parseFloat(existing.cumulativeUsdcReceived ?? "0") * 1e6));
  const existingEthIn  = BigInt(Math.round(parseFloat(existing.cumulativeEthReceived  ?? "0") * 1e18));

  const output = {
    lastUpdated: new Date().toISOString(),
    walletAddress: WALLET_ADDRESS,
    tokenContract: DRB_CONTRACT,
    wethContract: WETH_CONTRACT,
    usdcContract: USDC_CONTRACT,
    tokenSymbol: "DRB",
    tokenDecimals: TOKEN_DECIMALS,
    lastBlockDrb,
    lastBlockWeth,
    lastBlockUsdc,
    lastBlockEth,
    cumulativeDrbReceived:  formatUnits(existingDrbIn  + drbResult.totalIn),
    totalDrbTransactions:   drbResult.countIn,
    cumulativeWethEarned:   formatUnits(existingWethIn + wethResult.totalIn),
    totalWethTransactions:  wethResult.countIn,
    cumulativeUsdcReceived: formatUnits(existingUsdcIn + usdcResult.totalIn, USDC_DECIMALS),
    totalUsdcTransactions:  usdcResult.countIn,
    cumulativeEthReceived:  formatUnits(existingEthIn  + ethResult.totalIn),
    totalEthTransactions:   ethResult.countIn,
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
