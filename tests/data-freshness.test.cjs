const test = require('node:test');
const assert = require('node:assert/strict');
const freshness = require('../src/assets/js/data-freshness.js');

test('sixteen-hour-old daily rankings stay within their scheduled refresh window', () => {
  const state = freshness.assess('rankings', '2026-10-17T14:05:00Z', Date.parse('2026-10-18T06:05:00Z'));
  assert.equal(state.state, 'scheduled');
  assert.equal(state.nextScheduledAt, '2026-10-18T14:00:00.000Z');
  assert.equal(state.overdueAt, '2026-10-18T16:00:00.000Z');
  assert.equal(freshness.assess('rankings','2026-10-17T14:05:00Z',Date.parse('2026-10-18T16:00:01Z')).state,'overdue');
});

test('wallet cadence includes the short midnight gap and all dates use UTC', () => {
  const state=freshness.assess('wallet', '2026-10-17T20:20:00Z', Date.parse('2026-10-18T02:18:00Z'));
  assert.equal(state.nextScheduledAt, '2026-10-18T00:17:00.000Z');
  assert.equal(state.state,'overdue');
  assert.equal(freshness.assess('posts','2026-10-17T02:05:00Z',Date.parse('2026-10-18T03:00:00Z')).state,'scheduled');
  for(const value of [null,'bad','2026-10-19T00:00:00Z']) assert.equal(freshness.assess('rankings',value,Date.parse('2026-10-18T06:00:00Z')).state,'unknown');
});
