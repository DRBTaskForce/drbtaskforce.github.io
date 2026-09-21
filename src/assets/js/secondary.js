(() => {
  'use strict';
  if (!document.body.classList.contains('secondary')) return;
  clearTimeout(window.__drbMotionDeadline);
  document.documentElement.classList.remove('motion-pending');
  window.__disposeSecondary?.();
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const tracks = [];
  const opening = new Set();
  let frame = 0, lastTime = 0, stopped = false, observer, layoutObserver;
  const clamp = value => Math.max(0, Math.min(1, value));
  const finish = track => { track.animation?.cancel(); track.paint?.(1); track.done = true; };
  const showAll = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    tracks.forEach(finish);
    opening.forEach(animation => animation.cancel());
    opening.clear();
  };
  window.__disposeSecondary = () => { showAll(); abort.abort(); observer?.disconnect(); layoutObserver?.disconnect(); };
  if (preference.matches || document.documentElement.classList.contains('motion-off') || !Element.prototype.animate || window.__drbMotionExpired) return;

  try {
    const make = (element, frames, id) => {
      const animation = element.animate(frames, { duration:1000, fill:'both', easing:id.startsWith('gold-') ? 'linear' : 'cubic-bezier(.25,.46,.35,1)' });
      animation.pause(); animation.currentTime = 0; animation.id = `secondary-${id}`;
      return animation;
    };
    const add = (element, anchor, frames, id, offset = 0, span = 290, forceScroll = false) => {
      if (!element || !anchor.getClientRects().length) return;
      const animation = make(element, frames, id);
      // Above-the-fold content shares one opening sequence; later surfaces follow scrolling.
      if (!forceScroll && anchor.closest('.page-heading, .community-hero') && anchor.getBoundingClientRect().bottom < innerHeight * .88) {
        animation.effect.updateTiming({ duration:1900, delay:120 + offset });
        opening.add(animation);
        animation.onfinish = () => { animation.cancel(); opening.delete(animation); };
        animation.play();
      } else tracks.push({ element, anchor, animation, offset, span, requireScroll:forceScroll, start:0, end:1, goal:0, value:0, done:false });
    };
    // Resolve the original text in place without SVG resource references across
    // the portable preview's file/srcdoc boundary. Layout and scroll timing stay fixed.
    const addInk = (element, span = 370) => {
      if (!element.getClientRects().length) return;
      const box = element.getBoundingClientRect();
      const paint = value => {
        if (value >= 1) {
          element.style.removeProperty('mask-image');
          element.style.removeProperty('-webkit-mask-image');
          return;
        }
        const edge = value * 140;
        const mask = `linear-gradient(90deg, #000 ${edge - 40}%, transparent ${edge}%)`;
        element.style.setProperty('-webkit-mask-image', mask);
        element.style.maskImage = mask;
      };
      paint(0);
      // Content already comfortably on screen completes the opening sequence.
      // Lower content still waits for scroll, including anything at the edge.
      // Any complete text/data target already in view belongs to the opening.
      // Restricting this to named hero containers left visible section headings
      // and the wallet balance panel blank until the first scroll gesture.
      const isOpening = box.top >= 0 && box.bottom <= innerHeight - 24;
      // Sticky narrative moves on screen while its timeline row stays anchored.
      const anchor = element.closest('.origin-step')?.parentElement || element;
      tracks.push({element, anchor, paint, offset:0, span, start:0, end:1, goal:0, value:0, done:false,
        opening:isOpening, started:null, duration:2600});
    };
    const inkSelector = [
      'main h1', 'main h2', 'main h3', 'main .eyebrow', '.page-heading .intro',
      '.page-heading .actions', '.page-heading .text-link:not(.actions *)', '.page-heading .contract-block',
      '.section-top .eyebrow', '.movement-ranking-intro', '.movement-section-copy', '.movement-leaders > li', '.movement-ranking-heading > span',
      '.x-post', '.origin-step > p', '.origin-step > a', '.origin-number', '.origin-date', '.origin-proof figure', '.origin-continuation > p', '.origin-continuation > .actions',
      '.wallet-total > div', '.wallet-stat', '.wallet-details > div', '.wallet-chart-panel > p',
      '.door-grid > a > p', '.door-grid .door-symbol', '.door-grid .text-link', '.faq > details', '.community-hero figcaption',
      '.token-record-intro > p', '.token-record-intro .actions', '.token-records .info-card > p',
      '.token-records .info-card > ul', '.token-records .info-card > div', '.token-records section > p',
      '.token-records section > ul', '.token-downloads > a', '.page-tail p', '.page-tail > a'
    ].join(',');
    const inkTargets = [...document.querySelectorAll(inkSelector)];
    inkTargets.filter(element => !inkTargets.some(parent => parent !== element && parent.contains(element))).forEach(element => addInk(element));
    document.querySelectorAll('.community-hero figure').forEach((element, index) =>
      add(element.querySelector('svg, img'), element, [{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)'}], `art-${index}`, 0, 360, true));
    document.querySelectorAll('.token-overview figure').forEach(element => addInk(element, 460));
    document.querySelectorAll('.movement-ranking-table tbody tr:not([hidden])').forEach((row, index) => {
      [...row.cells].forEach(cell => addInk(cell));
      add(row.querySelector('.leader-bar'), row, [{transform:'scaleX(0)'},{transform:'scaleX(1)'}], `bar-${index}`, 60, 370);
    });
    const scene = document.getElementById('holders-scene');
    if (scene) {
      const svg = name => document.createElementNS('http://www.w3.org/2000/svg', name);
      const defs = scene.querySelector('defs');
      const filter = svg('filter'); filter.id = 'holders-gold-ink';
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      filter.innerHTML = '<feColorMatrix type="matrix" values="-.2126 -.7152 -.0722 0 1 -.2126 -.7152 -.0722 0 1 -.2126 -.7152 -.0722 0 1 0 0 0 1 0"/>';
      const mask = svg('mask'); mask.id = 'holders-gold-mask'; mask.style.maskType = 'luminance';
      Object.entries({maskUnits:'userSpaceOnUse', x:0, y:0, width:1536, height:1024}).forEach(([key,value]) => mask.setAttribute(key,value));
      const source = svg('use'); source.setAttribute('href','#holders-rooftop'); source.setAttribute('filter','url(#holders-gold-ink)');
      mask.append(source); defs.append(filter,mask);
      scene.querySelectorAll('[data-art-layer="star"]').forEach((star,index) => {
        add(star, scene, [{opacity:0,transform:'scale(.35)'},{opacity:1,transform:'scale(1)'}], `star-${index}`, index*12, 380, true);
        const accent = scene.querySelector(`#holders-star-clip-${index+1} rect`).cloneNode();
        accent.setAttribute('fill','#c6983e'); accent.setAttribute('mask','url(#holders-gold-mask)'); accent.setAttribute('opacity','0');
        star.append(accent);
        add(accent, scene, [{opacity:1},{opacity:1,offset:.65},{opacity:0}], `gold-${index}`, 250+index*12, 1400, true);
      });
    }
    // Draw the real dataset across stable axes; values and chart geometry never animate.
    document.querySelectorAll('.wallet-chart-area canvas').forEach(canvas => {
      const paint = value => {
        canvas.dataset.revealProgress = String(value);
        window.Chart?.getChart(canvas)?.draw();
      };
      paint(0);
      tracks.push({element:canvas, anchor:canvas.closest('.wallet-chart-panel'), paint, offset:100, span:570, start:0, end:1, goal:0, value:0, done:false});
      canvas.addEventListener('pointerdown', () => reveal(canvas), options);
    });
    const measure = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      tracks.forEach(track => {
        if (track.done || track.opening) return;
        // When the whole page fits, there is no scroll gesture to reveal it.
        if (maxScroll < 1) { finish(track); return; }
        // A newly selected period/page is immediately usable, with no replay.
        if (!track.anchor.getClientRects().length) { finish(track); return; }
        const box = track.anchor.getBoundingClientRect();
        // Wait until the element is comfortably inside the viewport.
        const entrance = box.top + scrollY - innerHeight * .76;
        const start = (track.requireScroll ? Math.max(12, entrance) : entrance) + track.offset;
        track.end = Math.min(maxScroll, Math.max(1, start + track.span));
        // A short scroll range must not turn into progress before any scroll.
        track.start = Math.min(Math.max(0, start), track.end - 1);
      });
    };
    const tick = now => {
      frame = 0;
      const follow = 1 - Math.exp(-Math.min(50, now - (lastTime || now - 16.7)) / 210);
      lastTime = now;
      let moving = false;
      tracks.forEach(track => {
        if (track.done) return;
        const previous = track.value;
        if (track.opening) {
          track.started ??= now;
          track.goal = clamp((now - track.started - 120) / track.duration);
          track.value = track.goal;
        } else track.value += (track.goal - track.value) * follow;
        if (Math.abs(track.value - track.goal) < .0004) track.value = track.goal;
        // Offscreen and settled masks do no rendering work during another reveal.
        if (track.value !== previous) {
          if (track.animation) track.animation.currentTime = track.value * 1000;
          track.paint?.(track.value * track.value * (3 - 2 * track.value));
        }
        if (track.value >= 1) finish(track);
        else if (track.opening || track.value !== track.goal) moving = true;
      });
      if (moving && !stopped) frame = requestAnimationFrame(tick);
    };
    const update = () => {
      if (stopped) return;
      tracks.forEach(track => { if (!track.done && !track.opening) track.goal = Math.max(track.goal, clamp((scrollY - track.start) / (track.end - track.start))); });
      if (!frame) { lastTime = 0; frame = requestAnimationFrame(tick); }
    };
    const remeasure = () => { if (!stopped) { measure(); update(); } };
    const reveal = destination => {
      if (!destination) return;
      if (destination === document.body || destination === document.documentElement) return;
      const viewportOnly = destination === document.querySelector('main');
      const inScope = element => {
        if (!(destination.contains(element) || element.contains(destination))) return false;
        if (!viewportOnly) return true;
        const box = element.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight;
      };
      tracks.forEach(track => { if (inScope(track.element)) finish(track); });
      opening.forEach(animation => {
        const element = animation.effect.target;
        if (inScope(element)) { animation.cancel(); opening.delete(animation); }
      });
    };
    document.addEventListener('focusin', event => reveal(event.target), options);
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (link) reveal(document.getElementById(link.getAttribute('href').slice(1)));
    }, options);
    const hash = () => reveal(document.getElementById(location.hash.slice(1)));
    addEventListener('hashchange', hash, options);
    addEventListener('scroll', update, {...options, passive:true});
    addEventListener('resize', remeasure, options);
    document.addEventListener('drb:layout', remeasure, options);
    if ('ResizeObserver' in window) { layoutObserver = new ResizeObserver(remeasure); layoutObserver.observe(document.querySelector('main')); }
    addEventListener('pagehide', showAll, options);
    preference.addEventListener('change', event => { if (event.matches) showAll(); }, options);
    observer = new MutationObserver(() => { if (document.documentElement.classList.contains('motion-off')) showAll(); });
    observer.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
    document.querySelectorAll('.movement-period-controls button, .movement-paging button').forEach(button => button.addEventListener('click', () => reveal(document.querySelector('#attention')), options));
    measure(); update(); hash();
    Promise.all([...document.images].map(image => image.decode().catch(() => {}))).then(remeasure);
  } catch (error) {
    showAll();
    console.warn('Secondary-page motion unavailable; content remains visible.', error);
  }
})();
