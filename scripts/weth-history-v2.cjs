'use strict';
const W='0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const T='0x4200000000000000000000000000000000000006';
// Scan to a terminal cursor, including earlier indexed events. The receipt
// validator independently enforces the old prefix/boundary before publishing.
module.exports=async function wethHistory(fetchPage,fromBlock,endBlock) {
  if(!Number.isSafeInteger(fromBlock)||fromBlock<0||!Number.isSafeInteger(endBlock)||endBlock<fromBlock) throw new Error('Invalid WETH v2 bounds');
  const base=`https://base.blockscout.com/api/v2/addresses/${W}/token-transfers`;
  let cursor=null,lastBlock=Infinity;
  const seen=new Set(),rows=[];
  for(let page=0;page<200;page++) {
    const url=new URL(base);url.searchParams.set('type','ERC-20');
    for(const [key,value] of Object.entries(cursor||{})) url.searchParams.set(key,String(value));
    const response=await fetchPage(url.toString());
    if(!response.ok) throw new Error(`Blockscout WETH v2 HTTP error: ${response.status}`);
    const body=await response.json();
    if(!body || !Array.isArray(body.items) || !Object.hasOwn(body,'next_page_params') || body.error || body.errors ||
      (body.next_page_params!==null && (!body.next_page_params || Array.isArray(body.next_page_params) || typeof body.next_page_params!=='object'))) {
      throw new Error('Incomplete WETH v2 history response');
    }
    for(const item of body.items) {
      const block=item.block_number;
      if(!Number.isSafeInteger(block)||block<0||block>lastBlock) throw new Error('WETH v2 history is not ordered');
      lastBlock=block;
      if(typeof item.token?.address_hash!=='string') throw new Error('Invalid WETH v2 token identity');
      if(item.token.address_hash.toLowerCase()!==T) continue;
      if(item.token_type!=='ERC-20'||item.token.decimals!=='18'||item.total?.decimals!=='18' ||
        typeof item.total.value!=='string'||!/^\d+$/.test(item.total.value)) throw new Error('Invalid WETH v2 amount');
      if(!Number.isSafeInteger(item.log_index)||item.log_index<0) throw new Error('Ambiguous WETH v2 event without log index');
      const timestamp=Date.parse(item.timestamp);
      if(!Number.isFinite(timestamp)) throw new Error('Invalid WETH v2 timestamp');
      if(block>=fromBlock && block<=endBlock) rows.push({blockNumber:String(block),blockHash:item.block_hash,
        hash:item.transaction_hash,logIndex:String(item.log_index),contractAddress:T,tokenDecimal:'18',
        from:item.from?.hash,to:item.to?.hash,value:item.total.value,timeStamp:String(Math.floor(timestamp/1000))});
    }
    if(body.next_page_params===null) return rows;
    cursor=body.next_page_params;
    if(!body.items.length || !Number.isSafeInteger(cursor.index) || !Number.isSafeInteger(cursor.block_number) || Object.entries(cursor).some(([key,value])=>
      !['block_number','index','items_count'].includes(key) || !Number.isSafeInteger(value) || value<0) ||
      cursor.block_number!==lastBlock) throw new Error('Invalid WETH v2 pagination cursor');
    const key=JSON.stringify(Object.entries(cursor).sort());
    if(seen.has(key)) throw new Error('Incomplete WETH v2 history: repeated cursor');
    seen.add(key);
  }
  throw new Error('Incomplete WETH v2 history: page limit');
};
