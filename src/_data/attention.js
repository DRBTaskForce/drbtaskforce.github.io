const normalizeAttention = require('../../scripts/normalize-attention.cjs');

module.exports = () => normalizeAttention(require('./creators.json'));
