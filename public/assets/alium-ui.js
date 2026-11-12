'use strict';

/* ALIUM · Utilidades compartidas de páginas internas */

const $ = (id) => document.getElementById(id);

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

/* Tema */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  safeSet('alium_theme', theme);
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    const dark = theme === 'dark';
    button.textContent = dark ? '☀ Tema claro' : '☾ Tema oscuro';
    button.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    button.setAttribute('aria-label', button.title);
  });
}
applyTheme(safeGet('alium_theme') || 'dark');
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-theme-toggle]')) {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    return;
  }
  const toggle = event.target.closest('[data-nav-toggle]');
  if (toggle) {
    const nav = document.querySelector('[data-nav]');
    if (!nav) return;
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    return;
  }
  if (!event.target.closest('[data-nav]') && !event.target.closest('[data-nav-toggle]')) {
    const nav = document.querySelector('[data-nav]');
    if (nav) nav.classList.remove('is-open');
    const toggle = document.querySelector('[data-nav-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
});

/* Año del pie */
document.querySelectorAll('[data-year]').forEach((element) => { element.textContent = new Date().getFullYear(); });

function toast(message, isError) {
  let element = $('alium-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'alium-toast';
    element.className = 'toast';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.toggle('error', Boolean(isError));
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 4600);
}

/* ------------------------------------------------------------------ */
/* Tiendas                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_NAMES = {
  cpu: 'Procesadores', cooler: 'Disipadores', motherboard: 'Placas madre', memory: 'Memoria',
  storage: 'Almacenamiento', gpu: 'Tarjetas de video', case: 'Cases', psu: 'Fuentes',
  os: 'Sistemas operativos', monitor: 'Monitores',
};

async function loadStores() {
  const list = $('store-list');
  if (!list) return;
  try {
    const response = await fetch('/api/stores', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    const stores = Array.isArray(data.stores) ? data.stores : [];
    if (!stores.length) {
      list.innerHTML = '<p class="empty">Todavía no hay tiendas verificadas publicadas. Si tienes una tienda de tecnología, puedes postularte aquí abajo.</p>';
      return;
    }
    list.innerHTML = stores.map((store) => {
      const url = safeUrl(store.website);
      const categories = (store.categories || []).map((category) => CATEGORY_NAMES[category] || category).join(' · ');
      return `<article class="store-card">
        <span class="store-mark" aria-hidden="true">${escapeHTML(String(store.name || 'A').slice(0, 2).toUpperCase())}</span>
        <div><h3>${escapeHTML(store.name)}</h3><p>${escapeHTML(store.city || 'República Dominicana')}${categories ? ` · ${escapeHTML(categories)}` : ''}</p></div>
        ${url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Visitar tienda ↗</a>` : '<span class="small-note">Sin web pública</span>'}
      </article>`;
    }).join('');
  } catch {
    list.innerHTML = '<p class="empty">No pudimos cargar las tiendas en este momento. Intenta de nuevo en unos minutos.</p>';
  }
}

const storeForm = $('store-form');
if (storeForm) {
  storeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('store-status');
    const button = $('store-submit');
    const categories = [...storeForm.querySelectorAll('input[name="categories"]:checked')].map((input) => input.value);
    const payload = {
      businessName: $('store-business').value.trim(),
      contactName: $('store-contact').value.trim(),
      email: $('store-email').value.trim(),
      phone: $('store-phone').value.trim(),
      website: $('store-website').value.trim(),
      city: $('store-city').value.trim(),
      categories,
      message: $('store-message').value.trim(),
    };
    if (!payload.businessName || !payload.contactName || !payload.email || !payload.phone || !payload.website || !payload.city) {
      status.textContent = 'Completa el nombre de la tienda, el contacto, el correo, el teléfono, la web y la ciudad.';
      status.classList.add('error');
      return;
    }
    if (!categories.length) {
      status.textContent = 'Marca al menos una categoría de productos.';
      status.classList.add('error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Enviando…';
    status.textContent = '';
    status.classList.remove('error');
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar el registro.');
      storeForm.reset();
      status.textContent = data.message || 'Recibimos los datos de tu tienda. Te contactaremos pronto.';
      toast('Registro de tienda enviado.');
    } catch (error) {
      status.textContent = error.message || 'No se pudo enviar el registro.';
      status.classList.add('error');
    } finally {
      button.disabled = false;
      button.textContent = 'Enviar registro de tienda';
    }
  });
}

/* ------------------------------------------------------------------ */
/* Seguimiento de pedido                                              */
/* ------------------------------------------------------------------ */

const ORDER_STEPS = [
  { id: 'nuevo', label: 'Pedido recibido', note: 'ALIUM revisa tu selección y confirma disponibilidad.' },
  { id: 'contactado', label: 'Contacto iniciado', note: 'Te escribimos por WhatsApp para validar los detalles.' },
  { id: 'cotizado', label: 'Precio y fecha confirmados', note: 'Recibes el precio final y la fecha estimada por escrito.' },
  { id: 'confirmado', label: 'Anticipo del 50% recibido', note: 'ALIUM inicia la compra de las piezas.' },
  { id: 'comprando', label: 'Comprando piezas', note: 'Estamos adquiriendo cada componente con el proveedor.' },
  { id: 'en_transito', label: 'Piezas en tránsito', note: 'Las piezas vienen en camino a ALIUM.' },
  { id: 'armando', label: 'Armado y prueba', note: 'Verificamos compatibilidad, encendido y estabilidad.' },
  { id: 'listo', label: 'Listo para entrega o retiro', note: 'Coordinamos contigo la entrega y el saldo restante.' },
  { id: 'entregado', label: 'Entregado', note: 'Pedido completado. Garantía activa según la política.' },
];
const STATUS_LABELS = Object.fromEntries(ORDER_STEPS.map((step) => [step.id, step.label]));
STATUS_LABELS.cancelado = 'Cancelado';

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtMoney(value, currency) {
  const number = Number(value) || 0;
  if (currency === 'DOP') return 'RD$ ' + new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(number);
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number) + ' USD';
}
function depositFor(order) {
  return (Number(order.total) || Number(order.subtotal) || 0) * ((Number(order.depositPercent) || 50) / 100);
}

