'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  timer: null,
  loading: false,
  data: null,
  orders: [],
  suppliers: [],
  products: [],
  query: '',
  activeTab: 'resumen',
};

const STATUS_LABELS = {
  nuevo: 'Nuevo', contactado: 'Contactado', cotizado: 'Cotizado', confirmado: 'Confirmado',
  comprando: 'Comprando', en_transito: 'En tránsito', armando: 'Armando', listo: 'Listo',
  entregado: 'Entregado', cancelado: 'Cancelado',
};
const SUPPLIER_LABELS = { nuevo: 'Nuevo', contactado: 'Contactado', aprobado: 'Aprobado', rechazado: 'Rechazado' };
const CATEGORY_NAMES = {
  cpu: 'Procesador', cooler: 'Disipador', motherboard: 'Placa madre', memory: 'Memoria', storage: 'Almacenamiento',
  gpu: 'Tarjeta de video', case: 'Case', psu: 'Fuente', os: 'Sistema', monitor: 'Monitor',
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
function fmtMoney(value, currency) {
  const number = Number(value) || 0;
  if (currency === 'DOP') return 'RD$ ' + new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(number);
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number) + ' USD';
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function initials(name, email) {
  const base = String(name || email || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
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

/* ---------------------------- Pestañas ---------------------------- */

function setTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.tab').forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `tab-${name}`; });
  if (name === 'pedidos') loadOrders();
  if (name === 'tiendas') loadSuppliers();
  if (name === 'productos') { loadProducts(); loadSuppliers(true); }
}

/* ---------------------------- Resumen ---------------------------- */

function renderUsers() {
  const list = $('user-list');
  list.textContent = '';
  const users = (state.data?.users || []).filter((user) => {
    if (!state.query) return true;
    return `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(state.query);
  });
  $('users-count').textContent = state.query ? `${users.length} de ${state.data?.users?.length || 0}` : String(state.data?.users?.length || 0);
  if (!users.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = state.data?.users?.length ? 'Ningún usuario coincide con la búsqueda.' : 'Todavía no hay usuarios registrados.';
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
  $('total-orders').textContent = totals.orders ?? '—';
  $('total-open-orders').textContent = `${totals.openOrders ?? 0} abiertos`;
  $('total-suppliers').textContent = totals.suppliers ?? '—';
  $('total-new-suppliers').textContent = `${totals.newSuppliers ?? 0} por revisar`;
  $('total-products').textContent = totals.products ?? '—';
  $('last-registration').textContent = totals.lastRegistrationAt ? `Último: ${fmtDate(totals.lastRegistrationAt)}` : 'Sin registros todavía';
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
    const orders = data.totals?.orders ?? 0;
    renderStatus(
      true,
      users === 0 ? 'Panel listo' : `${users} ${users === 1 ? 'usuario' : 'usuarios'} · ${orders} ${orders === 1 ? 'pedido' : 'pedidos'}`,
      `${data.totals?.openOrders ?? 0} pedidos abiertos · ${data.totals?.newSuppliers ?? 0} tiendas por revisar.`,
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

/* ---------------------------- Pedidos ---------------------------- */

async function loadOrders() {
  const list = $('orders-list');
  if (!list) return;
  const filter = $('orders-filter')?.value || '';
  try {
    const data = await api(`/api/admin/orders?limit=300${filter ? `&status=${encodeURIComponent(filter)}` : ''}`);
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    renderOrders();
  } catch (error) {
    if (error.unauthorized) return showLogin();
    list.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  }
}

function renderOrders() {
  const list = $('orders-list');
  const orders = state.orders;
  $('orders-count').textContent = String(orders.length);
  const tabCount = $('tab-orders-count');
  if (tabCount) tabCount.textContent = String(state.data?.totals?.orders ?? orders.length);
  if (!orders.length) {
    list.innerHTML = '<p class="muted">No hay pedidos con ese filtro.</p>';
    return;
  }
  list.innerHTML = orders.map((order) => {
    const parts = Array.isArray(order.parts) ? order.parts : [];
    const deposit = (Number(order.total) || Number(order.subtotal) || 0) * ((Number(order.depositPercent) || 50) / 100);
    return `<article class="order-card" data-order="${order.id}">
      <div class="order-top">
        <div><b class="order-code">${esc(order.code)}</b><span class="badge ${order.status === 'entregado' ? 'ok' : order.status === 'cancelado' ? 'bad' : ''}">${esc(STATUS_LABELS[order.status] || order.status)}</span></div>
        <div class="order-date">${fmtDate(order.createdAt)}</div>
      </div>
      <div class="order-grid">
        <div><span class="label">Cliente</span><b>${esc(order.customerName)}</b><small>${esc(order.customerContact)}${order.customerEmail ? ` · ${esc(order.customerEmail)}` : ''}</small></div>
        <div><span class="label">Total ref.</span><b>${fmtMoney(order.total ?? order.subtotal, order.currency)}</b><small>Anticipo ${order.depositPercent || 50}%: ${fmtMoney(deposit, order.currency)}</small></div>
        <div><span class="label">Armado / entrega</span><b>${order.assembly === 'alium' ? 'ALIUM arma' : 'Cliente arma'}</b><small>${order.fulfillment === 'entrega' ? `Domicilio · ${esc(order.address || 'sin dirección')}` : 'Retiro'}</small></div>
      </div>
      <details class="order-parts"><summary>${parts.length} ${parts.length === 1 ? 'pieza' : 'piezas'} · ${esc(order.platform || '—')} · ${esc(order.use || '—')} · ${esc(order.tier || '—')}</summary>
        <ul>${parts.map((part) => `<li><b>${esc(CATEGORY_NAMES[part.category] || part.category)}</b> ${esc([part.brand, part.name].filter(Boolean).join(' '))} — ${fmtMoney(part.price, part.currency)}${part.itemUrl ? ` · <a href="${esc(safeUrl(part.itemUrl))}" target="_blank" rel="noreferrer">ver tienda ↗</a>` : ''}</li>`).join('')}</ul>
        ${order.notes ? `<p class="tiny">Notas del cliente: ${esc(order.notes)}</p>` : ''}
      </details>
      <div class="order-edit">
        <label>Estado<select data-status>${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Fecha estimada<input type="date" data-estimated value="${esc(order.estimatedDate || '')}"></label>
        <label class="wide">Nota para el cliente<textarea data-notes rows="2" maxlength="2000" placeholder="Ej.: piezas confirmadas, entrega el viernes…">${esc(order.adminNotes || '')}</textarea></label>
        <div class="order-actions"><button class="primary" type="button" data-save>Guardar cambios</button><span class="form-message" data-message role="status"></span></div>
      </div>
    </article>`;
  }).join('');
}

async function saveOrder(card) {
  const id = card.dataset.order;
  const message = card.querySelector('[data-message]');
  const button = card.querySelector('[data-save]');
  button.disabled = true;
  button.textContent = 'Guardando…';
  if (message) { message.textContent = ''; message.classList.remove('error'); }
  try {
    const data = await api(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: card.querySelector('[data-status]').value,
        estimatedDate: card.querySelector('[data-estimated]').value,
        adminNotes: card.querySelector('[data-notes]').value,
      }),
    });
    if (message) message.textContent = `Guardado. Estado: ${STATUS_LABELS[data.order.status] || data.order.status}.`;
    if (state.data?.totals) loadOverview(true);
  } catch (error) {
    if (error.unauthorized) return showLogin();
    if (message) { message.textContent = error.message; message.classList.add('error'); }
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar cambios';
  }
}

/* ---------------------------- Tiendas ---------------------------- */

async function loadSuppliers(fillSelect = false) {
  try {
    const data = await api('/api/admin/suppliers');
    state.suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
    renderSuppliers();
    if (fillSelect) fillSupplierSelect();
  } catch (error) {
    if (error.unauthorized) return showLogin();
    const list = $('suppliers-list');
    if (list) list.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  }
}

function renderSuppliers() {
  const list = $('suppliers-list');
  if (!list) return;
  $('suppliers-count').textContent = String(state.suppliers.length);
  const tabCount = $('tab-suppliers-count');
  if (tabCount) tabCount.textContent = String(state.suppliers.length);
  if (!state.suppliers.length) {
    list.innerHTML = '<p class="muted">Todavía no hay tiendas registradas.</p>';
    return;
  }
  list.innerHTML = state.suppliers.map((supplier) => {
    const url = safeUrl(supplier.website);
    const categories = (supplier.categories || []).map((category) => CATEGORY_NAMES[category] || category).join(', ');
    const badgeClass = supplier.status === 'aprobado' ? 'ok' : supplier.status === 'rechazado' ? 'bad' : '';
    return `<article class="order-card" data-supplier="${supplier.id}">
      <div class="order-top">
        <div><b class="order-code">${esc(supplier.businessName)}</b><span class="badge ${badgeClass}">${esc(SUPPLIER_LABELS[supplier.status] || supplier.status)}</span></div>
        <div class="order-date">${fmtDate(supplier.createdAt)}</div>
      </div>
      <div class="order-grid three">
        <div><span class="label">Contacto</span><b>${esc(supplier.contactName)}</b><small>${esc(supplier.phone || '')}${supplier.phone ? ' · ' : ''}${esc(supplier.email)}</small></div>
        <div><span class="label">Ciudad</span><b>${esc(supplier.city || '—')}</b><small>${categories || 'Sin categorías'}</small></div>
        <div><span class="label">Web</span><b>${url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(supplier.website)} ↗</a>` : '—'}</b><small>${supplier.message ? esc(supplier.message) : 'Sin mensaje'}</small></div>
      </div>
      <div class="order-actions">
        <button class="ghost" type="button" data-supplier-status="aprobado">Aprobar</button>
        <button class="ghost" type="button" data-supplier-status="contactado">Marcar contactado</button>
        <button class="ghost danger" type="button" data-supplier-status="rechazado">Rechazar</button>
        <span class="form-message" data-message role="status"></span>
      </div>
    </article>`;
  }).join('');
}

async function setSupplierStatus(card, status) {
  const id = card.dataset.supplier;
  const message = card.querySelector('[data-message]');
  if (message) { message.textContent = ''; message.classList.remove('error'); }
  try {
    await api(`/api/admin/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (message) message.textContent = `Tienda marcada como ${SUPPLIER_LABELS[status]}.`;
    await loadSuppliers(true);
    loadOverview(true);
  } catch (error) {
    if (error.unauthorized) return showLogin();
    if (message) { message.textContent = error.message; message.classList.add('error'); }
  }
}

function fillSupplierSelect() {
  const select = $('product-supplier');
  if (!select) return;
  const approved = state.suppliers.filter((supplier) => supplier.status === 'aprobado');
  select.innerHTML = '<option value="">Elige una tienda aprobada</option>' +
    approved.map((supplier) => `<option value="${supplier.id}">${esc(supplier.businessName)}${supplier.city ? ` · ${esc(supplier.city)}` : ''}</option>`).join('');
}

/* ---------------------------- Productos ---------------------------- */

async function loadProducts() {
  try {
    const data = await api('/api/admin/products');
    state.products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
  } catch (error) {
    if (error.unauthorized) return showLogin();
    const list = $('products-list');
    if (list) list.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  }
}

function renderProducts() {
  const list = $('products-list');
  if (!list) return;
  $('products-count').textContent = String(state.products.filter((product) => product.active).length);
  $('products-list-count').textContent = String(state.products.length);
  const tabCount = $('tab-products-count');
  if (tabCount) tabCount.textContent = String(state.products.length);
  if (!state.products.length) {
    list.innerHTML = '<p class="muted">Todavía no hay productos publicados.</p>';
    return;
  }
  list.innerHTML = state.products.map((product) => {
    const image = safeUrl(product.imageUrl);
    const url = safeUrl(product.itemUrl);
    return `<article class="product-row" data-product="${product.dbId || product.id}">
      <div class="product-thumb">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : esc(String(product.brand || 'AL').slice(0, 2).toUpperCase())}</div>
      <div class="product-main"><b>${esc(product.name)}</b><small>${esc(product.brand || '—')} · ${esc(product.model || 'sin modelo')} · ${esc(product.seller || '')}</small><small>${esc(CATEGORY_NAMES[product.category] || product.category)} · ${esc(product.spec || '')}</small></div>
      <div class="product-price"><b>${fmtMoney(product.price, product.currency)}</b><small>${product.active ? 'Activo' : 'Oculto'}</small></div>
      <div class="product-actions">
        ${url ? `<a class="ghost" href="${esc(url)}" target="_blank" rel="noreferrer">Ver ↗</a>` : ''}
        <button class="ghost" type="button" data-toggle-active>${product.active ? 'Ocultar' : 'Activar'}</button>
        <button class="ghost danger" type="button" data-delete>Borrar</button>
        <span class="form-message" data-message role="status"></span>
      </div>
    </article>`;
  }).join('');
}

async function toggleProduct(card) {
  const id = card.dataset.product;
  const product = state.products.find((item) => String(item.dbId || item.id) === String(id));
  if (!product) return;
  const message = card.querySelector('[data-message]');
  try {
    await api(`/api/admin/products/${product.dbId}`, { method: 'PATCH', body: JSON.stringify({ active: !product.active }) });
    await loadProducts();
    loadOverview(true);
  } catch (error) {
    if (error.unauthorized) return showLogin();
    if (message) { message.textContent = error.message; message.classList.add('error'); }
  }
}

async function deleteProduct(card) {
  const id = card.dataset.product;
  const product = state.products.find((item) => String(item.dbId || item.id) === String(id));
  if (!product || !window.confirm(`¿Borrar "${product.name}" del catálogo?`)) return;
  try {
    await api(`/api/admin/products/${product.dbId}`, { method: 'DELETE' });
    await loadProducts();
    loadOverview(true);
  } catch (error) {
    if (error.unauthorized) return showLogin();
    window.alert(error.message);
  }
}

function productPayload() {
  const supports = $('attr-supports').value.split(',').map((item) => item.trim()).filter(Boolean);
  const forms = $('attr-forms').value.split(',').map((item) => item.trim()).filter(Boolean);
  const attributes = {};
  if ($('attr-socket').value.trim()) attributes.socket = $('attr-socket').value.trim();
  if ($('attr-memory').value.trim()) attributes.memory = $('attr-memory').value.trim();
  if ($('attr-form').value.trim()) attributes.form = $('attr-form').value.trim();
  if (supports.length) attributes.supports = supports;
  if (forms.length) attributes.forms = forms;
  for (const [id, field] of [['attr-watts', 'watts'], ['attr-clearance', 'clearance'], ['attr-length', 'length'], ['attr-minpsu', 'minPsu']]) {
    const value = Number($(id).value);
    if (Number.isFinite(value) && value > 0) attributes[field] = value;
  }
  if ($('attr-igpu').checked) attributes.igpu = true;
  if ($('attr-integrated').checked) attributes.integrated = true;
  return {
    supplierId: $('product-supplier').value,
    category: $('product-category').value,
    name: $('product-name').value.trim(),
    brand: $('product-brand').value.trim(),
    model: $('product-model').value.trim(),
    spec: $('product-spec').value.trim(),
    price: Number($('product-price').value),
    currency: $('product-currency').value,
    imageUrl: $('product-image').value.trim(),
    productUrl: $('product-url').value.trim(),
    attributes,
  };
}

function resetProductForm() {
  $('product-form').reset();
  $('product-status').textContent = '';
  $('product-status').classList.remove('error');
  $('import-status').textContent = '';
}

/* ---------------------------- Eventos ---------------------------- */

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('login-btn');
  const key = $('admin-key').value.trim();
  if (!key) { loginMessage('Escribe la clave de administrador.', 'error'); return; }
  button.disabled = true;
  button.textContent = 'Entrando…';
  loginMessage('Comprobando la clave…');
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ key }) });
    $('admin-key').value = '';
    loginMessage('');
    showPanel();
    await loadOverview();
    setTab('resumen');
  } catch (error) {
    loginMessage(error.message, 'error');
    $('admin-key').select();
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar';
  }
});

$('logout-btn').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch { /* se cierra igual */ }
  state.data = null;
  showLogin();
  loginMessage('Sesión cerrada.', 'ok');
});

$('refresh-btn').addEventListener('click', async () => {
  await loadOverview();
  if (state.activeTab === 'pedidos') loadOrders();
  if (state.activeTab === 'tiendas') loadSuppliers(true);
  if (state.activeTab === 'productos') { loadProducts(); loadSuppliers(true); }
});

$('search-input').addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderUsers();
});

$('orders-filter').addEventListener('change', loadOrders);

$('orders-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const card = button.closest('[data-order]');
  if (card) saveOrder(card);
});

$('suppliers-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-supplier-status]');
  if (!button) return;
  const card = button.closest('[data-supplier]');
  if (card) setSupplierStatus(card, button.dataset.supplierStatus);
});

$('products-list').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-toggle-active]');
  if (toggle) return toggleProduct(toggle.closest('[data-product]'));
  const remove = event.target.closest('[data-delete]');
  if (remove) return deleteProduct(remove.closest('[data-product]'));
});

$('product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('product-status');
  const button = $('product-submit');
  status.textContent = '';
  status.classList.remove('error');
  const payload = productPayload();
  if (!payload.supplierId) { status.textContent = 'Elige una tienda aprobada.'; status.classList.add('error'); return; }
  if (!payload.name) { status.textContent = 'Escribe el nombre del producto.'; status.classList.add('error'); return; }
  if (!Number.isFinite(payload.price) || payload.price < 0) { status.textContent = 'Escribe un precio válido.'; status.classList.add('error'); return; }
  button.disabled = true;
  button.textContent = 'Publicando…';
  try {
    await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
    status.textContent = 'Producto publicado. Ya aparece en el configurador si la tienda está aprobada.';
    resetProductForm();
    await loadProducts();
    loadOverview(true);
  } catch (error) {
    if (error.unauthorized) return showLogin();
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    button.disabled = false;
    button.textContent = 'Publicar producto';
  }
});

$('product-reset').addEventListener('click', resetProductForm);

$('import-btn').addEventListener('click', async () => {
  const url = $('import-url').value.trim();
  const status = $('import-status');
  const button = $('import-btn');
  status.textContent = '';
  status.classList.remove('error');
  if (!url) { status.textContent = 'Pega la URL del producto.'; status.classList.add('error'); return; }
  button.disabled = true;
  button.textContent = 'Leyendo…';
  try {
    const data = await api('/api/admin/products/import', { method: 'POST', body: JSON.stringify({ url }) });
    const suggestion = data.suggestion || {};
    if (suggestion.name) $('product-name').value = suggestion.name;
    if (suggestion.brand) $('product-brand').value = suggestion.brand;
    if (suggestion.spec) $('product-spec').value = suggestion.spec;
    if (suggestion.imageUrl) $('product-image').value = suggestion.imageUrl;
    if (suggestion.price) $('product-price').value = suggestion.price;
    if (suggestion.currency) $('product-currency').value = suggestion.currency === 'DOP' ? 'DOP' : 'USD';
    $('product-url').value = suggestion.url || url;
    status.textContent = 'Datos sugeridos. Revisa precio, modelo y compatibilidad antes de publicar.';
  } catch (error) {
    if (error.unauthorized) return showLogin();
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    button.disabled = false;
    button.textContent = 'Sugerir datos';
  }
});

async function init() {
  $('search-input').value = '';
  try {
    const session = await api('/api/admin/session');
    if (session.authenticated) {
      showPanel();
      await loadOverview();
      setTab('resumen');
      return;
    }
  } catch { /* sin sesión */ }
  showLogin();
}

init();
