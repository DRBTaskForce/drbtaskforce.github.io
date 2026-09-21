(() => {
  const API_URL = 'https://drb-chat-worker.drbtaskforce.workers.dev';
  const dialog = document.querySelector('#drb-chat-window');
  const launcher = document.querySelector('#drb-chat-btn');
  const input = document.querySelector('#drb-user-input');
  const button = document.querySelector('#drb-send-btn');
  const messages = document.querySelector('#drb-messages');
  let sending = false;

  function syncChatViewport() {
    const viewport = window.visualViewport;
    if (dialog.open && innerWidth <= 560 && viewport) {
      const height = Math.min(innerHeight * 0.8, viewport.height);
      dialog.style.top = `${viewport.offsetTop + viewport.height - height}px`;
      dialog.style.bottom = 'auto';
      dialog.style.height = `${height}px`;
      dialog.style.maxHeight = `${viewport.height}px`;
    } else {
      for (const property of ['top', 'bottom', 'height', 'max-height']) dialog.style.removeProperty(property);
    }
  }
  window.visualViewport?.addEventListener('resize', syncChatViewport);
  window.visualViewport?.addEventListener('scroll', syncChatViewport);
  window.addEventListener('resize', syncChatViewport);
  launcher.addEventListener('click', () => { dialog.showModal(); syncChatViewport(); input.focus(); });
  dialog.querySelector('.chat-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { syncChatViewport(); launcher.focus(); });

  function addMessage(sender, text, side) {
    messages.querySelector('.chat-intro')?.remove();
    const element = document.createElement('div');
    element.className = 'chat-msg chat-msg-' + side;
    const label = document.createElement('span');
    label.className = 'chat-msg-label';
    label.textContent = sender;
    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    if (window.marked && window.DOMPurify) {
      const rawHtml = window.marked.parse(text, { async: false, breaks: true, gfm: true });
      body.innerHTML = window.DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: ['a', 'strong', 'em', 'code', 'br'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
      });
      body.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
    } else { body.textContent = text; }
    element.append(label, body);
    messages.append(element);
    messages.scrollTop = messages.scrollHeight;
    return element;
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (sending) return;
    const message = input.value.trim();
    if (!message) { input.focus(); return; }
    sending = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    addMessage('You', message, 'right');
    input.value = '';
    const thinking = addMessage('DRB', 'Thinking…', 'left');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30000);
    try {
      const response = await fetch(API_URL + '/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }), signal: abort.signal,
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* Invalid responses use the recovery state. */ }
      thinking.remove();
      if (!response.ok) throw new Error('Chat unavailable');
      const reply = data.reply != null ? String(data.reply).trim() : '';
      if (!reply) throw new Error('Empty reply');
      addMessage('DRB', reply, 'left');
    } catch {
      thinking.remove();
      addMessage('DRB', 'Could not get a reply. Please try again.', 'left');
      if (!input.value) input.value = message;
    } finally {
      clearTimeout(timeout);
      sending = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
  document.querySelector('#drb-chat-form').addEventListener('submit', sendMessage);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.isComposing) event.preventDefault();
  });
})();
