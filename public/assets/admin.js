'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  timer: null,
  loading: false,
  data: null,
  query: '',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtShort(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name, email) {
  const base = String(name || email || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const error = new Error(data.error || 'No autorizado.');
    error.unauthorized = true;
    throw error;
  }
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

function loginMessage(text, kind = '') {
  const element = $('login-message');
  element.textContent = text;
  element.className = `form-message ${kind}`.trim();
}

function showLogin() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  $('panel-view').hidden = true;
  $('top-actions').hidden = true;
  $('login-view').hidden = false;
  $('admin-key').focus({ preventScroll: true });
}

function showPanel() {
  $('login-view').hidden = true;
  $('panel-view').hidden = false;
  $('top-actions').hidden = false;
  if (!state.timer) state.timer = setInterval(() => loadOverview(true), 30000);
}

function renderStatus(ok, text, sub) {
  $('status-dot').className = `dot ${ok ? 'ok' : 'bad'}`;
  $('status-title').textContent = text;
  $('status-sub').textContent = sub;
}

function renderUsers() {
  const list = $('user-list');
  list.textContent = '';
  const users = (state.data?.users || []).filter((user) => {
    if (!state.query) return true;
    const haystack = `${user.name || ''} ${user.email || ''}`.toLowerCase();
    return haystack.includes(state.query);
  });

  $('users-count').textContent = state.query
    ? `${users.length} de ${state.data?.users?.length || 0}`
    : String(state.data?.users?.length || 0);

  if (!users.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = state.data?.users?.length
      ? 'Ningún usuario coincide con la búsqueda.'
      : 'Todavía no hay usuarios registrados.';
    list.append(empty);
    return;
  }

  for (const user of users) {
    const row = document.createElement('article');
    row.className = 'user';

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(user.name, user.email);

    const main = document.createElement('div');
    main.className = 'user-main';
    const name = document.createElement('b');
    name.className = 'user-name';
    name.textContent = user.name || 'Sin nombre';
    const email = document.createElement('span');
    email.className = 'user-email';
    email.textContent = user.email || '';
    main.append(name, email);

    const meta = document.createElement('div');
    meta.className = 'user-meta';
    const date = document.createElement('span');
    date.className = 'user-date';
    date.textContent = fmtShort(user.createdAt);
    date.title = fmtDate(user.createdAt);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = user.builds === 1 ? '1 PC' : `${user.builds || 0} PCs`;
    meta.append(date, badge);

    row.append(avatar, main, meta);
    list.append(row);
  }
}

function renderSubscribers() {
  const list = $('subscriber-list');
  list.textContent = '';
  const subscribers = state.data?.subscribers || [];
  $('subscribers-count').textContent = String(state.data?.totals?.subscribers ?? subscribers.length);

  if (!subscribers.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Todavía no hay suscriptores.';
    list.append(empty);
    return;
  }

  for (const subscriber of subscribers) {
    const row = document.createElement('article');
    row.className = 'subscriber';

    const main = document.createElement('div');
    const email = document.createElement('b');
    email.textContent = subscriber.email;
    const date = document.createElement('small');
    date.textContent = `${subscriber.source || 'web'} · ${fmtShort(subscriber.createdAt)}`;
    main.append(email, date);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'activo';

    row.append(main, badge);
    list.append(row);
  }
}

function render() {
  const totals = state.data?.totals || {};
  $('total-users').textContent = totals.users ?? '—';
  $('recent-users').textContent = totals.recentUsers ?? '—';
  $('total-subscribers').textContent = totals.subscribers ?? '—';
  $('total-builds').textContent = totals.builds ?? '—';
  $('last-registration').textContent = totals.lastRegistrationAt
    ? `Último: ${fmtDate(totals.lastRegistrationAt)}`
    : 'Sin registros todavía';
  $('updated-at').textContent = fmtDate(state.data?.checkedAt);
  renderUsers();
  renderSubscribers();
}

async function loadOverview(quiet = false) {
  if (state.loading) return;
  state.loading = true;
  if (!quiet) renderStatus(true, 'Actualizando…', 'Consultando el servidor.');
  try {
    const data = await api('/api/admin/overview?limit=300');
    state.data = data;
    render();
    const users = data.totals?.users ?? 0;
    const recent = data.totals?.recentUsers ?? 0;
    renderStatus(
      true,
      users === 0 ? 'Panel listo' : `${users} ${users === 1 ? 'usuario' : 'usuarios'}`,
      recent > 0
        ? `${recent} ${recent === 1 ? 'cuenta nueva' : 'cuentas nuevas'} en los últimos 7 días.`
        : 'Sin cuentas nuevas en los últimos 7 días.',
    );
  } catch (error) {
    if (error.unauthorized) {
      showLogin();
      loginMessage('Tu sesión terminó. Escribe la clave otra vez.', 'error');
      return;
    }
    renderStatus(false, 'No se pudo cargar', error.message);
    if (!state.data) {
      $('user-list').textContent = '';
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = error.message;
      $('user-list').append(empty);
    }
  } finally {
    state.loading = false;
  }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('login-btn');
  const key = $('admin-key').value.trim();
  if (!key) {
    loginMessage('Escribe la clave de administrador.', 'error');
    return;
  }
  button.disabled = true;
  button.textContent = 'Entrando…';
  loginMessage('Comprobando la clave…');
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ key }) });
    $('admin-key').value = '';
    loginMessage('');
    showPanel();
    await loadOverview();
  } catch (error) {
    loginMessage(error.message, 'error');
    $('admin-key').select();
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar';
  }
});

$('logout-btn').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
  } catch { /* la sesión se cierra igual */ }
  state.data = null;
  showLogin();
  loginMessage('Sesión cerrada.', 'ok');
});

$('refresh-btn').addEventListener('click', () => loadOverview());

$('search-input').addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderUsers();
});

async function init() {
  $('search-input').value = '';
  try {
    const session = await api('/api/admin/session');
    if (session.authenticated) {
      showPanel();
      await loadOverview();
      return;
    }
  } catch { /* sin sesión */ }
  showLogin();
}

init();
