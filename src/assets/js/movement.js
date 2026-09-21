(() => {
  'use strict';

  const root = document.querySelector('.movement-page');
  if (!root) return;
  if (typeof window.__disposeMovement === 'function') window.__disposeMovement();

  const numberFormat = new Intl.NumberFormat('en-US');
  const timestampFormat = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: 'UTC', timeZoneName: 'short'
  });
  root.querySelectorAll('time[data-snapshot], time[data-post-date]').forEach(element => {
    const date = new Date(element.dateTime);
    if (!Number.isNaN(date.getTime())) element.textContent = timestampFormat.format(date);
  });
  root.querySelectorAll('[data-number]').forEach(element => {
    const value = Number(element.textContent);
    if (Number.isFinite(value)) element.textContent = numberFormat.format(value);
  });

  root.querySelectorAll('.leader-portrait img, .movement-avatar').forEach(image => {
    const fallback = () => { if (image.tagName === 'IMG') image.hidden = true; };
    image.addEventListener('error', fallback, { once: true });
    image.addEventListener('load', () => { image.hidden = false; }, { once: true });
    if (image.complete && !image.naturalWidth) fallback();
  });

  const attention = root.querySelector('#attention');
  if (!attention) return;
  const periodControls = attention.querySelector('.movement-period-controls');
  const periodButtons = [...periodControls.querySelectorAll('[data-period]')];
  const panels = new Map([...attention.querySelectorAll('[data-ranking-period]')].map(panel => [panel.dataset.rankingPeriod, panel]));
  const rowsByPeriod = new Map([...panels].map(([period, panel]) => [period, [...panel.querySelectorAll('[data-leader]')]]));
  const paging = attention.querySelector('.movement-paging');
  const range = attention.querySelector('#lb-range');
  const previous = attention.querySelector('#lb-previous');
  const next = attention.querySelector('#lb-next');
  const pageSize = 10;
  let currentPeriod = 'daily';
  let currentPage = 1;
  const removers = [];

  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    removers.push(() => target.removeEventListener(event, handler));
  }

  function readLocation() {
    const params = new URLSearchParams(window.location.search);
    currentPeriod = panels.has(params.get('period')) ? params.get('period') : 'daily';
    const requestedPage = Number(params.get('rankPage'));
    currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  }

  function saveLocation() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('period', currentPeriod);
      if (currentPage > 1) url.searchParams.set('rankPage', String(currentPage));
      else url.searchParams.delete('rankPage');
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // Saved-file previews may not allow history changes; controls still work.
    }
  }

  function renderPage({ save = false, focusList = false } = {}) {
    const rows = rowsByPeriod.get(currentPeriod) || [];
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    panels.forEach((panel, period) => { panel.hidden = period !== currentPeriod; });
    periodButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.period === currentPeriod));
    });
    const start = (currentPage - 1) * pageSize;
    rows.forEach((row, index) => { row.hidden = index < start || index >= start + pageSize; });
    previous.disabled = currentPage === 1;
    next.disabled = currentPage === totalPages;
    const label = panels.get(currentPeriod).querySelector('h3').textContent;
    range.textContent = rows.length
      ? `${label}: ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length} authors · Page ${currentPage} of ${totalPages}`
      : `${label}: no saved authors`;
    if (save) saveLocation();
    if (focusList) {
      const list = panels.get(currentPeriod).querySelector('.movement-ranking-scroll');
      if (list) {
        list.focus({ preventScroll: true });
        // A shorter page moves the rows above the old paging-button position.
        const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
        window.scrollTo({ top: window.scrollY + list.getBoundingClientRect().top - headerHeight - 24, behavior: 'instant' });
      }
    }
  }

  periodButtons.forEach(button => listen(button, 'click', () => {
    currentPeriod = button.dataset.period;
    currentPage = 1;
    renderPage({ save: true });
  }));
  listen(previous, 'click', () => {
    currentPage -= 1;
    renderPage({ save: true, focusList: true });
  });
  listen(next, 'click', () => {
    currentPage += 1;
    renderPage({ save: true, focusList: true });
  });
  listen(window, 'popstate', () => {
    readLocation();
    renderPage({});
  });
  attention.classList.add('is-enhanced');
  periodControls.hidden = false;
  paging.hidden = false;
  readLocation();
  renderPage({});
  window.__disposeMovement = () => {
    removers.forEach(remove => remove());
  };
})();
