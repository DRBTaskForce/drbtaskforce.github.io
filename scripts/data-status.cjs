'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const walletSummary = require('./wallet-summary.cjs');
const normalizeAttention = require('./normalize-attention.cjs');

module.exports = function dataStatus(root, generatedAt = new Date().toISOString()) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root,'src/_data',file),'utf8'));
  const {wallet, balancesFile} = require('./wallet-observation.cjs').read(root);
  const creators = read('creators.json'), movement = read('movement.json');
  const receiptFile = fs.existsSync(path.join(root,'src/_data/wethReceipts.json')) ? 'wethReceipts.json' : null;
  const receipts = receiptFile ? read(receiptFile) : null;
  const summary = walletSummary(wallet,receipts), attention = normalizeAttention(creators);
  const source = (file, observedAt, schedule) => ({
    file, observedAt: observedAt || null, schedule,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(root,'src/_data',file))).digest('hex'),
  });
  const latest = wallet.currentSnapshot || wallet.walletValueAllTime.at(-1);
  return {
    version: 1, generatedAt,
    sources: {
      balances: source(balancesFile, latest.observedAt || latest.date, 'wallet'),
      receipts: source(receiptFile || 'wallet.json', summary.receiptsObservedAt, 'wallet'),
      history: source('wallet.json', wallet.lastUpdated, 'wallet'),
      rankings: source('creators.json', creators.lastUpdatedDaily, 'rankings'),
      posts: source('movement.json', movement.lastUpdated, 'posts'),
    },
    metrics: {
      walletTotal: summary.total, walletRawUsd: latest.usd, wethReceived: summary.wethReceived,
      dailyLeaders: attention.daily.map(row=>({author:row.author,impressions:row.impressions})),
      rankingCoverage: attention.periods,
    },
  };
};
