'use strict';

// Present the collected snapshot; never substitute the build time for its date.
module.exports = function walletSummary(wallet) {
  const latest = wallet.walletValueAllTime?.at(-1);
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (!latest || !validDate(latest.date) || !validDate(wallet.lastUpdated)
      || !['usd', 'drb', 'weth', 'usdc', 'eth'].every(key => amount(latest[key]))) {
    throw new Error('A valid saved wallet snapshot is required for the homepage.');
  }
  const cutoff = new Date(latest.date);
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  const from = cutoff.toISOString().slice(0, 10);
  const points = wallet.walletValueAllTime.filter(point => point.date >= from && point.date <= latest.date);
  if (!points.length || points.some(point => !validDate(point.date) || !amount(point.usd))) {
    throw new Error('Saved wallet history is invalid.');
  }
  const fees = Number(wallet.cumulativeWethEarned);
  if (!amount(fees)) throw new Error('Saved WETH receipts are invalid.');
  const number = (value, digits) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const usd = value => '$' + number(value, 2);
  const date = (value, long = false) => new Intl.DateTimeFormat('en-US', {
    month: long ? 'long' : 'short', day: 'numeric', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC',
  }).format(new Date(value));
  const first = points[0];
  const last = points.at(-1);
  const minimum = Math.min(...points.map(point => point.usd));
  const maximum = Math.max(...points.map(point => point.usd));
  const span = maximum - minimum || Math.max(maximum * 0.1, 1);
  const step = 10 ** Math.floor(Math.log10(span));
  const lower = Math.max(0, Math.floor((minimum - (maximum === minimum ? span : 0)) / step) * step);
  const upper = Math.max(lower + step, Math.ceil((maximum + (maximum === minimum ? span : 0)) / step) * step);
  const y = value => (181 - (value - lower) / (upper - lower) * 169).toFixed(2);
  const xy = points.map((point, index) => ({
    x: (points.length === 1 ? 512 : 48 + index / (points.length - 1) * 464).toFixed(2), y: y(point.usd),
  }));
  const line = xy.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const tick = value => '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value).toLowerCase();
  const collectedAt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(wallet.lastUpdated)) + ' UTC';
  const valuationDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(latest.date));
  const startYear = first.date.slice(0, 4), endYear = last.date.slice(0, 4);
  const range = `${date(first.date)}${startYear === endYear ? '' : ', ' + startYear}–${date(last.date)}, ${endYear}`;
  return {
    total: usd(latest.usd),
    asOf: latest.date === new Date(wallet.lastUpdated).toISOString().slice(0, 10) ? collectedAt : `${valuationDate} · collected ${collectedAt}`,
    balances: { drb: number(latest.drb, 0), weth: number(latest.weth, 4), usdc: number(latest.usdc, 2), eth: number(latest.eth, 4) },
    wethReceived: number(fees, 4),
    history: points,
    chart: {
      title: `Saved wallet value in US dollars, ${date(first.date, true)} to ${date(last.date, true)}`,
      description: `${points.length} daily samples. Starts at ${usd(first.usd)} and ends at ${usd(last.usd)}. Values range from ${usd(minimum)} to ${usd(maximum)}. The vertical axis spans ${usd(lower)} to ${usd(upper)}; this chart shows wallet value, not investment returns.`,
      ticks: [upper, (upper + lower) / 2, lower].map(value => ({ y: y(value), textY: (Number(y(value)) + 4).toFixed(2), label: tick(value) })),
      line, area: `${line} L ${xy.at(-1).x} 181 L ${xy[0].x} 181 Z`, end: xy.at(-1),
      startLabel: date(first.date), endLabel: date(last.date),
      caption: `${points.length} daily samples · ${range} · USD`,
    },
  };
};
