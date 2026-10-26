const test=require('node:test');
const assert=require('node:assert/strict');
const T='0x4200000000000000000000000000000000000006';
const W='0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const item=(block,value='1')=>({block_number:block,block_hash:'0x'+'b'.repeat(64),log_index:0,
  transaction_hash:'0x'+String(block).padStart(64,'0'),timestamp:'2026-09-21T12:00:00Z',
  from:{hash:'0x'+'1'.repeat(40)},to:{hash:W},token:{address_hash:T,decimals:'18'},
  token_type:'ERC-20',total:{decimals:'18',value}});
const reply=data=>({ok:true,status:200,json:async()=>data});
test('v2 history keeps indexed WETH events within the observation and follows every cursor',async()=>{
  const fetchHistory=require('../scripts/weth-history-v2.cjs');
  const calls=[];
  const fetch=async url=>{calls.push(new URL(url));return reply(calls.length===1
    ?{items:[item(110),item(90)],next_page_params:{block_number:90,index:0}}
    :{items:[item(80,'2'),item(70)],next_page_params:null});};
  const rows=await fetchHistory(fetch,80,100);
  assert.deepEqual(rows.map(x=>[x.blockNumber,x.logIndex,x.value]),[['90','0','1'],['80','0','2']]);
  assert.equal(calls.length,2);
  assert.equal(calls[0].pathname,`/api/v2/addresses/${W}/token-transfers`);
  assert.equal(calls[1].searchParams.get('block_number'),'90');
});
test('v2 history rejects ambiguous identities, bad envelopes, nonprogress and incomplete pagination',async()=>{
  const fetchHistory=require('../scripts/weth-history-v2.cjs');
  for(const body of [{items:[{...item(90),log_index:undefined}],next_page_params:null},
    {items:[]}, {items:[],next_page_params:{block_number:90,index:0}},
    {items:[item(90)],next_page_params:null,errors:['partial']},
    {items:[item(90)],next_page_params:{block_number:90,index:0}}]) {
    await assert.rejects(fetchHistory(async()=>reply(body),0,100));
  }
  await assert.rejects(fetchHistory(async()=>({ok:false,status:503}),0,100),/503/);
  let calls=0;
  await assert.rejects(fetchHistory(async()=>reply(++calls===1
    ?{items:[item(90)],next_page_params:{block_number:90}}
    :{items:[],next_page_params:null}),0,100),/cursor/);
});
