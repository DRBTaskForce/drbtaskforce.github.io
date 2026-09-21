const walletSummary = require('../../scripts/wallet-summary.cjs');

module.exports = () => walletSummary(require('./wallet.json'));
