'use strict';

// Explicit OFFLINE migration, never a fallback in the normal collector.
// Input contains the retained original, both transfer captures, successful RPC
// receipts, the checkpoint block, and the saved/reconstructed arithmetic steps.
const record = require('./weth-receipts.cjs');
const {createHash} = require('node:crypto');
const W = '0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9';
const T = '0x4200000000000000000000000000000000000006';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const units = raw => `${raw/10n**18n}.${String(raw%10n**18n).padStart(18,'0')}`;
function requireEvidence(ok,message) { if(!ok) throw new Error(`WETH reconciliation: ${message}`); }
function quantity(value) {
  requireEvidence(typeof value==='string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value),'invalid RPC quantity');
  const number=Number(BigInt(value));
  requireEvidence(Number.isSafeInteger(number),'RPC quantity exceeds safe integer');
  return number;
}
function decimalRaw(value) {
  requireEvidence(typeof value==='string' && /^\d+(?:\.\d{1,18})?$/.test(value),'invalid saved total');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
}
const identity = row => row.hash.toLowerCase()+':'+BigInt(row.logIndex).toString();
const fingerprint = row => JSON.stringify([row.hash.toLowerCase(),row.blockHash.toLowerCase(),Number(row.blockNumber),
  row.from.toLowerCase(),row.to.toLowerCase(),BigInt(row.value).toString()]);
const incoming = row => row.to.toLowerCase()===W && row.from.toLowerCase()!==W;
const sum = rows => rows.reduce((n,row)=>n+BigInt(row.value),0n);

function reconcile(input) {
  const {original,legacy,replay,missingFromSaved,receipts,block,history}=input;
  requireEvidence(original?.walletAddress?.toLowerCase()===W && original.wethContract?.toLowerCase()===T,'wrong original wallet or token');
  const checkpoint=original.lastBlockWeth,originalRaw=decimalRaw(original.cumulativeWethEarned);
  requireEvidence(Number.isSafeInteger(checkpoint) && checkpoint>0 && Number.isSafeInteger(original.totalWethTransactions),'invalid original checkpoint');
  requireEvidence(quantity(block?.number)===checkpoint && /^0x[\da-f]{64}$/i.test(block?.hash),'checkpoint block mismatch');
  const timestamp=quantity(block.timestamp);
  requireEvidence(Number.isSafeInteger(timestamp) && timestamp>0,'invalid checkpoint time');
  const snapshot={blockNumber:checkpoint,blockHash:block.hash,observedAt:new Date(timestamp*1000).toISOString()};
  requireEvidence(Array.isArray(replay) && replay.every(row=>row.logIndex!==undefined),'replay needs indexed event identities');
  // Existing validator checks all event/block identities and bounds. No legacy
  // gate is changed: this command first proves why a separate anchor is needed.
  const candidate=record(null,replay,snapshot);
  requireEvidence(candidate.checkpointBlock===checkpoint,'replay did not reach original checkpoint');
  const unique=new Map(replay.map(row=>[identity(row),row]));
  const prefix=[...unique.values()].filter(incoming);
  requireEvidence(Array.isArray(legacy) && legacy.length>0,'missing legacy capture');
  const oldRows=legacy.filter(row=>Number(row.blockNumber)<=checkpoint);
  for(const row of oldRows) {
    requireEvidence(row.contractAddress?.toLowerCase()===T && String(row.tokenDecimal)==='18' &&
      /^\d+$/.test(row.value) && /^0x[\da-f]{64}$/i.test(row.hash) && /^0x[\da-f]{64}$/i.test(row.blockHash) &&
      /^0x[\da-f]{40}$/i.test(row.from) && /^0x[\da-f]{40}$/i.test(row.to) &&
      Number.isSafeInteger(Number(row.blockNumber)) && Number(row.blockNumber)>=0 &&
      [row.from.toLowerCase(),row.to.toLowerCase()].includes(W),'invalid legacy event');
  }
  const oldIncoming=oldRows.filter(incoming),available=new Map();
  for(const row of oldIncoming) {const key=fingerprint(row);available.set(key,(available.get(key)||0)+1);}
  const extras=[];
  for(const row of prefix) {
    const key=fingerprint(row),count=available.get(key)||0;
    if(count) available.set(key,count-1); else extras.push(row);
  }
  requireEvidence([...available.values()].every(n=>n===0),'legacy evidence absent from replacement replay');
  requireEvidence(Array.isArray(missingFromSaved) && new Set(missingFromSaved).size===missingFromSaved.length,'duplicate missing identities');
  const missing=missingFromSaved.map(id=>unique.get(id));
  requireEvidence(missing.every(row=>row && incoming(row) && !extras.some(x=>identity(x)===identity(row))),'missing event not shared by both captures');
  const missingFingerprints=new Set(missing.map(fingerprint));
  requireEvidence(missing.every(row=>oldIncoming.filter(x=>fingerprint(x)===fingerprint(row)).length===1),'ambiguous legacy missing identity');

  // Reproduce the old collector's exact Number -> Math.round -> BigInt path.
  // Every saved step must match, including count. Reconstructed steps are
  // explicitly retained in the audit rather than claimed as captured runs.
  requireEvidence(Array.isArray(history) && history.length>=2,'missing precision history');
  const first=history[0],anchor=oldIncoming.filter(row=>Number(row.blockNumber)<=first.checkpoint);
  requireEvidence(sum(anchor)===BigInt(first.totalRaw) && anchor.length===first.count,'history anchor is not exact legacy evidence');
  requireEvidence(missing.every(row=>Number(row.blockNumber)>first.checkpoint),'missing event precedes exact anchor');
  let drift=0n;
  for(let i=1;i<history.length;i++) {
    const before=history[i-1],after=history[i];
    requireEvidence(Number.isSafeInteger(after.checkpoint) && after.checkpoint>=before.checkpoint && after.checkpoint<=checkpoint,'history checkpoint regression');
    const prior=BigInt(before.totalRaw),rounded=BigInt(Math.round(Number(units(prior))*1e18));
    const interval=oldIncoming.filter(row=>Number(row.blockNumber)>before.checkpoint && Number(row.blockNumber)<=after.checkpoint && !missingFingerprints.has(fingerprint(row)));
    requireEvidence(rounded+sum(interval)===BigInt(after.totalRaw) && before.count+interval.length===after.count,'unexplained saved accounting step');
    drift+=rounded-prior;
  }
  const last=history.at(-1);
  requireEvidence(last.checkpoint===checkpoint && BigInt(last.totalRaw)===originalRaw && last.count===original.totalWethTransactions,'history does not terminate at original snapshot');

  const corrections=[...extras,...missing];
  requireEvidence(new Set(corrections.map(identity)).size===corrections.length,'duplicate correction');
  for(const row of corrections) {
    const found=receipts.filter(r=>r.transactionHash?.toLowerCase()===row.hash.toLowerCase());
    requireEvidence(found.length===1,'missing or duplicate transaction receipt');
    const receipt=found[0];
    requireEvidence(receipt.status==='0x1' && receipt.blockHash?.toLowerCase()===row.blockHash.toLowerCase() &&
      quantity(receipt.blockNumber)===Number(row.blockNumber),'invalid transaction receipt');
    const logs=receipt.logs.filter(log=>quantity(log.logIndex)===Number(row.logIndex));
    requireEvidence(logs.length===1,'missing or duplicate receipt log');
    const log=logs[0];
    requireEvidence(log.removed===false && log.address?.toLowerCase()===T && log.transactionHash?.toLowerCase()===row.hash.toLowerCase() &&
      log.blockHash?.toLowerCase()===row.blockHash.toLowerCase() && quantity(log.blockNumber)===Number(row.blockNumber) &&
      log.topics?.length===3 && log.topics[0].toLowerCase()===TOPIC &&
      log.topics[1].toLowerCase()==='0x'+row.from.slice(2).toLowerCase().padStart(64,'0') &&
      log.topics[2].toLowerCase()==='0x'+row.to.slice(2).toLowerCase().padStart(64,'0') &&
      /^0x[\da-f]{64}$/i.test(log.data) && BigInt(log.data)===BigInt(row.value),'chain log disagrees with correction');
  }
  const correctionRaw=sum(corrections);
  requireEvidence(originalRaw+correctionRaw-drift===BigInt(candidate.totalRaw) &&
    original.totalWethTransactions+corrections.length===candidate.count,'corrections do not reconcile exact prefix');
  const audit={version:1,originalCheckpoint:checkpoint,originalCount:original.totalWethTransactions,originalTotalRaw:originalRaw.toString(),
    correctedCount:candidate.count,correctedTotalRaw:candidate.totalRaw,correctionRaw:correctionRaw.toString(),
    precisionOverstatementRaw:drift.toString(),providerOnly:extras.map(identity),missingFromSaved:missing.map(identity),history,
    inputSha256:digest(input),originalSnapshotCanonicalSha256:digest(original),
    note:'Indexed transfer replay reconciled against archived evidence and chain receipts for each correction. This does not classify receipts as LP fees.'};
  const correctedAnchor={...original,cumulativeWethEarned:units(BigInt(candidate.totalRaw)),totalWethTransactions:candidate.count};
  const baseline=record(null,replay,snapshot,correctedAnchor);
  return {receipts:{...baseline,reconciliation:{auditSha256:digest(audit),originalTotalRaw:originalRaw.toString(),originalCount:original.totalWethTransactions}},audit};
}
module.exports=reconcile;

if(require.main===module) {
  const fs=require('node:fs'),path=require('node:path');
  try {
    const [inputPath,outputDirectory]=process.argv.slice(2);
    requireEvidence(inputPath && outputDirectory,'usage: node scripts/reconcile-weth-history.cjs INPUT.json NEW_OUTPUT_DIRECTORY');
    const result=reconcile(JSON.parse(fs.readFileSync(inputPath,'utf8')));
    // Explicit new directory only; never replace any saved site data or checkpoint.
    fs.mkdirSync(outputDirectory);
    fs.writeFileSync(path.join(outputDirectory,'reconciliation.json'),JSON.stringify(result.audit,null,2)+'\n',{flag:'wx'});
    fs.writeFileSync(path.join(outputDirectory,'wethReceipts.json'),JSON.stringify(result.receipts,null,2)+'\n',{flag:'wx'});
    console.log(`Reconciled ${result.audit.correctedCount} incoming transfers at block ${result.audit.originalCheckpoint}: ${result.receipts.total} WETH`);
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
