(() => {
  'use strict';
  const wallet = JSON.parse(document.getElementById('wallet-data').textContent);
  // --- Static data (historical prices baked in at build time) ---
  const valueAllTime    = wallet.walletValueAllTime || [];
  const valueLast30Days = historyWindow(30);

  const WALLET        = wallet.walletAddress;
  const TOKEN         = wallet.tokenContract;
  const WETH_CONTRACT = wallet.wethContract;
  const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const DECIMALS      = wallet.tokenDecimals;
  const USDC_DECIMALS = 6;

  // --- Currency list ---
  const CURRENCIES = [
    ['USD','US Dollar'],['EUR','Euro'],['GBP','British Pound'],['JPY','Japanese Yen'],
    ['CAD','Canadian Dollar'],['AUD','Australian Dollar'],['CHF','Swiss Franc'],
    ['CNY','Chinese Yuan'],['KRW','South Korean Won'],['INR','Indian Rupee'],
    ['BRL','Brazilian Real'],['MXN','Mexican Peso'],['SGD','Singapore Dollar'],
    ['HKD','Hong Kong Dollar'],['NZD','New Zealand Dollar'],['NOK','Norwegian Krone'],
    ['SEK','Swedish Krona'],['DKK','Danish Krone'],['PLN','Polish Zloty'],
    ['CZK','Czech Koruna'],['HUF','Hungarian Forint'],['TRY','Turkish Lira'],
    ['ZAR','South African Rand'],['AED','UAE Dirham'],['SAR','Saudi Riyal'],
    ['TWD','Taiwan Dollar'],['THB','Thai Baht'],['MYR','Malaysian Ringgit'],
    ['IDR','Indonesian Rupiah'],['PHP','Philippine Peso'],
  ];

  const REGION_CURRENCY = {
    US:'USD', GB:'GBP', AU:'AUD', CA:'CAD', NZ:'NZD',
    JP:'JPY', CN:'CNY', KR:'KRW', IN:'INR', SG:'SGD',
    HK:'HKD', TW:'TWD', TH:'THB', ID:'IDR', MY:'MYR',
    PH:'PHP', BR:'BRL', MX:'MXN', CH:'CHF',
    NO:'NOK', SE:'SEK', DK:'DKK', PL:'PLN', CZ:'CZK',
    HU:'HUF', TR:'TRY', ZA:'ZAR', SA:'SAR', AE:'AED',
    DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR', PT:'EUR',
    NL:'EUR', BE:'EUR', AT:'EUR', FI:'EUR', GR:'EUR',
    IE:'EUR', LU:'EUR', SK:'EUR', SI:'EUR', EE:'EUR',
    LV:'EUR', LT:'EUR', MT:'EUR', CY:'EUR',
  };

  let localCurrency = 'USD';
  let exchangeRate  = 1;
  let allRates      = { USD: 1 };
  let liveData      = null;
  let currentChartMode = '30d';
  let requestedCurrency = 'USD';
  let walletInitialized = false;

  const finiteAmount = value => Number.isFinite(value) && value >= 0 ? value : null;
  const lastStatic = wallet.currentSnapshot || (valueAllTime.length ? valueAllTime[valueAllTime.length - 1] : null);
  const savedDate = lastStatic?.observedAt || lastStatic?.date || wallet.lastUpdated;
  const formatDate = (date, short = false) => new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });

  async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      // Keep the deadline active until the response body has also arrived.
      return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
    } finally {
      clearTimeout(timer);
    }
  }

  // 2026-05-04: LLM-on-LLM prompt injection drained 3B DRB (~$170K). Root cause: Bankr's
  // hardcoded block on Grok replies was dropped in an agent rewrite, letting an attacker
  // prompt Grok into instructing Bankr to transfer funds. 80% returned; 20% pending.
  const HACK_DATE = '2026-05-04';

  // Returns annotation config positioned by numeric index so the line appears even when
  // HACK_DATE isn't an exact label (e.g. wallet.json was last updated before the event).
  function hackAnnotation(data) {
    if (!data || data.length < 2) return { annotations: {} };

    let xVal;
    const exactIdx = data.findIndex(d => d.date === HACK_DATE);
    if (exactIdx !== -1) {
      xVal = HACK_DATE; // use label string so CategoryScale resolves it correctly
    } else {
      const afterIdx = data.findIndex(d => d.date > HACK_DATE);
      if (afterIdx <= 0) return { annotations: {} }; // date outside chart range
      const t = (new Date(HACK_DATE) - new Date(data[afterIdx - 1].date)) /
                (new Date(data[afterIdx].date)  - new Date(data[afterIdx - 1].date));
      xVal = afterIdx - 1 + t;
    }

    return {
      annotations: {
        hackEvent: {
          type: 'line',
          xScaleID: 'x',
          xMin: xVal,
          xMax: xVal,
          borderColor: '#a53e35',
          borderWidth: 1.5,
          borderDash: [4, 4],
          click: () => window.open('https://x.com/0xdeployer/status/2051315834212303334', '_blank', 'noopener'),
          enter: () => { document.body.style.cursor = 'pointer'; },
          leave: () => { document.body.style.cursor = 'default'; },
          label: {
            content: '⚠ Prompt injection attack',
            display: true,
            position: 'center',
            yAdjust: 0,
            color: '#a53e35',
            backgroundColor: '#fafafa',
            font: { size: 11, weight: 'bold' },
            padding: { x: 6, y: 3 },
          }
        }
      }
    };
  }

  async function initCurrency() {
    // Populate select options
    const sel = document.getElementById('currency-select');
    sel.replaceChildren();
    CURRENCIES.forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} — ${name}`;
      opt.disabled = code !== 'USD';
      sel.appendChild(opt);
    });

    // Detect default from locale, then check localStorage override
    let detected = 'USD';
    try {
      const region = new Intl.Locale(navigator.language).region || '';
      detected = REGION_CURRENCY[region] || 'USD';
    } catch {}
    let saved;
    try { saved = localStorage.getItem('drb-currency'); } catch {}
    requestedCurrency = (saved && CURRENCIES.find(c => c[0] === saved)) ? saved : detected;
    sel.value = 'USD';
    sel.disabled = false;
    document.getElementById('currency-status').textContent = 'Showing USD while exchange rates load.';

    // Fetch all rates in one call
    try {
      const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('Exchange rates unavailable');
      const d   = res.data;
      allRates = { USD: 1 };
      for (const [code] of CURRENCIES) {
        if (Number.isFinite(d.rates?.[code]) && d.rates[code] > 0) allRates[code] = d.rates[code];
      }
      allRates.USD = 1;
      for (const option of sel.options) option.disabled = !allRates[option.value];
    } catch { allRates = { USD: 1 }; }
    localCurrency = allRates[requestedCurrency] ? requestedCurrency : 'USD';
    exchangeRate = allRates[localCurrency];
    sel.value = localCurrency;
    updateCurrencyStatus();
    if (liveData) renderStats(liveData);
    showChart(currentChartMode);
  }

  function onCurrencyChange(value) {
    if (!allRates[value]) return;
    requestedCurrency = localCurrency = value;
    exchangeRate  = allRates[localCurrency];
    try { localStorage.setItem('drb-currency', value); } catch {}
    updateCurrencyStatus();
    if (liveData) renderStats(liveData);
    showChart(currentChartMode);
  }

  function updateCurrencyStatus() {
    document.getElementById('currency-status').textContent = Object.keys(allRates).length > 1
      ? `Values shown in ${localCurrency}. Conversions use current exchange rates; token balances stay unchanged.`
      : 'Exchange rates unavailable. Showing USD; other currencies are temporarily unavailable.';
  }

  // --- Formatting ---
  function formatDrb(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  }
  function formatWeth(n) { return n.toFixed(4); }
  function formatLocal(usdAmount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: localCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usdAmount * exchangeRate);
  }

  // --- Theme ---
  function gridColor() { return 'rgba(23,24,25,0.08)'; }
  function tickColor() { return '#5a5e63'; }
  function dateTick(value) { return formatDate(this.getLabelForValue(value), true); }
  function dateTooltip(items) { return items.length ? formatDate(items[0].label) : ''; }

  const plotReveal = {
    id: 'drbPlotReveal',
    beforeDatasetsDraw(chart) {
      const value = Number(chart.canvas.dataset.revealProgress ?? 1);
      const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
      const {ctx, chartArea:area} = chart;
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left - 6, area.top - 6, (area.right - area.left + 12) * progress, area.bottom - area.top + 12);
      ctx.clip();
    },
    afterDatasetsDraw(chart) { chart.ctx.restore(); },
  };

  // --- Charts ---
  let chartDrb  = null;
  let chartWeth = null;
  let chartEth  = null;
  let chartUsdc = null;

  function renderDrbChart(data) {
    const ctx = document.getElementById('chart-drb').getContext('2d');
    if (chartDrb) chartDrb.destroy();
    const noPoints = data.length > 60;
    chartDrb = new Chart(ctx, {
      type: 'line',
      plugins: [plotReveal],
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          data: data.map(d => Math.round(d.drb)),
          _prices: data.map(d => d.drbPrice),
          borderColor: '#2458a9',
          backgroundColor: 'rgba(36,88,169,0.07)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.3,
          pointRadius: noPoints ? 0 : 3,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: dateTooltip,
              label: (item) => ` ${formatDrb(item.raw)} DRB  (${formatLocal(item.raw * item.dataset._prices[item.dataIndex])})`
            }
          },
          annotation: hackAnnotation(data),
        },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: tickColor(), maxTicksLimit: 5, maxRotation: 0, callback: dateTick } },
          y: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => formatDrb(v) }, beginAtZero: false },
        }
      }
    });
  }

  function renderWethChart(data) {
    const ctx = document.getElementById('chart-weth').getContext('2d');
    if (chartWeth) chartWeth.destroy();
    const noPoints = data.length > 60;
    chartWeth = new Chart(ctx, {
      type: 'line',
      plugins: [plotReveal],
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          data: data.map(d => d.weth),
          _prices: data.map(d => d.ethPrice),
          borderColor: '#695781',
          backgroundColor: 'rgba(105,87,129,0.07)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.3,
          pointRadius: noPoints ? 0 : 3,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: dateTooltip,
              label: (item) => ` ${formatWeth(item.raw)} WETH  (${formatLocal(item.raw * item.dataset._prices[item.dataIndex])})`
            }
          },
          annotation: hackAnnotation(data),
        },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: tickColor(), maxTicksLimit: 5, maxRotation: 0, callback: dateTick } },
          y: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => formatWeth(v) }, beginAtZero: false },
        }
      }
    });
  }

  function renderEthChart(data) {
    const ctx = document.getElementById('chart-eth').getContext('2d');
    if (chartEth) chartEth.destroy();
    const noPoints = data.length > 60;
    chartEth = new Chart(ctx, {
      type: 'line',
      plugins: [plotReveal],
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          data: data.map(d => d.eth ?? null),
          _prices: data.map(d => d.ethPrice),
          borderColor: '#695781',
          backgroundColor: 'rgba(105,87,129,0.07)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.3,
          pointRadius: noPoints ? 0 : 3,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: dateTooltip,
              label: (item) => ` ${formatWeth(item.raw)} ETH  (${formatLocal(item.raw * (item.dataset._prices[item.dataIndex] ?? 0))})`
            }
          },
          annotation: hackAnnotation(data),
        },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: tickColor(), maxTicksLimit: 5, maxRotation: 0, callback: dateTick } },
          y: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => formatWeth(v) }, beginAtZero: true },
        }
      }
    });
  }

  function renderUsdcChart(data) {
    const ctx = document.getElementById('chart-usdc').getContext('2d');
    if (chartUsdc) chartUsdc.destroy();
    const noPoints = data.length > 60;
    chartUsdc = new Chart(ctx, {
      type: 'line',
      plugins: [plotReveal],
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          data: data.map(d => d.usdc ?? null),
          borderColor: '#3d6b53',
          backgroundColor: 'rgba(61,107,83,0.07)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.3,
          pointRadius: noPoints ? 0 : 3,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: dateTooltip,
              label: (item) => ` ${item.raw.toFixed(2)} USDC  (${formatLocal(item.raw)})`
            }
          },
          annotation: hackAnnotation(data),
        },
        scales: {
          x: { grid: { color: gridColor() }, ticks: { color: tickColor(), maxTicksLimit: 5, maxRotation: 0, callback: dateTick } },
          y: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: v => v.toFixed(0) }, beginAtZero: true },
        }
      }
    });
  }

  function historyWindow(days) {
    if (valueAllTime.length === 0) return [];
    const cutoff = new Date(valueAllTime[valueAllTime.length - 1].date);
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
    const from = cutoff.toISOString().slice(0, 10);
    return valueAllTime.filter(point => point.date >= from && !point.carriedForward);
  }

  function renderHistoryTable(data) {
    const body = document.getElementById('history-rows');
    body.replaceChildren();
    for (const point of [...data].reverse()) {
      const row = document.createElement('tr');
      const dateCell = document.createElement('th');
      dateCell.scope = 'row';
      const date = document.createElement('time');
      date.dateTime = point.date;
      date.textContent = formatDate(point.date);
      dateCell.appendChild(date);
      row.appendChild(dateCell);
      for (const asset of ['drb', 'weth', 'eth', 'usdc']) {
        const cell = document.createElement('td');
        const amount = finiteAmount(point[asset]);
        cell.textContent = amount === null ? 'Unavailable' : amount.toLocaleString('en-US', {
          minimumFractionDigits: asset === 'usdc' ? 2 : 0,
          maximumFractionDigits: asset === 'drb' ? 0 : asset === 'usdc' ? 2 : 4,
        });
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    if (!data.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No saved balance history is available for this period.';
      row.appendChild(cell);
      body.appendChild(row);
    }
  }

  function showChart(mode) {
    currentChartMode = mode;
    document.getElementById('btn-30d').setAttribute('aria-pressed', String(mode === '30d'));
    document.getElementById('btn-90d').setAttribute('aria-pressed', String(mode === '90d'));
    const data = mode === '30d' ? valueLast30Days : historyWindow(90);
    document.getElementById('history-range').textContent = data.length
      ? `${formatDate(data[0].date)} – ${formatDate(data[data.length - 1].date)} · ${data.length} saved daily snapshots`
      : 'No saved balance history is available for this period.';
    renderHistoryTable(data);
    for (const asset of ['drb', 'weth', 'eth', 'usdc']) {
      const amount = data.length ? finiteAmount(data[data.length - 1][asset]) : null;
      document.getElementById(`summary-${asset}`).textContent = amount === null
        ? 'No saved balance available'
        : `${asset === 'drb' ? formatDrb(amount) : asset === 'usdc' ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : formatWeth(amount)} ${asset.toUpperCase()} · latest in this period`;
    }
    let chartsAvailable = typeof window.Chart === 'function' && data.length > 0;
    const chartAreas = document.querySelectorAll('.wallet-chart-area');
    // Reveal fallback-hidden containers before Chart.js measures their size.
    chartAreas.forEach(area => { area.hidden = !chartsAvailable; });
    if (chartsAvailable) {
      try {
        renderDrbChart(data);
        renderWethChart(data);
        renderEthChart(data);
        renderUsdcChart(data);
      } catch {
        chartsAvailable = false;
      }
    }
    chartAreas.forEach(area => { area.hidden = !chartsAvailable; });
    document.getElementById('chart-status').textContent = chartsAvailable
      ? 'Hover or tap a chart for values. The same balances are available in the table below.'
      : data.length ? 'Charts unavailable. Read the saved balances in the table below.' : 'The wallet link above remains available.';
    if (!chartsAvailable) document.getElementById('history-details').open = true;
  }

  // --- Stats rendering (separated from fetching so currency changes can re-render) ---
  function renderStats({ drbBalance, wethBalance, ethBalance, usdcBalance, drbPrice, ethPrice, usingCached, refreshState, fetchedAt, cachedDrbPrice, cachedTotalUsd }) {
    if (drbBalance !== null) {
      document.getElementById('stat-balance').textContent = formatDrb(drbBalance) + ' DRB';
      document.getElementById('stat-balance-local').textContent = drbPrice
        ? '≈ ' + formatLocal(drbBalance * drbPrice)
        : 'price unavailable';
    } else {
      document.getElementById('stat-balance').textContent = 'unavailable';
      document.getElementById('stat-balance-local').textContent = '';
    }

    if (wethBalance !== null) {
      document.getElementById('stat-weth').textContent = formatWeth(wethBalance) + ' WETH';
      document.getElementById('stat-weth-usd').textContent = ethPrice
        ? '≈ ' + formatLocal(wethBalance * ethPrice) : 'price unavailable';
    } else {
      document.getElementById('stat-weth').textContent = 'unavailable';
      document.getElementById('stat-weth-usd').textContent = '';
    }

    if (ethBalance !== null) {
      document.getElementById('stat-eth').textContent = formatWeth(ethBalance) + ' ETH';
      document.getElementById('stat-eth-usd').textContent = ethPrice
        ? '≈ ' + formatLocal(ethBalance * ethPrice)
        : 'price unavailable';
    } else {
      document.getElementById('stat-eth').textContent = 'unavailable';
      document.getElementById('stat-eth-usd').textContent = '';
    }

    if (usdcBalance !== null) {
      document.getElementById('stat-usdc').textContent = usdcBalance.toFixed(2) + ' USDC';
      document.getElementById('stat-usdc-sub').textContent = '≈ ' + formatLocal(usdcBalance);
    } else {
      document.getElementById('stat-usdc').textContent = 'unavailable';
      document.getElementById('stat-usdc-sub').textContent = '';
    }

    if (drbPrice !== null) {
      const localPrice = drbPrice * exchangeRate;
      const decimals = localPrice < 0.000001 ? 8 : localPrice < 0.001 ? 6 : 4;
      const s = localPrice < 0.000001 ? localPrice.toExponential(2) : localPrice.toFixed(decimals);
      const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: localCurrency })
        .formatToParts(0).find(p => p.type === 'currency')?.value ?? localCurrency;
      document.getElementById('stat-price').textContent = symbol + s;
      document.getElementById('stat-price-sub').textContent = localCurrency + (cachedDrbPrice ? ' · saved price' : ' · via DexScreener');
    } else {
      document.getElementById('stat-price').textContent = 'unavailable';
      document.getElementById('stat-price-sub').textContent = 'Price unavailable';
    }

    const drbUsd  = (drbBalance  !== null && drbPrice !== null) ? drbBalance  * drbPrice : 0;
    const wethUsd = (wethBalance !== null && ethPrice !== null) ? wethBalance * ethPrice : 0;
    const ethUsd  = (ethBalance  !== null && ethPrice !== null) ? ethBalance  * ethPrice : 0;
    const usdcUsd = usdcBalance !== null ? usdcBalance : 0;
    const anyValued = (drbBalance !== null && drbPrice !== null)
      || ((wethBalance !== null || ethBalance !== null) && ethPrice !== null) || usdcBalance !== null;
    const allValued = [drbBalance, wethBalance, ethBalance, usdcBalance, drbPrice, ethPrice].every(value => value !== null);
    if (anyValued) {
      document.getElementById('stat-total').textContent = formatLocal(cachedTotalUsd ?? (drbUsd + wethUsd + ethUsd + usdcUsd));
      document.getElementById('stat-total-sub').textContent =
        (allValued ? 'DRB + WETH + ETH + USDC combined' : 'Partial value · some balances or prices unavailable') + ' · ' + localCurrency;
    } else {
      document.getElementById('stat-total').textContent = 'unavailable';
      document.getElementById('stat-total-sub').textContent = '';
    }

    const time = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '';
    document.getElementById('stat-updated-sub').textContent = refreshState === 'pending'
      ? lastStatic ? `Showing ${formatDate(savedDate)} balances. Checking for updates…` : 'No saved balances. Checking for current data…'
      : usingCached ? lastStatic ? `Some current data is unavailable. Saved values from ${formatDate(savedDate)} remain in use.` : 'Some current data is unavailable. No saved balances are available.'
      : `Current balances and prices fetched at ${time}. History uses the saved snapshot.`;
  }

  // --- Blockscout rate-limited fetch ---
  // Enforces a minimum gap between calls and retries once on HTTP 429.
  const BS_GAP_MS = 400;
  let lastBsFetchAt = 0;

  async function blockscoutGet(url) {
    const gap = BS_GAP_MS - (Date.now() - lastBsFetchAt);
    if (gap > 0) await new Promise(r => setTimeout(r, gap));
    lastBsFetchAt = Date.now();
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetchWithTimeout(url);
      if (res.status !== 429) return res;
      console.warn(`Blockscout rate limited (attempt ${attempt}/2)`);
      await new Promise(r => setTimeout(r, 8000));
      lastBsFetchAt = Date.now();
    }
    throw new Error('Blockscout rate limited');
  }

  // --- Live data fetch ---
  async function fetchTokenBalance(contractAddress, decimals = DECIMALS) {
    try {
      const res = await blockscoutGet(
        `https://base.blockscout.com/api?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${WALLET}`
      );
      if (!res.ok) return null;
      const d = res.data;
      if (d.status === '1') {
        const raw = BigInt(d.result);
        const div = BigInt(10) ** BigInt(decimals);
        return finiteAmount(Number(raw / div) + Number(raw % div) / Number(div));
      }
    } catch (e) { console.warn('Balance fetch failed:', e); }
    return null;
  }

  async function fetchPairPrice(pairAddress, tokenAddress) {
    try {
      const res = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/pairs/base/${pairAddress}`);
      if (!res.ok) return null;
      const d = res.data;
      const pairs = Array.isArray(d.pairs) ? d.pairs : d.pair ? [d.pair] : [];
      const p = pairs.find(pair => pair.chainId === 'base' && pair.pairAddress?.toLowerCase() === pairAddress);
      if (!p) return null;
      const usd = Number(p.priceUsd);
      if (!Number.isFinite(usd) || usd <= 0) return null;
      if (p.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase()) return usd;
      const native = Number(p.priceNative);
      if (p.quoteToken?.address?.toLowerCase() === tokenAddress.toLowerCase() && Number.isFinite(native) && native > 0) {
        const quoteUsd = usd / native;
        return Number.isFinite(quoteUsd) && quoteUsd > 0 ? quoteUsd : null;
      }
      return null;
    } catch { return null; }
  }

  async function fetchDrbPrice() {
    return fetchPairPrice('0x5116773e18a9c7bb03ebb961b38678e45e238923', TOKEN);
  }

  async function fetchEthPrice() {
    return fetchPairPrice('0xd0b53d9277642d899df5c87a3966a349a798f224', WETH_CONTRACT);
  }

  async function fetchNativeEthBalance() {
    try {
      const res = await blockscoutGet(
        `https://base.blockscout.com/api?module=account&action=balance&address=${WALLET}`
      );
      if (!res.ok) return null;
      const d = res.data;
      if (d.status === '1') {
        const raw = BigInt(d.result);
        const div = BigInt(10) ** BigInt(18);
        return finiteAmount(Number(raw / div) + Number(raw % div) / Number(div));
      }
    } catch (e) { console.warn('ETH balance fetch failed:', e); }
    return null;
  }

  async function updateLiveStats() {
    // Blockscout calls run sequentially to avoid rate limiting.
    const drbBalance  = await fetchTokenBalance(TOKEN);
    const wethBalance = await fetchTokenBalance(WETH_CONTRACT);
    const ethBalance  = await fetchNativeEthBalance();
    const usdcBalance = await fetchTokenBalance(USDC_CONTRACT, USDC_DECIMALS);

    // Price APIs are independent — fetch in parallel.
    const [drbPrice, ethPrice] = await Promise.all([fetchDrbPrice(), fetchEthPrice()]);

    const usingCached = [drbBalance, wethBalance, ethBalance, usdcBalance, drbPrice, ethPrice].some(value => value === null);
    liveData = {
      drbBalance:  drbBalance  ?? lastStatic?.drb  ?? null,
      wethBalance: wethBalance ?? lastStatic?.weth ?? null,
      ethBalance:  ethBalance  ?? lastStatic?.eth  ?? null,
      usdcBalance: usdcBalance ?? lastStatic?.usdc ?? null,
      drbPrice:    drbPrice    ?? lastStatic?.drbPrice ?? null,
      ethPrice:    ethPrice    ?? lastStatic?.ethPrice ?? null,
      usingCached,
      cachedDrbPrice: drbPrice === null,
      cachedTotalUsd: [drbBalance, wethBalance, ethBalance, usdcBalance, drbPrice, ethPrice].every(value => value === null)
        ? finiteAmount(lastStatic?.usd) : null,
      refreshState: 'settled',
      fetchedAt: Date.now(),
    };
    renderStats(liveData);
  }

  function initWallet() {
    if (walletInitialized) return;
    walletInitialized = true;
    liveData = {
      drbBalance: finiteAmount(lastStatic?.drb),
      wethBalance: finiteAmount(lastStatic?.weth),
      ethBalance: finiteAmount(lastStatic?.eth),
      usdcBalance: finiteAmount(lastStatic?.usdc),
      drbPrice: finiteAmount(lastStatic?.drbPrice),
      ethPrice: finiteAmount(lastStatic?.ethPrice),
      usingCached: true,
      cachedDrbPrice: true,
      cachedTotalUsd: finiteAmount(lastStatic?.usd),
      refreshState: 'pending',
    };
    renderStats(liveData);
    document.getElementById('currency-select').addEventListener('change', event => onCurrencyChange(event.target.value));
    document.getElementById('btn-30d').addEventListener('click', () => showChart('30d'));
    document.getElementById('btn-90d').addEventListener('click', () => showChart('90d'));
    showChart('30d');
    initCurrency();
    updateLiveStats();
  }

  // Also recover when a chart library arrives after initialization, without another user action.
  for (const id of ['wallet-chart-library', 'wallet-annotation-library']) {
    document.getElementById(id)?.addEventListener('load', () => {
      if (walletInitialized && typeof window.Chart === 'function') showChart(currentChartMode);
    }, { once: true });
  }

  // Wait for deferred libraries, including when a head-deferred script sees "interactive".
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', initWallet, { once: true });
  else initWallet();
})();
