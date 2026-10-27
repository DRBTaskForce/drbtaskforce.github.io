'use strict';
const fs = require('node:fs');
const path = require('node:path');
const WALLET = '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function validate(value) {
  if (!value || value.version !== 1 || value.chainId !== 8453 || value.walletAddress !== WALLET ||
      !Number.isSafeInteger(value.blockNumber) || value.blockNumber < 0 ||
      typeof value.blockHash !== 'string' || !/^0x[\da-f]{64}$/i.test(value.blockHash) ||
      !iso(value.observedAt) || value.date !== new Date(value.observedAt).toISOString().slice(0,10) ||
      !amount(value.drbPrice) || value.drbPrice === 0 || !amount(value.ethPrice) || value.ethPrice === 0) {
    throw new Error('Invalid independent wallet observation');
  }
  for (const [asset,decimals] of [['drb',18],['weth',18],['eth',18],['usdc',6]]) {
    const raw = value.rawBalances?.[asset];
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || BigInt(raw) >= 2n**256n) throw new Error('Invalid wallet observation raw balance');
    const scale = 10n ** BigInt(decimals), integer = BigInt(raw);
    const converted = Number(`${integer / scale}.${String(integer % scale).padStart(decimals,'0')}`);
    if (!amount(value[asset]) || converted !== value[asset]) throw new Error('Invalid wallet observation balance');
  }
  const usd = Math.round((value.drb * value.drbPrice + (value.weth + value.eth) * value.ethPrice + value.usdc) * 100) / 100;
  if (!amount(value.usd) || usd !== value.usd) throw new Error('Invalid wallet observation valuation');
  return value;
}

function older(value, anchor) {
  return anchor && ((iso(anchor.observedAt) && Date.parse(value.observedAt) < Date.parse(anchor.observedAt)) ||
    (Number.isSafeInteger(anchor.blockNumber) && value.blockNumber < anchor.blockNumber) ||
    (typeof anchor.date === 'string' && value.date < anchor.date));
}
function checkHash(value, anchor) {
  if (anchor?.blockNumber === value.blockNumber && anchor.blockHash && anchor.blockHash.toLowerCase() !== value.blockHash.toLowerCase()) {
    throw new Error('Conflicting wallet observation block hash');
  }
}
function create(snapshot, wallet, previous) {
  const value = validate({...snapshot,version:1,chainId:8453,walletAddress:WALLET});
  if (previous) validate(previous);
  for (const anchor of [previous,wallet?.currentSnapshot,...(wallet?.walletValueAllTime || [])]) {
    if (older(value,anchor)) throw new Error('Current wallet observation is older than saved evidence');
    checkHash(value,anchor);
  }
  return value;
}
function merge(wallet, observation) {
  if (!observation) return {wallet,balancesFile:'wallet.json'};
  validate(observation);
  const anchors = [wallet.currentSnapshot,...(wallet.walletValueAllTime || [])];
  if (anchors.some(anchor=>older(observation,anchor))) return {wallet,balancesFile:'wallet.json'};
  for (const anchor of anchors) checkHash(observation,anchor);
  if (wallet.currentSnapshot?.observedAt === observation.observedAt && wallet.currentSnapshot?.blockNumber === observation.blockNumber) {
    return {wallet,balancesFile:'wallet.json'};
  }
  return {
    wallet: {...wallet,currentSnapshot:observation,historyStatus:{state:'pending',reason:'Current balances and historical accounting have separate collection results.'}},
    balancesFile:'walletObservation.json',
  };
}
function read(root) {
  const directory = path.join(root,'src/_data');
  const wallet = JSON.parse(fs.readFileSync(path.join(directory,'wallet.json'),'utf8'));
  const file = path.join(directory,'walletObservation.json');
  return merge(wallet,fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : null);
}
module.exports = {validate,create,merge,read};
