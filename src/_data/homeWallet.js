const fs = require('node:fs');
const path = require('node:path');
const walletSummary = require('../../scripts/wallet-summary.cjs');

module.exports = () => {
  const receiptPath = path.join(__dirname, 'wethReceipts.json');
  const receipts = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;
  return walletSummary(require('../../scripts/wallet-observation.cjs').read(path.join(__dirname,'../..')).wallet, receipts);
};
