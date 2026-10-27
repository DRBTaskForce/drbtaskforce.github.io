'use strict';
const WALLET = '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const TOKEN = '0x4200000000000000000000000000000000000006';
const hash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const integer = value => typeof value === 'string' && /^\d+$/.test(value);
const units = raw => {
  const n=BigInt(raw), whole=n/10n**18n, fraction=String(n%10n**18n).padStart(18,'0').replace(/0+$/,'');
  return String(whole)+(fraction?'.'+fraction:'');
};
function validate(saved) {
  if (!saved || saved.version!==1 || saved.chainId!==8453 || saved.wallet!==WALLET || saved.token!==TOKEN ||
      !integer(saved.totalRaw) || saved.total!==units(saved.totalRaw) || !Number.isSafeInteger(saved.count) || saved.count<0 ||
      !Number.isSafeInteger(saved.checkpointBlock) || saved.checkpointBlock<0 ||
      !Number.isSafeInteger(saved.queriedThroughBlock) || saved.queriedThroughBlock<saved.checkpointBlock ||
      !hash(saved.blockHash) || !Number.isFinite(Date.parse(saved.observedAt)) ||
      !Array.isArray(saved.boundary) || saved.boundary.some(x=>typeof x!=='string') ||
      (saved.checkpointBlock>0 && !saved.boundary.length)) throw new Error('Invalid saved WETH receipts checkpoint');
  return saved;
}

