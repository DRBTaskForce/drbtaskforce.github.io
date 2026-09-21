(() => {
  const abort = new AbortController();
  window.__disposeDRBPreview?.();
  window.__disposeDRBPreview = () => abort.abort();
  const options = { signal: abort.signal };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let paintScroll = () => {};
  let revealAll = () => {};
  const syncMotion = () => {
    const stopped = paused || reduced.matches;
    document.documentElement.classList.toggle('motion-off', stopped);
    document.querySelectorAll('.motion-toggle').forEach(button => {
      button.textContent = reduced.matches ? 'Reduced motion on' : paused ? 'Resume motion' : 'Pause motion';
      button.setAttribute('aria-pressed', String(stopped));
      button.disabled = reduced.matches;
    });
    if (stopped) {
      revealAll();
      document.querySelectorAll('.sky').forEach(sky => { sky.style.setProperty('--shift-x', '0px'); sky.style.setProperty('--shift-y', '0px'); });
    }
    paintScroll();
  };
  document.querySelectorAll('.motion-toggle').forEach(button => button.addEventListener('click', () => { paused = !paused; syncMotion(); }, options));
  reduced.addEventListener('change', syncMotion, options);
  syncMotion();

  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('#site-menu');
  function closeMenu() { menuButton?.setAttribute('aria-expanded', 'false'); menu?.classList.remove('is-open'); }
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
  }, options);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); } }, options);
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu, options));

  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const group = button.closest('.contract-block');
    const address = group.querySelector('code');
    const status = group.querySelector('[role="status"]');
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(address.textContent.trim());
      status.textContent = 'Contract address copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(address);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      status.textContent = 'Address selected. Use your device’s copy command.';
    }
  }, options));

  document.querySelectorAll('.sky').forEach(sky => {
    const section = sky.parentElement;
    let scheduled = false;
    let x = 0, y = 0;
    section.addEventListener('pointermove', event => {
      if (paused || reduced.matches || event.pointerType !== 'mouse') return;
      const box = section.getBoundingClientRect();
      x = ((event.clientX - box.left) / box.width - 0.5) * 12;
      y = ((event.clientY - box.top) / box.height - 0.5) * 8;
      if (!scheduled) { scheduled = true; requestAnimationFrame(() => {
        scheduled = false;
        if (!paused && !reduced.matches) { sky.style.setProperty('--shift-x', `${x}px`); sky.style.setProperty('--shift-y', `${y}px`); }
      }); }
    }, options);
    section.addEventListener('pointerleave', () => { sky.style.setProperty('--shift-x', '0px'); sky.style.setProperty('--shift-y', '0px'); }, options);
  });

  if (document.body.classList.contains('assembly') && !document.body.classList.contains('secondary')) {
    // Keep original text nodes and whitespace in order; only words gain animation spans.
    const textTargets = [...document.querySelectorAll([
      '.assembly-heading h1', '.assembly-heading p', '.assembly-doors h2',
      '.assembly-doors .section-top p', '.door-grid h3', '.door-grid p',
      '.assembly-story h2', '.assembly-story p', '.story-date time',
      '.rooftop-copy h2', '.rooftop-copy p', '.token-intro h2', '.token-intro p',
      '.assembly-bottom h2', '.join-note p', '.page-heading h1',
      '.page-heading .eyebrow', '.page-heading .intro',
      '.community-questions h2', '.community-questions .eyebrow',
    ].join(','))];
    textTargets.forEach(element => {
      if (element.classList.contains('generation-text')) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          // Preserve inline controls, while allowing text inside a linked card.
          const excluded = node.parentElement.closest('a, button, code, svg, [aria-hidden="true"]');
          return excluded && element.contains(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      let wordIndex = 0;
      const step = element.matches('h1,h2,h3,time') ? 55 : 18;
      nodes.forEach(node => {
        const fragment = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).filter(Boolean).forEach(part => {
          if (/^\s+$/.test(part)) fragment.append(document.createTextNode(part));
          else {
            const word = document.createElement('span');
            word.className = 'generation-word';
            word.textContent = part;
            word.style.setProperty('--word-delay', `${Math.min(wordIndex++ * step, 480)}ms`);
            fragment.append(word);
          }
        });
        node.replaceWith(fragment);
      });
      element.classList.add('generation-text');
    });
    const imageTargets = [...document.querySelectorAll('.rooftop-section figure, .community-hero figure')];
    imageTargets.forEach(element => element.classList.add('generation-image'));
    const reveals = [...new Set([...textTargets, ...imageTargets, ...document.querySelectorAll('.smile-orbit, [data-reveal]')])];
    let revealObserver;
    const show = (element, instant = false) => {
      if (instant) element.classList.add('reveal-instant');
      element.classList.add('is-visible');
      revealObserver?.unobserve(element);
    };
    const reveal = element => {
      const img = element.classList.contains('generation-image') && element.querySelector('img');
      if (img && !img.complete) {
        revealObserver?.unobserve(element);
        img.addEventListener('load', () => show(element), { ...options, once: true });
        img.addEventListener('error', () => show(element, true), { ...options, once: true });
      } else show(element);
    };
    revealAll = () => reveals.forEach(element => show(element, true));
    if ('IntersectionObserver' in window) revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) reveal(entry.target);
      });
    }, { rootMargin: '0px 0px -24px 0px', threshold: 0 });
    reveals.forEach(element => {
      if (!revealObserver || paused || reduced.matches) show(element, true);
      else if (element.getBoundingClientRect().top < innerHeight - 24) reveal(element);
      else revealObserver.observe(element);
      element.classList.add('scroll-reveal');
    });
    document.addEventListener('focusin', event => {
      reveals.forEach(element => {
        if (element.contains(event.target) || event.target.contains(element)) show(element, true);
      });
    }, options);
    const depthTargets = [
      { element: document.querySelector('.rooftop-section img'), anchor: document.querySelector('.rooftop-section figure'), amount: 14 },
      { element: document.querySelector('.community-hero img'), anchor: document.querySelector('.community-hero figure'), amount: 14 },
    ].filter(target => target.element && target.anchor);
    depthTargets.forEach(({ element }) => element.classList.add('scroll-depth'));
    paintScroll = () => {
      if (abort.signal.aborted) return;
      const stopped = paused || reduced.matches;
      const distanceScale = matchMedia('(max-width: 560px)').matches ? 0.5 : 1;
      depthTargets.forEach(({ element, anchor, amount }) => {
        if (stopped || document.hidden) {
          element.classList.remove('depth-in-view');
          if (stopped) element.style.removeProperty('--scroll-depth');
          return;
        }
        const box = anchor.getBoundingClientRect();
        const visible = box.bottom >= -30 && box.top <= innerHeight + 30;
        element.classList.toggle('depth-in-view', visible);
        if (!visible) return;
        const progress = Math.max(-1, Math.min(1, (innerHeight / 2 - box.top - box.height / 2) / (innerHeight / 2 + box.height / 2)));
        element.style.setProperty('--scroll-depth', `${(progress * amount * distanceScale).toFixed(2)}px`);
      });
    };
    let scrollFrame = 0;
    const scheduleScroll = () => {
      if (scrollFrame || abort.signal.aborted) return;
      scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; paintScroll(); });
    };
    addEventListener('scroll', scheduleScroll, { ...options, passive: true });
    addEventListener('resize', scheduleScroll, options);
    document.addEventListener('visibilitychange', scheduleScroll, options);
    abort.signal.addEventListener('abort', () => {
      revealObserver?.disconnect();
      cancelAnimationFrame(scrollFrame);
    }, { once: true });
    syncMotion();
  }

  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      document.querySelectorAll('#site-menu a[href^="#"]').forEach(link => {
        if (link.getAttribute('href') === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
  document.querySelectorAll('main section[id], main article[id]').forEach(section => observer.observe(section));
  abort.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
})();
