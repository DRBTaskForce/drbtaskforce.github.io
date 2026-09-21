// Pure display adapter. Keep all helpers inside this function so the same code
// can be serialized into an offline browser preview without a filesystem.
module.exports = function normalizeAttention(snapshot = {}) {
  const stamp = typeof snapshot.lastUpdatedDaily === 'string' ? Date.parse(snapshot.lastUpdatedDaily) : NaN;
  const asOf = Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  const today = asOf ? asOf.slice(0, 10) : null;
  const history = snapshot.dailyHistory || {};
  const hasDailyHistory = today !== null && Array.isArray(history[today]);
  const avatars = new Map();

  // A blank current avatar can reuse a known image, but never an image from a
  // snapshot after the collection date being displayed.
  for (const date of Object.keys(history).sort()) {
    if (!today || date > today || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(history[date])) continue;
    for (const entry of history[date]) {
      if (entry.avatar) avatars.set(entry.author.toLowerCase(), entry.avatar);
    }
  }

  function datesInWindow(days) {
    if (!today) return [];
    const end = Date.parse(`${today}T00:00:00.000Z`);
    return Array.from({ length: days }, (_, index) =>
      new Date(end - (days - index - 1) * 86400000).toISOString().slice(0, 10));
  }

  function aggregate(dates) {
    const authors = new Map();
    for (const date of dates) {
      for (const entry of history[date]) {
        const key = entry.author.toLowerCase();
        if (!authors.has(key)) {
          authors.set(key, { author: entry.author, avatar: '', impressions: 0, reactions: 0, posts: 0, pct: 0 });
        }
        const author = authors.get(key);
        author.impressions += entry.impressions;
        author.reactions += entry.reactions;
        author.posts += entry.posts;
        if (entry.avatar) author.avatar = entry.avatar;
      }
    }
    const rows = [...authors.values()].sort((a, b) => b.impressions - a.impressions);
    const total = rows.reduce((sum, row) => sum + row.impressions, 0);
    return {
      total,
      rows: rows.map(row => ({
        ...row,
        avatar: row.avatar || avatars.get(row.author.toLowerCase()) || '',
        pct: total > 0 ? Math.round(row.impressions / total * 1000) / 10 : 0,
      })),
    };
  }

  const result = {
    asOf,
    collection: snapshot.collection?.version === 'expanded-search-v1' ? snapshot.collection : null,
    sourceUpdated: {
      daily: snapshot.lastUpdatedDaily || null,
      weekly: snapshot.lastUpdatedWeekly || null,
      monthly: snapshot.lastUpdatedMonthly || null,
    },
    periods: {},
  };

  for (const [period, days] of [['daily', 1], ['weekly', 7], ['monthly', 30]]) {
    const dates = datesInWindow(days);
    const coveredDates = dates.filter(date => Array.isArray(history[date]));
    const missingDates = dates.filter(date => !Array.isArray(history[date]));
    const available = hasDailyHistory;
    const { rows, total } = available ? aggregate(coveredDates) : { rows: [], total: null };
    result[period] = period === 'daily' ? rows.slice(0, 15) : rows;
    result.periods[period] = {
      startDate: dates[0] || null,
      endDate: today,
      expectedDays: days,
      coveredDays: coveredDates.length,
      coveredDates,
      missingDates,
      complete: available && missingDates.length === 0,
      available,
      source: available ? 'daily-history' : null,
      reason: available ? null : (today ? 'missing-daily-history' : 'missing-daily-date'),
      totalImpressions: total,
      totalAuthors: available ? rows.length : null,
    };
  }

  // The published daily list is still useful without its full history. Its
  // percentages already use an unknown full denominator, so preserve them.
  // Older history cannot make either longer period comparable to that list.
  if (today && !hasDailyHistory && Array.isArray(snapshot.daily)) {
    result.daily = snapshot.daily.slice(0, 15).map(row => ({
      ...row, avatar: row.avatar || avatars.get(row.author.toLowerCase()) || '',
    }));
    Object.assign(result.periods.daily, {
      available: true, source: 'saved-daily', reason: null,
      coveredDays: 1, coveredDates: [today], missingDates: [], complete: true,
    });
  }
  return result;
};
