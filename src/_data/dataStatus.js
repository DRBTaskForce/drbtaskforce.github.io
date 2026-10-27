const path = require('node:path');
module.exports = () => require('../../scripts/data-status.cjs')(path.join(__dirname,'../..'));
