(() => {
  'use strict';
  window.__disposeXPosts?.();
  const posts = [...document.querySelectorAll('.x-post[data-x-url]')];
  if (!posts.length) return;
  let disposed = false, observer, layoutObserver, layoutFrame = 0, library;
  const grid = document.querySelector('.movement-post-grid');
  const layout = () => {
    layoutFrame = 0;
    if (disposed || !grid) return;
    grid.classList.add('is-flowing');
    grid.querySelectorAll('.x-post').forEach(post => {
      const span = innerWidth > 800 ? `span ${Math.ceil((post.getBoundingClientRect().height + 24) / 28)}` : '';
      if (post.style.gridRowEnd !== span) post.style.gridRowEnd = span;
    });
  };
  const scheduleLayout = () => { if (!layoutFrame) layoutFrame = requestAnimationFrame(layout); };
  if (grid && 'ResizeObserver' in window) {
    layoutObserver = new ResizeObserver(scheduleLayout);
    grid.querySelectorAll('.x-post-mount, .x-post-fallback').forEach(element => layoutObserver.observe(element));
    addEventListener('resize', scheduleLayout);
    scheduleLayout();
  }
  window.__disposeXPosts = () => { disposed = true; observer?.disconnect(); layoutObserver?.disconnect(); cancelAnimationFrame(layoutFrame); removeEventListener('resize', scheduleLayout); };
  const loadLibrary = () => library ||= new Promise((resolve, reject) => {
    if (window.twttr?.widgets?.createTweet) { resolve(window.twttr); return; }
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    const timer = setTimeout(() => reject(new Error('X preview unavailable')), 12000);
    script.onload = () => { clearTimeout(timer); window.twttr?.widgets ? resolve(window.twttr) : reject(new Error('X preview unavailable')); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('X preview unavailable')); };
    document.head.append(script);
  });
  async function render(post) {
    if (post.dataset.xRequested) return;
    post.dataset.xRequested = 'true';
    const match = post.dataset.xUrl.match(/^https:\/\/(?:x|twitter)\.com\/[\w]+\/status\/(\d+)/);
    if (!match) return;
    try {
      const x = await loadLibrary();
      if (disposed) return;
      const mount = post.querySelector('.x-post-mount');
      const embedded = await x.widgets.createTweet(match[1], mount, {
        theme: 'light', dnt: true, conversation: 'none', align: 'center', width: 550,
      });
      if (disposed || !embedded) return;
      const fallback = post.querySelector('.x-post-fallback');
      const showEmbed = () => {
        fallback.hidden = true;
        mount.hidden = false;
        post.dataset.xRendered = 'true';
        scheduleLayout();
        document.dispatchEvent(new Event('drb:layout'));
      };
      // A slow embed must not remove the keyboard user's focused source link.
      if (fallback.contains(document.activeElement)) {
        mount.hidden = true;
        const afterFocus = () => queueMicrotask(() => {
          if (disposed || fallback.contains(document.activeElement)) return;
          fallback.removeEventListener('focusout', afterFocus);
          showEmbed();
        });
        fallback.addEventListener('focusout', afterFocus);
      } else showEmbed();
    } catch {
      // The original text and direct post link stay available when X is blocked.
    }
  }
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { observer.unobserve(entry.target); render(entry.target); }
    }), { rootMargin: '600px 0px' });
    posts.forEach(post => observer.observe(post));
  } else posts.forEach(render);
})();
