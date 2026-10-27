const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const status = require('../scripts/data-status.cjs');
const check = require('../scripts/check-data-status.cjs');
const root = path.resolve(__dirname, '..');

test('build time never changes the saved observations or their source fingerprints', () => {
  const a = status(root, '2026-10-18T12:00:00Z');
  const b = status(root, '2026-10-19T12:00:00Z');
  assert.notEqual(a.generatedAt, b.generatedAt);
  assert.deepEqual(a.sources, b.sources);
  assert.deepEqual(a.metrics, b.metrics);
  assert.equal(a.sources.rankings.observedAt, require('../src/_data/creators.json').lastUpdatedDaily);
});

test('offline output check rejects mismatched pages, manifests and changed saved data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'drb-data-status-'));
  try {
    for (const name of ['src','scripts']) fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
    fs.copyFileSync(path.join(root,'.eleventy.js'),path.join(dir,'.eleventy.js'));
    const bin = path.join(path.dirname(require.resolve('@11ty/eleventy/package.json')),'cmd.js');
    execFileSync(process.execPath,[bin,'--quiet'],{cwd:dir,stdio:'pipe'});
    const site = path.join(dir,'_site');
    assert.doesNotThrow(()=>check(dir,site));
    const walletPath=path.join(site,'wallet/index.html'), original=fs.readFileSync(walletPath,'utf8');
    const amount=status(dir).metrics.wethReceived;
    fs.writeFileSync(walletPath,original.replace(amount+' WETH','999 WETH'));
    assert.throws(()=>check(dir,site),/WETH/);
    fs.writeFileSync(walletPath,original);
    const manifestPath=path.join(site,'data-status.json'), manifest=fs.readFileSync(manifestPath,'utf8');
    fs.writeFileSync(manifestPath,manifest.replace('"version": 1','"version": 99'));
    assert.throws(()=>check(dir,site),/manifest/);
    fs.writeFileSync(manifestPath,manifest);
    // The release base can already contain a newer production observation.
    // Construct a genuinely later fixture rather than assuming an October 18 one wins.
    const observedAt=new Date(Date.parse(status(dir).sources.balances.observedAt)+86400000).toISOString();
    const savedWallet=JSON.parse(fs.readFileSync(path.join(dir,'src/_data/wallet.json'),'utf8'));
    const blockNumber=Math.max(99999999,(savedWallet.currentSnapshot?.blockNumber??0)+1);
    const observation = {version:1,chainId:8453,walletAddress:'0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9',
      blockNumber,blockHash:'0x'+'a'.repeat(64),date:observedAt.slice(0,10),observedAt,
      rawBalances:{drb:'0',weth:'0',eth:'0',usdc:'0'},drb:0,weth:0,eth:0,usdc:0,drbPrice:1,ethPrice:1000,usd:0};
    fs.writeFileSync(path.join(dir,'src/_data/walletObservation.json'),JSON.stringify(observation));
    execFileSync(process.execPath,[bin,'--quiet'],{cwd:dir,stdio:'pipe'});
    const independent=check(dir,site);
    assert.equal(independent.sources.balances.file,'walletObservation.json');
    assert.equal(independent.sources.balances.observedAt,observation.observedAt);
    assert.equal(independent.metrics.walletTotal,'$0.00');
    fs.appendFileSync(path.join(dir,'src/_data/creators.json'),'\n');
    assert.throws(()=>check(dir,site),/manifest/);
  } finally { if(!process.env.KEEP_TEST_FIXTURES) fs.rmSync(dir,{recursive:true,force:true}); }
});
