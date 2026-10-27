const test = require('node:test');
const assert = require('node:assert/strict');
const receipts = require('../scripts/weth-receipts.cjs');
const wallet = '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const token = '0x4200000000000000000000000000000000000006';
const other = '0x' + '1'.repeat(40);
const snapshot = { blockNumber: 100, blockHash: '0x' + 'a'.repeat(64), observedAt: '2026-10-18T10:17:00Z' };
const row = (block, value, fields={}) => ({blockNumber:String(block),blockHash:'0x'+'b'.repeat(64),hash:'0x'+String(block).padStart(64,'0'),logIndex:'0',contractAddress:token,tokenDecimal:'18',from:other,to:wallet,value:String(value),...fields});

test('complete WETH receipts use exact units, ignore self-transfers and deduplicate identified events', () => {
  const incoming=row(90,1000000000000000001n);
  const result=receipts(null,[incoming,incoming,row(91,20,{from:wallet}),row(92,2,{from:wallet,to:other})],snapshot);
  assert.equal(result.totalRaw,'1000000000000000001'); assert.equal(result.total,'1.000000000000000001'); assert.equal(result.count,1);
  assert.equal(result.observedAt,snapshot.observedAt); assert.equal(result.checkpointBlock,92);
});

test('overlapping incremental runs count new transfers once and require the saved boundary', () => {
  const a=row(90,100);const first=receipts(null,[a],snapshot);
  const b=row(95,3);const next=receipts(first,[a,b],{...snapshot,blockNumber:110});
  assert.equal(next.totalRaw,'103');assert.equal(next.count,2);
  assert.equal(receipts(next,[b],{...snapshot,blockNumber:120}).totalRaw,'103');
  assert.throws(()=>receipts(first,[b],snapshot),/boundary/);
  assert.throws(()=>receipts(first,[{...a,blockHash:'0x'+'c'.repeat(64)}],snapshot),/boundary/);
});

test('partial, regressing, wrong-token, ambiguous and conflicting rows cannot establish a receipts baseline', () => {
  const a=row(90,100);
  for(const rows of [[{...a,contractAddress:other}],[{...a,value:'-1'}],[{...a,hash:''}],[{...a,blockNumber:'101'}],[a,{...a,value:'101'}]]) {
    assert.throws(()=>receipts(null,rows,snapshot));
  }
  const noIndex={...a};delete noIndex.logIndex;
  assert.equal(receipts(null,[noIndex],snapshot).totalRaw,'100');
  assert.throws(()=>receipts(null,[noIndex,noIndex],snapshot),/ambiguous/);
  assert.throws(()=>receipts(null,[],snapshot,{lastBlockWeth:90,cumulativeWethEarned:'1',totalWethTransactions:1}),/history/);
  const first=receipts(null,[a],snapshot);
  assert.throws(()=>receipts(first,[a],{...snapshot,blockNumber:99}),/older/);
});


test('contradictory fork evidence cannot publish a receipt observation', () => {
  assert.throws(()=>receipts(null,[row(100,1)],snapshot),/hash/i);
  assert.throws(()=>receipts(null,[row(90,1),row(90,1,{logIndex:'1',blockHash:'0x'+'c'.repeat(64)})],snapshot),/hash/i);
});

test('initial receipt replay must exactly preserve the legacy prefix, not just exceed its total', () => {
  const legacy={lastBlockWeth:90,cumulativeWethEarned:'0.0000000000000001',totalWethTransactions:1};
  const a=row(90,100), later=row(95,1000);
  assert.equal(receipts(null,[a,later],snapshot,legacy).totalRaw,'1100');
  // Larger subsequent receipts cannot conceal a missing/changed old prefix.
  assert.throws(()=>receipts(null,[row(90,99),later],snapshot,legacy),/prefix/);
  assert.throws(()=>receipts(null,[row(89,1),a,later],snapshot,legacy),/prefix/);
  assert.throws(()=>receipts(null,[later],snapshot,legacy),/prefix/);
});

test('an initial independent receipt record cannot start partway through history', () => {
  assert.throws(()=>receipts(null,[row(90,100)],snapshot,{},90),/genesis/);
});

test('mixed indexed and unindexed copies cannot inflate a WETH receipt total', () => {
  const indexed = row(90, 100);
  const unindexed = {...indexed};
  delete unindexed.logIndex;
  for (const rows of [[indexed, unindexed], [unindexed, indexed], [indexed, {...unindexed, value: '0100'}],
    [unindexed, {...unindexed, value: '0100'}], [{...unindexed, value: '0100'}, unindexed]]) {
    assert.throws(() => receipts(null, rows, snapshot), /ambiguous/i);
  }
  // Distinct log indices still identify separate, otherwise identical events.
  const separate = receipts(null, [indexed, {...indexed, logIndex: '1'}], snapshot);
  assert.equal(separate.count, 2);
  assert.equal(separate.totalRaw, '200');
});
