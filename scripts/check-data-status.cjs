#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dataStatus = require('./data-status.cjs');
const freshness = require('../src/assets/js/data-freshness.js');
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

function check(root, site) {
  const manifest = JSON.parse(fs.readFileSync(path.join(site,'data-status.json'),'utf8'));
  const expected = dataStatus(root,manifest.generatedAt);
  assert.ok(Number.isFinite(Date.parse(manifest.generatedAt)), 'Invalid manifest generation date');
  assert.deepEqual(manifest,expected,'Built manifest does not match saved source data');
  const read = file => fs.readFileSync(path.join(site,file),'utf8');
  const pages = {home:read('index.html'),wallet:read('wallet/index.html'),movement:read('movement/index.html')};
  for (const [page,keys] of [['home',['balances','receipts','rankings']],['wallet',['balances','receipts','history']],['movement',['rankings','posts']]]) {
    for (const key of keys) {
      const source = manifest.sources[key];
      const marker = `data-snapshot-source="${key}" data-snapshot-sha256="${source.sha256}"><span data-freshness="${source.schedule}" data-collected-at="${source.observedAt || ''}"`;
      assert.ok(pages[page].includes(marker),`${page}: ${key} evidence differs from the manifest`);
    }
  }
  assert.ok(pages.home.includes(`class="wallet-total">${manifest.metrics.walletTotal}<`),'Homepage wallet value mismatch');
  assert.ok(pages.wallet.includes(`id="stat-total">$${manifest.metrics.walletRawUsd}<`),'Wallet value mismatch');
  for (const page of ['home','wallet']) assert.ok(pages[page].includes(`${manifest.metrics.wethReceived} WETH`),`${page}: WETH receipts mismatch`);
  const daily = pages.movement.split('id="lb-period-daily"')[1].split('id="lb-period-weekly"')[0];
  const leaders = [...daily.matchAll(/data-author="([^"]+)"[^>]*data-impressions="([^"]+)"/g)].map(m=>({author:m[1],impressions:Number(m[2])}));
  assert.deepEqual(leaders, manifest.metrics.dailyLeaders.slice(0,15).map(row=>({...row,author:escape(row.author)})),'Movement rankings mismatch');
  const homeMovement = pages.home.split('<section id="movement"')[1].split('<section id="wallet"')[0];
  for (const row of manifest.metrics.dailyLeaders.slice(0,5)) {
    assert.ok(homeMovement.includes(`>@${escape(row.author)}</a>`) && homeMovement.includes(`>${row.impressions.toLocaleString('en-US')}</span>`),'Homepage rankings mismatch');
  }
  return manifest;
}
module.exports = check;
if (require.main === module) {
  const root = path.resolve(__dirname,'..');
  try {
    const manifest = check(root,path.resolve(root,process.argv[2] || '_site'));
    console.log('Saved source hashes, timestamps and displayed wallet/ranking values match the built pages.');
    for (const [name,source] of Object.entries(manifest.sources)) {
      const result = freshness.assess(source.schedule,source.observedAt);
      if (result.state !== 'scheduled') console.warn(`::warning::${name}: ${result.message} Observation: ${source.observedAt || 'unknown'}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
