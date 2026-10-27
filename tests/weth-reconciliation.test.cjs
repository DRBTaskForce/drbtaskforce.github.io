const test = require('node:test');
const assert = require('node:assert/strict');
const W = '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const T = '0x4200000000000000000000000000000000000006';
const other = '0x'+'1'.repeat(40);
const hash = n => '0x'+String(n).padStart(64,'0');
const transfer = (block,value) => ({blockNumber:String(block),blockHash:hash(block),hash:hash(block+100),
  logIndex:'0',contractAddress:T,tokenDecimal:'18',from:other,to:W,value:String(value)});
function fixture() {
  const a=transfer(10,100), b=transfer(20,20), c=transfer(30,30);
  const legacy=[a,b].map(({logIndex,...row})=>row);
  const proof = row => ({transactionHash:row.hash,blockNumber:'0x'+Number(row.blockNumber).toString(16),
    blockHash:row.blockHash,status:'0x1',logs:[{transactionHash:row.hash,blockHash:row.blockHash,
      blockNumber:'0x'+Number(row.blockNumber).toString(16),logIndex:'0x0',address:T,removed:false,
      topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        '0x'+other.slice(2).padStart(64,'0'),'0x'+W.slice(2).padStart(64,'0')],
      data:'0x'+BigInt(row.value).toString(16).padStart(64,'0')}]});
  return {original:{walletAddress:W,wethContract:T,lastBlockWeth:30,cumulativeWethEarned:'0.0000000000000001',totalWethTransactions:1},
    legacy,replay:[a,b,c],missingFromSaved:[b.hash+':0'],receipts:[proof(b),proof(c)],
    block:{number:'0x1e',hash:hash(30),timestamp:'0x69000000'},
    history:[{checkpoint:10,totalRaw:'100',count:1},{checkpoint:30,totalRaw:'100',count:1}]};
}
test('explicit reconciliation proves corrections and creates a new baseline without changing the original',()=>{
  const reconcile=require('../scripts/reconcile-weth-history.cjs');
  const input=fixture(),before=JSON.stringify(input.original);
  const result=reconcile(input);
  assert.equal(result.receipts.totalRaw,'150');
  assert.equal(result.receipts.count,3);
  assert.equal(result.receipts.queriedThroughBlock,30);
  assert.equal(result.audit.correctionRaw,'50');
  assert.equal(result.audit.precisionOverstatementRaw,'0');
  assert.equal(JSON.stringify(input.original),before);
  const record=require('../scripts/weth-receipts.cjs');
  assert.throws(()=>record(null,input.replay,{blockNumber:30,blockHash:hash(30),observedAt:'2026-10-18T00:00:00Z'},input.original),/prefix/);
  const extended=record(result.receipts,[input.replay.at(-1)],{blockNumber:31,blockHash:hash(31),observedAt:'2026-10-23T00:00:00Z'});
  assert.equal(extended.totalRaw,'150');
  assert.deepEqual(extended.reconciliation,result.receipts.reconciliation);
});
test('reconciliation rejects missing or altered chain evidence and unexplained saved accounting',()=>{
  const reconcile=require('../scripts/reconcile-weth-history.cjs');
  const changes=[
    x=>x.receipts.pop(),x=>x.receipts[0].status='0x0',x=>x.receipts[0].logs[0].data='0x01',
    x=>x.receipts[0].logs[0].removed=true,x=>x.receipts[0].logs[0].topics[0]=hash(1),
    x=>x.block.hash=hash(999),x=>x.history[1].totalRaw='101',
    x=>x.block.number+='junk',x=>x.block.timestamp+='junk',
    x=>x.receipts[0].blockNumber+='junk',x=>x.receipts[0].logs[0].blockNumber+='junk',
    x=>x.receipts[0].logs[0].logIndex+='junk',
    x=>x.replay.pop(),x=>x.missingFromSaved.push(x.missingFromSaved[0]),
  ];
  for(const change of changes){const input=fixture();change(input);assert.throws(()=>reconcile(input));}
});
