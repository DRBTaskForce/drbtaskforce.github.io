const path = require('node:path');
module.exports = () => require('../../scripts/wallet-observation.cjs').read(path.join(__dirname,'../..')).wallet;
