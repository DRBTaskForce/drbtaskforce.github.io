(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.DrbFreshness = api;
    const refresh = () => document.querySelectorAll('[data-freshness]').forEach(element => {
      const result = api.assess(element.dataset.freshness, element.dataset.collectedAt);
      element.dataset.freshnessState = result.state;
      element.textContent = result.message;
      element.title = result.nextScheduledAt ? `Next scheduled collection: ${result.nextScheduledAt}. Two-hour allowance for collection and publication.` : '';
    });
    refresh();
    setInterval(refresh, 60000);
  }
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const schedules = { rankings: [14 * 60], posts: [2 * 60], wallet: [17, 317, 617, 917, 1217] };
  const grace = 2 * 60 * 60 * 1000;
  function assess(kind, collectedAt, now = Date.now()) {
    const stamp = typeof collectedAt === 'string' ? Date.parse(collectedAt) : NaN;
    if (!schedules[kind] || !Number.isFinite(stamp) || !Number.isFinite(now) || stamp > now) {
      return { state: 'unknown', message: 'Refresh status unavailable. Check the saved date.' };
    }
    const date = new Date(stamp);
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const next = [...schedules[kind].map(minutes => midnight + minutes * 60000), midnight + 86400000 + schedules[kind][0] * 60000]
      .find(slot => slot > stamp);
    const overdue = now > next + grace;
    return {
      state: overdue ? 'overdue' : 'scheduled',
      nextScheduledAt: new Date(next).toISOString(), overdueAt: new Date(next + grace).toISOString(),
      message: overdue ? 'Update overdue. Last saved data is shown.'
        : kind === 'wallet' ? 'Within the scheduled wallet refresh window.' : 'Within the daily refresh window.',
    };
  }
  return { assess, schedules, grace };
});
