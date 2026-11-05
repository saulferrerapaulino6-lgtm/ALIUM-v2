const $ = (id) => document.getElementById(id);
const CATEGORY_NAMES = {
  cpu: 'Procesador', cooler: 'Disipador', motherboard: 'Placa madre', memory: 'Memoria',
  storage: 'Almacenamiento', gpu: 'Tarjeta de video', case: 'Case', psu: 'Fuente',
  os: 'Sistema operativo', monitor: 'Monitor',
};
const state = { user: null, builds: [], mode: 'register', configured: true, dialogBuild: null };

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function formatUSD(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } }
function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  safeSet('alium_theme', theme);
  const button = $('theme-toggle');
  if (button) {
    button.textContent = theme === 'dark' ? '☼' : '☾';
    const label = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    button.title = label;
    button.setAttribute('aria-label', label);
  }
}

let toastTimer = null;
function toast(message, isError = false) {
  const element = $('toast');
  element.textContent = message;
  element.classList.toggle('error', isError);
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 4200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function setMode(mode) {
  state.mode = mode;
  const register = mode === 'register';
  document.querySelectorAll('.tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  });
  $('name-field').hidden = !register;
  $('confirm-field').hidden = !register;
  $('auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('auth-submit').textContent = register ? 'Crear mi cuenta' : 'Iniciar sesión';
  $('auth-title').textContent = register ? 'Empieza tu historial' : 'Bienvenido de nuevo';
  $('auth-subtitle').textContent = register
    ? 'Solo necesitas un correo y una contraseña. Es gratis.'
    : 'Entra para ver y continuar tus PCs guardadas.';
  $('auth-message').textContent = '';
  $('auth-message').classList.remove('ok');
}

function renderSession() {
  const user = state.user;
  $('auth-view').hidden = Boolean(user);
  $('profile-view').hidden = !user;
  if (!user) return;

  $('profile-initial').textContent = (user.name || user.email || 'A').trim().charAt(0).toUpperCase();
  $('profile-name').textContent = user.name || 'Tu cuenta';
  $('profile-email').textContent = user.email;
  $('profile-since').textContent = user.createdAt ? `Miembro desde ${formatDate(user.createdAt)}` : '';
}

function partRow(part) {
  const label = CATEGORY_NAMES[part.category] || part.category || 'Pieza';
  const price = Number(part.price) || 0;
  const details = [part.brand, part.spec].filter(Boolean).join(' · ');
  return `<div class="build-part-row"><span>${escapeHTML(label)}</span><span><b>${escapeHTML(part.name || 'Pieza')}</b>${details ? `<small>${escapeHTML(details)}</small>` : ''}</span><b>${price ? formatUSD(price) : 'Incluido'}</b></div>`;
}

function renderBuilds() {
  const list = $('builds-list');
  const empty = $('builds-empty');
  const count = state.builds.length;
  $('builds-count').textContent = count === 1 ? '1 configuración guardada' : `${count} configuraciones guardadas`;
  empty.hidden = count > 0;
  list.hidden = count === 0;
  if (!count) { list.innerHTML = ''; return; }

  list.innerHTML = state.builds.map((build) => {
    const meta = [build.platform, build.tier, build.use].filter(Boolean).map(escapeHTML).join(' · ');
    const chips = [`${build.parts.length} ${build.parts.length === 1 ? 'pieza' : 'piezas'}`];
    if (build.platform) chips.push(build.platform);
    if (build.tier) chips.push(build.tier);
    if (build.use) chips.push(build.use);
    return `<article class="build-card">
      <header class="build-card-head">
        <div>
          <h3>${escapeHTML(build.name)}</h3>
          <p>${meta ? `${meta} · ` : ''}${escapeHTML(formatDate(build.createdAt))}</p>
        </div>
        <div class="build-total"><b>${formatUSD(build.total)}</b><small>Total de las piezas</small></div>
      </header>
      <div class="build-parts">${chips.map((chip) => `<span class="part-chip">${escapeHTML(chip)}</span>`).join('')}</div>
      <div class="build-actions">
        <button class="button quiet" type="button" data-view="${escapeHTML(build.id)}">Ver piezas</button>
        <button class="button primary" type="button" data-open="${escapeHTML(build.id)}">Usar en configurador</button>
        <button class="button quiet" type="button" data-delete="${escapeHTML(build.id)}">Eliminar</button>
      </div>
    </article>`;
  }).join('');
}

function openBuildDialog(build) {
  state.dialogBuild = build;
  $('build-dialog-title').textContent = build.name;
  $('build-dialog-sub').textContent = `${build.parts.length} piezas · ${formatUSD(build.total)} · ${formatDate(build.createdAt)}`;
  $('build-dialog-parts').innerHTML = build.parts.map(partRow).join('');
  $('build-dialog').showModal();
}

function useBuild(build) {
  safeSet('alium_saved_build', JSON.stringify(build));
  window.location.href = 'configurador.html?build=1';
}

async function loadBuilds() {
  try {
    const data = await api('/api/builds');
    state.builds = Array.isArray(data.builds) ? data.builds : [];
    renderBuilds();
  } catch (error) {
    if (/sesión/i.test(error.message)) {
      state.user = null;
      renderSession();
      return;
    }
    toast(error.message, true);
  }
}

function showMessage(message, ok = false) {
  const element = $('auth-message');
  element.textContent = message;
  element.classList.toggle('ok', ok);
}

async function init() {
  applyTheme(safeGet('alium_theme') || 'dark');
  $('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.querySelectorAll('.tabs button').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  let initialMode = 'register';
  if (location.hash === '#entrar' || new URLSearchParams(location.search).get('modo') === 'entrar') initialMode = 'login';
  setMode(initialMode);

  $('auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('auth-name').value.trim();
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    const confirm = $('auth-confirm').value;
    const register = state.mode === 'register';

    if (!state.configured) return showMessage('Las cuentas todavía no están activadas en el servidor.');
    if (register && name.length < 2) return showMessage('Escribe tu nombre (al menos 2 caracteres).');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showMessage('Escribe un correo electrónico válido.');
    if (password.length < 8) return showMessage('La contraseña debe tener al menos 8 caracteres.');
    if (register && password !== confirm) return showMessage('Las contraseñas no coinciden.');

    const button = $('auth-submit');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = register ? 'Creando cuenta…' : 'Entrando…';
    showMessage('');
    try {
      const data = await api(register ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(register ? { name, email, password } : { email, password }),
      });
      state.user = data.user;
      renderSession();
      toast(register ? 'Cuenta creada. Ya puedes guardar tus PCs.' : 'Bienvenido de nuevo.');
      const next = new URLSearchParams(location.search).get('next');
      if (next && ['configurador.html', 'montaje.html', 'index.html'].includes(next)) {
        window.location.href = next;
        return;
      }
      history.replaceState(null, '', location.pathname);
      await loadBuilds();
    } catch (error) {
      showMessage(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  $('builds-list').addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open]');
    const view = event.target.closest('[data-view]');
    const remove = event.target.closest('[data-delete]');
    if (open) {
      const build = state.builds.find((item) => item.id === open.dataset.open);
      if (build) useBuild(build);
      return;
    }
    if (view) {
      const build = state.builds.find((item) => item.id === view.dataset.view);
      if (build) openBuildDialog(build);
      return;
    }
    if (remove) {
      const build = state.builds.find((item) => item.id === remove.dataset.delete);
      if (!build) return;
      if (!window.confirm(`¿Eliminar “${build.name}”? Esta acción no se puede deshacer.`)) return;
      remove.disabled = true;
      try {
        await api(`/api/builds/${build.id}`, { method: 'DELETE' });
        state.builds = state.builds.filter((item) => item.id !== build.id);
        renderBuilds();
        toast('PC eliminada de tu historial.');
      } catch (error) {
        remove.disabled = false;
        toast(error.message, true);
      }
    }
  });

  $('build-dialog-open').addEventListener('click', () => {
    if (state.dialogBuild) useBuild(state.dialogBuild);
  });

  $('logout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* cerramos igual */ }
    state.user = null;
    state.builds = [];
    renderSession();
    renderBuilds();
    $('auth-password').value = '';
    toast('Sesión cerrada.');
  });

  $('delete-account').addEventListener('click', () => {
    $('delete-password').value = '';
    $('delete-message').textContent = '';
    $('delete-dialog').showModal();
  });

  $('delete-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('delete-password').value;
    if (!password) return;
    const button = $('delete-confirm');
    button.disabled = true;
    button.textContent = 'Eliminando…';
    $('delete-message').textContent = '';
    try {
      await api('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) });
      $('delete-dialog').close();
      state.user = null;
      state.builds = [];
      renderSession();
      renderBuilds();
      toast('Tu cuenta y tus PCs fueron eliminadas.');
    } catch (error) {
      $('delete-message').textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Sí, eliminar';
    }
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });

  try {
    const data = await api('/api/auth/me');
    state.configured = data.accounts?.configured !== false;
    state.user = data.user || null;
    if (!state.configured) {
      const warning = $('accounts-warning');
      warning.hidden = false;
      warning.innerHTML = '<b>Las cuentas aún no están activadas en el servidor.</b> Falta configurar la base de datos gratuita (DATABASE_URL). El resto de ALIUM funciona normalmente.';
      $('auth-submit').disabled = true;
    }
    renderSession();
    if (state.user) await loadBuilds();
  } catch {
    state.configured = false;
    const warning = $('accounts-warning');
    warning.hidden = false;
    warning.textContent = 'No se pudo comprobar el estado de las cuentas. Revisa tu conexión e intenta de nuevo.';
    $('auth-submit').disabled = true;
  }
}

init();
