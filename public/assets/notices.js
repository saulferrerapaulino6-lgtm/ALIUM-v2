/* Avisos del sitio y suscripción por correo. */
(() => {
  'use strict';

  const DISMISS_KEY = 'alium_notices_dismissed';
  const status = (form) => form.querySelector('.subscribe-status');

  function dismissedIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  function dismiss(id) {
    try {
      const list = dismissedIds().filter((item) => item !== id);
      list.push(id);
      localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-30)));
    } catch { /* sin almacenamiento */ }
  }

  function renderNotice(notice) {
    const bar = document.createElement('aside');
    bar.className = 'alium-notice';
    bar.dataset.kind = notice.kind || 'novedad';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');

    const dot = document.createElement('span');
    dot.className = 'alium-notice-dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('p');
    const title = document.createElement('b');
    title.textContent = notice.title || 'Aviso de ALIUM';
    const message = document.createElement('span');
    message.textContent = notice.message || '';
    text.append(title, message);

    bar.append(dot, text);

    if (notice.link && notice.linkLabel) {
      const link = document.createElement('a');
      link.href = notice.link;
      link.textContent = notice.linkLabel;
      bar.append(link);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'alium-notice-close';
    close.setAttribute('aria-label', 'Cerrar aviso');
    close.textContent = '×';
    close.addEventListener('click', () => {
      dismiss(notice.id);
      bar.remove();
    });
    bar.append(close);

    document.body.insertBefore(bar, document.body.firstChild);
  }

  async function loadNotices() {
    try {
      const response = await fetch('assets/notices.json', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const seen = dismissedIds();
      const notice = (Array.isArray(data.notices) ? data.notices : []).find((item) => {
        if (!item || !item.id || seen.includes(item.id)) return false;
        if (item.startsAt && new Date(item.startsAt).getTime() > Date.now()) return false;
        if (item.endsAt && new Date(item.endsAt).getTime() < Date.now()) return false;
        return Boolean(item.message);
      });
      if (notice) renderNotice(notice);
    } catch { /* los avisos son opcionales */ }
  }

  function initSubscribe() {
    const form = document.querySelector('#subscribe-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const button = form.querySelector('button[type="submit"]');
      const output = status(form);
      const email = (input?.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        if (output) { output.textContent = 'Escribe un correo electrónico válido.'; output.classList.add('error'); }
        return;
      }
      const original = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Enviando…'; }
      if (output) { output.textContent = ''; output.classList.remove('error'); }
      try {
        const response = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'portada' }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo completar la suscripción.');
        if (output) output.textContent = data.message || 'Listo. Te avisaremos cuando haya novedades.';
        form.reset();
      } catch (error) {
        if (output) { output.textContent = error.message; output.classList.add('error'); }
      } finally {
        if (button) { button.disabled = false; button.textContent = original; }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { loadNotices(); initSubscribe(); });
  } else {
    loadNotices();
    initSubscribe();
  }
})();