// Input must be the entire successful, bounded token-transfer response, including
// the previous checkpoint block. No balance value is used as a receipt total.
function receipts(previous, transfers, snapshot, legacy={}, fromBlock=previous?.checkpointBlock || 0) {
  if (previous) validate(previous);
  if (!Number.isSafeInteger(snapshot.blockNumber) || snapshot.blockNumber<0 || !hash(snapshot.blockHash) ||
      !Number.isFinite(Date.parse(snapshot.observedAt))) throw new Error('Invalid WETH observation');
  if (previous && (snapshot.blockNumber<previous.queriedThroughBlock || Date.parse(snapshot.observedAt)<Date.parse(previous.observedAt))) {
    throw new Error('WETH observation is older than saved evidence');
  }
  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0 || (previous && fromBlock !== 0 && fromBlock !== previous.checkpointBlock)) {
    throw new Error('WETH replay must start at genesis or the saved boundary');
  }
  if (!previous && fromBlock !== 0) throw new Error('Initial WETH replay must start at genesis');
  const seen=new Map(), identityModes=new Map(), blockHashes=new Map(), rows=[];
  for (const tx of transfers) {
    const block=Number(tx.blockNumber), index=tx.logIndex;
    if (!Number.isSafeInteger(block) || block<fromBlock || block>snapshot.blockNumber || !hash(tx.hash) || !hash(tx.blockHash) ||
        !address(tx.from) || !address(tx.to) || tx.contractAddress?.toLowerCase()!==TOKEN || String(tx.tokenDecimal)!=='18' ||
        !integer(tx.value) || (index!==undefined && !/^\d+$/.test(String(index))) || tx.isError==='1' ||
        ![tx.from.toLowerCase(),tx.to.toLowerCase()].includes(WALLET)) throw new Error('Invalid WETH transfer evidence');
    const blockHash=tx.blockHash.toLowerCase();
    if ((blockHashes.has(block) && blockHashes.get(block)!==blockHash) ||
        (block===snapshot.blockNumber && blockHash!==snapshot.blockHash.toLowerCase()) ||
        (previous && block===previous.queriedThroughBlock && blockHash!==previous.blockHash.toLowerCase())) {
      throw new Error('Conflicting WETH block hash evidence');
    }
    blockHashes.set(block,blockHash);
    const normalized=[tx.hash.toLowerCase(),index===undefined?null:BigInt(index).toString(),block,tx.blockHash.toLowerCase(),tx.from.toLowerCase(),tx.to.toLowerCase(),tx.value];
    const signature=JSON.stringify(normalized);
    // A copy without a log index cannot be distinguished from a separate
    // identical event. Do not count both representations or guess one away.
    const fingerprint=JSON.stringify([normalized[0],...normalized.slice(2,6),BigInt(tx.value).toString()]);
    const indexed=index!==undefined;
    if (identityModes.has(fingerprint) && (!indexed || !identityModes.get(fingerprint))) {
      throw new Error('WETH history has ambiguous repeated events without consistent log indices');
    }
    identityModes.set(fingerprint,indexed);
    // Legacy tokentx does not promise logIndex. Identical unindexed rows could
    // be duplicates OR real repeated events: refuse ambiguity rather than guess.
    const key=index===undefined?signature:normalized[0]+':'+normalized[1];
    if (seen.has(key)) {
      if(index===undefined) throw new Error('WETH history has ambiguous repeated events without log indices');
      if(seen.get(key)!==signature) throw new Error('Conflicting WETH transfer identity');
      continue;
    }
    seen.set(key,signature);rows.push({block,signature,incoming:normalized[5]===WALLET&&normalized[4]!==WALLET,value:BigInt(tx.value)});
  }
  if(previous) {
    const boundary=rows.filter(x=>x.block===previous.checkpointBlock).map(x=>x.signature).sort();
    if(JSON.stringify(boundary)!==JSON.stringify(previous.boundary)) throw new Error('WETH history boundary changed or is incomplete; saved receipts retained');
  }
  if (previous && fromBlock===0) {
    const prefix=rows.filter(row=>row.block<=previous.checkpointBlock && row.incoming);
    if(prefix.length!==previous.count || prefix.reduce((total,row)=>total+row.value,0n)!==BigInt(previous.totalRaw)) {
      throw new Error('WETH historical prefix changed; saved receipts retained pending reconciliation');
    }
  }
  const additions=rows.filter(x=>(!previous||x.block>previous.checkpointBlock)&&x.incoming);
  const totalRaw=(BigInt(previous?.totalRaw||'0')+additions.reduce((s,x)=>s+x.value,0n)).toString();
  const count=(previous?.count||0)+additions.length;
  const checkpointBlock=rows.reduce((last,row)=>Math.max(last,row.block),previous?.checkpointBlock||0);
  if(!previous) {
    const oldTotal=String(legacy.cumulativeWethEarned??'0');
    if(!/^\d+(?:\.\d{1,18})?$/.test(oldTotal)) throw new Error('Invalid legacy WETH history total');
    const [whole,fraction='']=oldTotal.split('.');const oldRaw=BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
    const legacyBlock=legacy.lastBlockWeth ?? 0, legacyCount=legacy.totalWethTransactions ?? 0;
    if (!Number.isSafeInteger(legacyBlock) || legacyBlock < 0 || !Number.isSafeInteger(legacyCount) || legacyCount < 0) {
      throw new Error('Invalid legacy WETH history checkpoint');
    }
    const prefix=rows.filter(row=>row.block<=legacyBlock && row.incoming);
    if (prefix.length!==legacyCount || prefix.reduce((sum,row)=>sum+row.value,0n)!==oldRaw) {
      throw new Error('Incomplete WETH history or changed legacy prefix/checkpoint; saved receipts retained pending reconciliation');
    }
    if(checkpointBlock<legacyBlock||count<legacyCount||BigInt(totalRaw)<oldRaw) {
      throw new Error('Incomplete WETH history: replay did not reach the saved receipt checkpoint, count or total');
    }
  }
  return validate({version:1,chainId:8453,wallet:WALLET,token:TOKEN,totalRaw,total:units(totalRaw),count,checkpointBlock,
    boundary:rows.filter(x=>x.block===checkpointBlock).map(x=>x.signature).sort(),
    queriedThroughBlock:snapshot.blockNumber,blockHash:snapshot.blockHash,observedAt:snapshot.observedAt,
    source:'Blockscout indexed WETH transfers; bounded by Base RPC observation',
    ...(previous?.reconciliation ? {reconciliation:previous.reconciliation} : {})});
}
module.exports=receipts;
module.exports.validate=validate;