function renderOrder(order) {
  const panel = $('track-result');
  if (!panel) return;
  const currentIndex = ORDER_STEPS.findIndex((step) => step.id === order.status);
  const cancelled = order.status === 'cancelado';
  const parts = Array.isArray(order.parts) ? order.parts : [];
  panel.innerHTML = `
    <div class="track-head">
      <div><p class="kicker">Pedido</p><h2>${escapeHTML(order.code)}</h2><p class="muted">Creado el ${fmtDate(order.createdAt)}</p></div>
      <span class="pill ${cancelled ? 'warn' : order.status === 'entregado' ? 'green' : ''}">${escapeHTML(STATUS_LABELS[order.status] || order.status)}</span>
    </div>
    ${cancelled ? '<div class="notice warn">Este pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.</div>' : `
      <div class="notice"><b>Fecha estimada:</b> ${order.estimatedDate ? fmtDate(order.estimatedDate) : 'Se confirma al validar disponibilidad.'}${order.status === 'confirmado' || order.status === 'comprando' || order.status === 'en_transito' || order.status === 'armando' || order.status === 'listo' ? ' · Si nos retrasamos, aplica la compensación de la política de garantía.' : ''}</div>
      <ol class="timeline">${ORDER_STEPS.map((step, index) => `<li class="${!cancelled && index <= currentIndex ? 'done' : ''}"><b>${escapeHTML(step.label)}</b><small>${escapeHTML(step.note)}</small></li>`).join('')}</ol>
    `}
    <h3>Piezas del pedido</h3>
    <div class="table-wrap"><table><thead><tr><th>Pieza</th><th>Modelo</th><th>Precio ref.</th></tr></thead><tbody>
      ${parts.map((part) => `<tr><td><b>${escapeHTML(CATEGORY_NAMES[part.category] || part.category || 'Pieza')}</b></td><td>${escapeHTML([part.brand, part.name].filter(Boolean).join(' '))}</td><td>${fmtMoney(part.price, part.currency)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="track-totals">
      <div><span>Subtotal piezas</span><b>${fmtMoney(order.subtotal, order.currency)}</b></div>
      ${order.assembly === 'alium' ? `<div><span>Armado por ALIUM</span><b>${fmtMoney(order.assemblyFee, order.currency)}</b></div>` : ''}
      <div><span>Modalidad</span><b>${order.assembly === 'alium' ? 'ALIUM arma la PC' : 'El cliente arma la PC'}</b></div>
      <div><span>Entrega</span><b>${order.fulfillment === 'entrega' ? 'A domicilio (costo por zona)' : 'Retiro'}</b></div>
      <div><span>Total de referencia</span><b>${fmtMoney(order.total ?? order.subtotal, order.currency)}</b></div>
      <div class="track-deposit"><span>Anticipo ${order.depositPercent || 50}%</span><b>${fmtMoney(depositFor(order), order.currency)}</b></div>
    </div>
    ${order.adminNotes ? `<div class="notice"><b>Nota de ALIUM:</b> ${escapeHTML(order.adminNotes)}</div>` : ''}
    <p class="small-note">Este seguimiento muestra el estado del pedido, no tus datos personales completos. Para cambios, escríbenos por WhatsApp con tu código.</p>
  `;
  panel.hidden = false;
  $('track-form').hidden = true;
}

async function trackOrder(code, contact) {
  const status = $('track-status');
  const button = $('track-submit');
  if (!code || !contact) {
    status.textContent = 'Escribe el código del pedido y el WhatsApp o correo con el que lo hiciste.';
    status.classList.add('error');
    return;
  }
  status.textContent = 'Buscando tu pedido…';
  status.classList.remove('error');
  button.disabled = true;
  button.textContent = 'Buscando…';
  try {
    const response = await fetch(`/api/orders/track?code=${encodeURIComponent(code)}&contact=${encodeURIComponent(contact)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No encontramos el pedido.');
    renderOrder(data.order);
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message || 'No encontramos el pedido.';
    status.classList.add('error');
  } finally {
    button.disabled = false;
    button.textContent = 'Consultar pedido';
  }
}

const trackForm = $('track-form');
if (trackForm) {
  const params = new URLSearchParams(location.search);
  if (params.get('code')) $('track-code').value = params.get('code').toUpperCase();
  trackForm.addEventListener('submit', (event) => {
    event.preventDefault();
    trackOrder($('track-code').value.trim().toUpperCase(), $('track-contact').value.trim());
  });
  if (params.get('code') && params.get('contact')) {
    $('track-contact').value = params.get('contact');
    trackOrder(params.get('code').toUpperCase(), params.get('contact'));
  }
}

/* Carga inicial */
loadStores();
