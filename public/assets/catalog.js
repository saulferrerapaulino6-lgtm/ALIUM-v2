'use strict';

/* ============================================================
   ALIUM · Configurador + pedido por WhatsApp
   ============================================================ */

const CONFIG = window.ALIUM_CONFIG || {};
const WHATSAPP_NUMBER = String(CONFIG.whatsappNumber || '').replace(/\D/g, '');
const ASSEMBLY_FEE_DOP = Number(CONFIG.assemblyFeeDop) || 1500;
const DEPOSIT_PERCENT = Number(CONFIG.depositPercent) || 50;
const SITE_URL = String(CONFIG.siteUrl || location.origin).replace(/\/$/, '');

const state = {
  cpu: '', use: '', tier: '', mode: '', budget: 0, budgetUsd: 0, currency: 'USD',
  assembly: '', fulfillment: '', orderSent: false,
};

const CATEGORIES = [
  { id: 'cpu', name: 'Procesador', label: 'Procesadores', required: true },
  { id: 'cooler', name: 'Disipador de CPU', label: 'Disipadores de CPU', required: true },
  { id: 'motherboard', name: 'Placa madre', label: 'Placas madre', required: true },
  { id: 'memory', name: 'Memoria', label: 'Memoria', required: true },
  { id: 'storage', name: 'Almacenamiento', label: 'Almacenamiento', required: true },
  { id: 'gpu', name: 'Tarjeta de video', label: 'Tarjetas de video', required: true },
  { id: 'case', name: 'Case', label: 'Cases', required: true },
  { id: 'psu', name: 'Fuente de alimentación', label: 'Fuentes de alimentación', required: true },
  { id: 'os', name: 'Sistema operativo', label: 'Sistemas operativos', required: false },
  { id: 'monitor', name: 'Monitor', label: 'Monitores', required: false },
];

const PRODUCTS = [
  { id: 'cpu-r5-5600g', category: 'cpu', name: 'Ryzen 5 5600G', brand: 'AMD', platform: 'AMD', spec: '6 núcleos · AM4 · gráficos integrados', socket: 'AM4', memory: 'DDR4', watts: 65, igpu: true, tier: 1, price: 115, seller: 'Referencia ALIUM' },
  { id: 'cpu-r5-7600', category: 'cpu', name: 'Ryzen 5 7600', brand: 'AMD', platform: 'AMD', spec: '6 núcleos · AM5 · 5.1 GHz', socket: 'AM5', memory: 'DDR5', watts: 65, igpu: true, tier: 2, price: 185, seller: 'Referencia ALIUM' },
  { id: 'cpu-r7-7800x3d', category: 'cpu', name: 'Ryzen 7 7800X3D', brand: 'AMD', platform: 'AMD', spec: '8 núcleos · AM5 · gaming', socket: 'AM5', memory: 'DDR5', watts: 120, igpu: true, tier: 3, price: 420, seller: 'Referencia ALIUM' },
  { id: 'cpu-i3-12100', category: 'cpu', name: 'Core i3-12100', brand: 'Intel', platform: 'Intel', spec: '4 núcleos · LGA1700 · gráficos integrados', socket: 'LGA1700', memory: 'DDR4', watts: 60, igpu: true, tier: 1, price: 115, seller: 'Referencia ALIUM' },
  { id: 'cpu-i5-14400', category: 'cpu', name: 'Core i5-14400', brand: 'Intel', platform: 'Intel', spec: '10 núcleos · LGA1700 · gráficos integrados', socket: 'LGA1700', memory: 'DDR5', watts: 65, igpu: true, tier: 2, price: 215, seller: 'Referencia ALIUM' },
  { id: 'cpu-i7-14700k', category: 'cpu', name: 'Core i7-14700K', brand: 'Intel', platform: 'Intel', spec: '20 núcleos · LGA1700 · 5.6 GHz', socket: 'LGA1700', memory: 'DDR5', watts: 125, igpu: true, tier: 3, price: 385, seller: 'Referencia ALIUM' },
  { id: 'cooler-pa120', category: 'cooler', name: 'Peerless Assassin 120 SE', brand: 'Thermalright', spec: 'Doble torre · 2 ventiladores', supports: ['AM4', 'AM5', 'LGA1700'], tier: 1, price: 35, seller: 'Referencia ALIUM' },
  { id: 'cooler-ak620', category: 'cooler', name: 'AK620 Digital', brand: 'DeepCool', spec: 'Doble torre · pantalla digital', supports: ['AM4', 'AM5', 'LGA1700'], tier: 2, price: 68, seller: 'Referencia ALIUM' },
  { id: 'cooler-liquid', category: 'cooler', name: 'Liquid Freezer III 360', brand: 'ARCTIC', spec: 'Refrigeración líquida · radiador 360 mm', supports: ['AM4', 'AM5', 'LGA1700'], radiator: 360, tier: 3, price: 105, seller: 'Referencia ALIUM' },
  { id: 'mb-b450', category: 'motherboard', name: 'B450M DS3H', brand: 'Gigabyte', spec: 'Micro-ATX · AM4 · DDR4', socket: 'AM4', memory: 'DDR4', form: 'Micro-ATX', tier: 1, price: 88, seller: 'Referencia ALIUM' },
  { id: 'mb-b650', category: 'motherboard', name: 'B650 Eagle AX', brand: 'Gigabyte', spec: 'ATX · AM5 · DDR5 · Wi-Fi', socket: 'AM5', memory: 'DDR5', form: 'ATX', tier: 2, price: 175, seller: 'Referencia ALIUM' },
  { id: 'mb-b760', category: 'motherboard', name: 'B760 Gaming Plus WiFi', brand: 'MSI', spec: 'ATX · LGA1700 · DDR5 · Wi-Fi', socket: 'LGA1700', memory: 'DDR5', form: 'ATX', tier: 2, price: 165, seller: 'Referencia ALIUM' },
  { id: 'mb-z790', category: 'motherboard', name: 'Z790 AORUS Elite AX', brand: 'Gigabyte', spec: 'ATX · LGA1700 · DDR5', socket: 'LGA1700', memory: 'DDR5', form: 'ATX', tier: 3, price: 245, seller: 'Referencia ALIUM' },
  { id: 'ram-ddr4', category: 'memory', name: 'Vengeance LPX 16 GB', brand: 'Corsair', spec: '2 × 8 GB · DDR4 · 3200 MT/s', memory: 'DDR4', tier: 1, price: 42, seller: 'Referencia ALIUM' },
  { id: 'ram-ddr5-32', category: 'memory', name: 'Vengeance 32 GB', brand: 'Corsair', spec: '2 × 16 GB · DDR5 · 6000 MT/s', memory: 'DDR5', tier: 2, price: 92, seller: 'Referencia ALIUM' },
  { id: 'ram-ddr5-64', category: 'memory', name: 'Flare X5 64 GB', brand: 'G.Skill', spec: '2 × 32 GB · DDR5 · 6000 MT/s', memory: 'DDR5', tier: 3, price: 175, seller: 'Referencia ALIUM' },
  { id: 'ssd-500', category: 'storage', name: 'NV2 500 GB', brand: 'Kingston', spec: 'M.2 NVMe · PCIe 4.0', tier: 1, price: 38, seller: 'Referencia ALIUM' },
  { id: 'ssd-1tb', category: 'storage', name: '990 EVO 1 TB', brand: 'Samsung', spec: 'M.2 NVMe · PCIe 4.0', tier: 2, price: 82, seller: 'Referencia ALIUM' },
  { id: 'ssd-2tb', category: 'storage', name: 'SN850X 2 TB', brand: 'WD_BLACK', spec: 'M.2 NVMe · PCIe 4.0', tier: 3, price: 145, seller: 'Referencia ALIUM' },
  { id: 'gpu-integrated', category: 'gpu', name: 'Gráficos integrados', brand: 'Integrada', spec: 'Usa los gráficos del procesador · sin tarjeta dedicada', watts: 0, minPsu: 0, integrated: true, tier: 1, price: 0, seller: 'Incluido en CPU' },
  { id: 'gpu-arc', category: 'gpu', name: 'Arc B580 12 GB', brand: 'Intel', spec: '12 GB · HDMI / DisplayPort · 190 W', watts: 190, minPsu: 600, length: 272, tier: 1, price: 260, seller: 'Referencia ALIUM' },
  { id: 'gpu-7800xt', category: 'gpu', name: 'Radeon RX 7800 XT', brand: 'Sapphire', spec: '16 GB · 263 W · Triple ventilador', watts: 263, minPsu: 700, length: 320, tier: 2, price: 500, seller: 'Referencia ALIUM' },
  { id: 'gpu-4070s', category: 'gpu', name: 'GeForce RTX 4070 SUPER', brand: 'ASUS', spec: '12 GB · 220 W · DLSS', watts: 220, minPsu: 650, length: 301, tier: 3, price: 620, seller: 'Referencia ALIUM' },
  { id: 'case-matx', category: 'case', name: 'Box M100R', brand: 'Cooler Master', spec: 'Micro-ATX · GPU hasta 330 mm', forms: ['Micro-ATX', 'Mini-ITX'], clearance: 330, tier: 1, price: 62, seller: 'Referencia ALIUM' },
  { id: 'case-4000d', category: 'case', name: '4000D Airflow', brand: 'Corsair', spec: 'ATX · GPU hasta 360 mm', forms: ['ATX', 'Micro-ATX', 'Mini-ITX'], clearance: 360, tier: 2, price: 98, seller: 'Referencia ALIUM' },
  { id: 'case-h7', category: 'case', name: 'H7 Flow', brand: 'NZXT', spec: 'ATX · GPU hasta 400 mm', forms: ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX'], clearance: 400, tier: 3, price: 135, seller: 'Referencia ALIUM' },
  { id: 'psu-550', category: 'psu', name: 'CX550', brand: 'Corsair', spec: '550 W · 80 PLUS Bronze', watts: 550, tier: 1, price: 62, seller: 'Referencia ALIUM' },
  { id: 'psu-750', category: 'psu', name: 'RM750e', brand: 'Corsair', spec: '750 W · 80 PLUS Gold · modular', watts: 750, tier: 2, price: 105, seller: 'Referencia ALIUM' },
  { id: 'psu-850', category: 'psu', name: 'MAG A850GL', brand: 'MSI', spec: '850 W · 80 PLUS Gold · modular', watts: 850, tier: 3, price: 125, seller: 'Referencia ALIUM' },
  { id: 'os-home', category: 'os', name: 'Windows 11 Home', brand: 'Microsoft', spec: 'Licencia digital · 64 bits', tier: 2, price: 120, seller: 'Referencia ALIUM' },
  { id: 'os-linux', category: 'os', name: 'Ubuntu Desktop', brand: 'Canonical', spec: 'Sistema operativo · descarga gratuita', tier: 1, price: 0, seller: 'Referencia ALIUM' },
  { id: 'monitor-fhd', category: 'monitor', name: 'TUF Gaming VG249Q1A', brand: 'ASUS', spec: '24 pulgadas · Full HD · 165 Hz', tier: 1, price: 160, seller: 'Referencia ALIUM' },
  { id: 'monitor-qhd', category: 'monitor', name: 'G27Q', brand: 'Gigabyte', spec: '27 pulgadas · QHD · 144 Hz', tier: 2, price: 250, seller: 'Referencia ALIUM' },
];

const REQUIRED = CATEGORIES.filter((category) => category.required).map((category) => category.id);
const CATEGORY_IMAGES = {
  cpu: 'assets/cpu.svg', cooler: 'assets/cooler.png', motherboard: 'assets/motherboard.png',
  memory: 'assets/memory.png', storage: 'assets/ssd.svg', gpu: 'assets/gpu.png',
  case: 'assets/case.svg', psu: 'assets/power.png', os: 'assets/os.svg', monitor: 'assets/monitor.svg',
};

let chosen = {};
let activeCategory = 'cpu';
let step = 0;
let exchangeRate = 60.84;
let rateDate = '29/10/2026';
let storeProducts = [];
let currentUser = null;
let pendingSave = false;
let lastWhatsAppUrl = '';

const $ = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll('.step')];
const progress = $('progress');

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function safeProductUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

/* ---------------------------- Tema y moneda ---------------------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  safeSet('alium_theme', theme);
  const button = $('theme-toggle');
  if (!button) return;
  const dark = theme === 'dark';
  button.textContent = dark ? '☀ Tema claro' : '☾ Tema oscuro';
  const label = dark ? 'Tema oscuro activo. Cambiar a claro' : 'Tema claro activo. Cambiar a oscuro';
  button.title = label;
  button.setAttribute('aria-label', label);
}

function budgetNumber() {
  const input = $('budget');
  if (!input) return 0;
  const digits = String(input.value || '').replace(/[^\d.]/g, '');
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}
function budgetText(value) {
  const n = Math.round(Number(value) || 0);
  return new Intl.NumberFormat(state.currency === 'DOP' ? 'es-DO' : 'en-US', { maximumFractionDigits: 0 }).format(n);
}
function setBudgetField(value, updateHelper) {
  const input = $('budget');
  if (!input) return;
  const n = Number(value) || 0;
  input.value = n > 0 ? budgetText(n) : '';
  if (updateHelper !== false) {
    const helper = $('budget-helper');
    if (helper) {
      const symbol = state.currency === 'DOP' ? 'RD$' : '$';
      helper.textContent = n > 0
        ? `Monto disponible: ${symbol} ${budgetText(n)} ${state.currency} (se guarda con separadores de miles).`
        : 'Escribe el monto total que tienes pensado para los componentes.';
    }
  }
}
function applyCurrency(currency, convertInput) {
  const old = state.currency;
  const current = budgetNumber();
  state.currency = currency;
  safeSet('alium_currency', currency);
  if (convertInput && current) {
    const converted = old === 'USD' && currency === 'DOP' ? current * exchangeRate
      : old === 'DOP' && currency === 'USD' ? current / exchangeRate : current;
    setBudgetField(converted);
  } else {
    setBudgetField(current);
  }
  $('currency-select').value = currency;
  $('money-prefix').textContent = currency === 'DOP' ? 'RD$' : '$';
  $('money-code').textContent = currency;
  $('budget').min = currency === 'DOP' ? Math.ceil(300 * exchangeRate) : 300;
  $('budget').placeholder = currency === 'DOP' ? 'Por ejemplo: 50,000' : 'Por ejemplo: 1,500';
  $('fx-note').innerHTML = `Tasa de referencia: 1 USD ≈ RD$${exchangeRate.toFixed(2)} · ${rateDate} · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a>`;
  if (!$('results').hidden) renderResults();
}
function formatMoney(usd) {
  const value = state.currency === 'DOP' ? Number(usd) * exchangeRate : Number(usd);
  const n = new Intl.NumberFormat(state.currency === 'DOP' ? 'es-DO' : 'en-US', {
    minimumFractionDigits: state.currency === 'DOP' ? 0 : 2,
    maximumFractionDigits: state.currency === 'DOP' ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
  return state.currency === 'DOP' ? `RD$ ${n}` : `$${n} USD`;
}
function usdText(usd) {
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(usd) || 0) + ' USD';
}
function dopText(usd) {
  return 'RD$ ' + new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format((Number(usd) || 0) * exchangeRate);
}

async function loadExchangeRate() {
  try {
    const cached = JSON.parse(safeGet('alium_fx') || 'null');
    if (cached && Date.now() - cached.time < 86400000) {
      exchangeRate = cached.rate;
      rateDate = cached.date || rateDate;
    } else {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) throw new Error('rate request failed');
      const data = await response.json();
      if (data.result !== 'success' || !data.rates.DOP) throw new Error('rate unavailable');
      exchangeRate = data.rates.DOP;
      rateDate = new Date(data.time_last_update_utc || Date.now()).toLocaleDateString('es-DO');
      safeSet('alium_fx', JSON.stringify({ rate: exchangeRate, date: rateDate, time: Date.now() }));
    }
  } catch { /* se mantiene la tasa de referencia */ }
  applyCurrency(state.currency, false);
  if (!$('results').hidden) renderOrderSummary();
}

/* ---------------------------- Precios ---------------------------- */

function productPriceUsd(product) {
  const price = Number(product.price) || 0;
  if (String(product.currency || 'USD').toUpperCase() === 'DOP') return price / exchangeRate;
  return price;
}
function productPriceLabel(product) {
  const price = Number(product.price) || 0;
  if (price <= 0) return 'Incluido';
  if (String(product.currency || 'USD').toUpperCase() === 'DOP') {
    return 'RD$ ' + new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(price);
  }
  return usdText(price);
}
function assemblyFeeUsd() {
  return ASSEMBLY_FEE_DOP / exchangeRate;
}
function subtotalUsd() {
  return CATEGORIES.filter((category) => chosen[category.id])
    .reduce((sum, category) => sum + productPriceUsd(chosen[category.id]), 0);
}
function orderTotalUsd() {
  return subtotalUsd() + (state.assembly === 'alium' ? assemblyFeeUsd() : 0);
}
function depositUsd() {
  return orderTotalUsd() * (DEPOSIT_PERCENT / 100);
}

/* ---------------------------- Pasos ---------------------------- */

function showStep(n) {
  step = Math.max(0, Math.min(4, n));
  steps.forEach((element, index) => { element.hidden = index !== step; });
  $('stepcount').textContent = `Paso ${step + 1} de 5`;
  progress.style.width = `${(step + 1) * 20}%`;
}
function updateChoices() {
  document.querySelectorAll('.choice[data-group]').forEach((button) => {
    button.classList.toggle('selected', state[button.dataset.group] === button.dataset.value);
    button.setAttribute('aria-pressed', String(state[button.dataset.group] === button.dataset.value));
  });
}

/* ---------------------------- Compatibilidad ---------------------------- */

function estimateWatts(selection = chosen) {
  const cpu = selection.cpu ? selection.cpu.watts || 0 : 0;
  const gpu = selection.gpu && !selection.gpu.integrated ? selection.gpu.watts || 0 : 0;
  return cpu + gpu + 150;
}

function compatibility(product) {
  const cpu = chosen.cpu;
  const board = chosen.motherboard;
  const gpu = chosen.gpu;
  const pcCase = chosen.case;
  const psu = chosen.psu;
  const pending = (text) => ({ state: 'pending', text: text || 'Revisión pendiente' });
  const bad = (text) => ({ state: 'bad', text });
  const ok = { state: 'ok', text: 'Compatible' };
  const isStore = product.source === 'store';

  if (product.category === 'cpu') {
    if (!product.platform) return pending('Falta indicar si es AMD o Intel');
    if (product.platform !== state.cpu) return bad(`No coincide con ${state.cpu}`);
    if (board && product.socket && product.socket !== board.socket) return bad('Socket distinto a la placa seleccionada');
    if (!product.socket) return pending('Falta confirmar el socket');
    return board ? ok : pending('Elige una placa para revisar el socket');
  }
  if (product.category === 'motherboard') {
    if (!product.socket) return pending('Falta confirmar el socket');
    if (cpu && product.socket !== cpu.socket) return bad(`Necesita socket ${product.socket}`);
    if (chosen.memory && product.memory && product.memory !== chosen.memory.memory) return bad(`La memoria elegida es ${chosen.memory.memory}`);
    if (!product.memory) return pending('Falta confirmar el tipo de memoria');
    return cpu ? ok : pending('Elige procesador para revisar el socket');
  }
  if (product.category === 'memory') {
    if (!product.memory) return pending('Falta confirmar DDR4 o DDR5');
    if (board && product.memory !== board.memory) return bad(`La placa usa ${board.memory}`);
    return board ? ok : pending('Elige una placa para revisar la memoria');
  }
  if (product.category === 'cooler') {
    const socket = cpu ? cpu.socket : null;
    if (!Array.isArray(product.supports) || !product.supports.length) return pending('Falta confirmar los sockets compatibles');
    if (socket && !product.supports.includes(socket)) return bad(`No incluye soporte para ${socket}`);
    return socket ? ok : pending('Elige procesador para revisar el soporte');
  }
  if (product.category === 'case') {
    if (!Array.isArray(product.forms) || !product.forms.length) return pending('Falta confirmar los formatos admitidos');
    if (board && product.forms.indexOf(board.form) < 0) return bad(`No admite formato ${board.form}`);
    if (gpu && product.clearance && gpu.length > product.clearance) return bad('La gráfica supera el espacio del case');
    return board || gpu ? ok : pending('Elige placa y gráfica para revisar el espacio');
  }
  if (product.category === 'gpu') {
    if (product.integrated && cpu && !cpu.igpu) return bad('El procesador no tiene gráficos integrados');
    if (!product.integrated && !product.watts) return pending('Falta confirmar el consumo de la tarjeta');
    if (!product.integrated && psu && psu.watts < (cpu ? cpu.watts : 0) + (product.watts || 0) + 150) return bad('La fuente tiene poca potencia');
    if (!product.integrated && pcCase && product.length && product.length > pcCase.clearance) return bad('La gráfica supera el espacio del case');
    return psu || pcCase ? ok : pending('Elige fuente y case para revisar potencia y espacio');
  }
  if (product.category === 'psu') {
    if (!product.watts) return pending('Falta confirmar la potencia de la fuente');
    const watts = (cpu ? cpu.watts : 0) + (gpu && !gpu.integrated ? gpu.watts : 0) + 150;
    if (cpu && gpu && product.watts < watts * 1.2) return bad(`Se recomienda una fuente de al menos ${Math.ceil(watts * 1.2)} W`);
    return cpu && gpu ? ok : pending('Elige procesador y gráfica para calcular potencia');
  }
  return ok;
}

/* ---------------------------- Catálogo ---------------------------- */

function currentCatalogProducts() {
  return [...storeProducts, ...PRODUCTS].filter((product) => {
    if (product.category !== activeCategory) return false;
    if (activeCategory === 'cpu' && state.cpu && product.platform && product.platform !== state.cpu) return false;
    return true;
  });
}

function renderCategories() {
  const nav = $('category-nav');
  nav.innerHTML = CATEGORIES.map((category) => {
    const selected = chosen[category.id];
    const label = selected ? selected.name : (category.required ? 'Sin elegir' : 'Opcional');
    return `<button class="category-button ${activeCategory === category.id ? 'active' : ''}" data-category="${category.id}"><span>${category.name}</span><small class="${selected ? 'chosen' : ''}">${escapeHTML(label)}</small></button>`;
  }).join('');
}

function renderSelected() {
  const entries = CATEGORIES.filter((category) => chosen[category.id]);
  const amount = subtotalUsd();
  $('selected-count').textContent = `${entries.length} de ${REQUIRED.length} piezas`;
  $('sidebar-total').textContent = formatMoney(amount);
  $('watts').textContent = entries.length ? `${estimateWatts()} W` : '—';
  $('total').textContent = formatMoney(amount);
  $('selected-list').innerHTML = entries.map((category) => {
    const product = chosen[category.id];
    return `<div class="selected-mini"><b>${category.name}</b><span>${escapeHTML(product.brand)} · ${escapeHTML(product.name)} · ${productPriceLabel(product)}</span><button type="button" data-remove="${category.id}">Quitar</button></div>`;
  }).join('');
}

function renderBrands() {
  const list = currentCatalogProducts();
  const oldBrand = $('brand-filter').value;
  const oldSeller = $('seller-filter').value;
  const brands = [...new Set(list.map((product) => product.brand).filter(Boolean))].sort();
  const sellers = [...new Set(list.map((product) => product.source === 'store' ? product.seller : 'Referencia ALIUM'))].sort();
  $('brand-filter').innerHTML = '<option value="">Todas las marcas</option>' + brands.map((brand) => `<option value="${escapeHTML(brand)}">${escapeHTML(brand)}</option>`).join('');
  $('seller-filter').innerHTML = '<option value="">Todas las tiendas</option>' + sellers.map((seller) => `<option value="${escapeHTML(seller)}">${escapeHTML(seller)}</option>`).join('');
  $('brand-filter').value = brands.includes(oldBrand) ? oldBrand : '';
  $('seller-filter').value = sellers.includes(oldSeller) ? oldSeller : '';
}

function renderCatalog() {
  const category = CATEGORIES.find((item) => item.id === activeCategory);
  $('catalog-title').textContent = category.label;
  renderBrands();
  const query = $('catalog-search').value.trim().toLowerCase();
  const brand = $('brand-filter').value;
  const seller = $('seller-filter').value;
  const onlyCompatible = $('compatible-only').checked;
  const list = currentCatalogProducts().filter((product) => {
    const haystack = `${product.name} ${product.brand} ${product.spec}`.toLowerCase();
    const sellerName = product.source === 'store' ? product.seller : 'Referencia ALIUM';
    return (!query || haystack.includes(query))
      && (!brand || product.brand === brand)
      && (!seller || sellerName === seller)
      && (!onlyCompatible || compatibility(product).state !== 'bad');
  }).sort((a, b) => productPriceUsd(a) - productPriceUsd(b));

  $('catalog-count').textContent = `${list.length} ${list.length === 1 ? 'componente' : 'componentes'} · ${storeProducts.length ? 'catálogo de tiendas y referencias' : 'precios de referencia'}`;
  $('catalog-empty').hidden = list.length > 0;
  $('catalog-items').innerHTML = list.map((product) => {
    const compat = compatibility(product);
    const selected = chosen[product.category] && chosen[product.category].id === product.id;
    const status = compat.state === 'ok' ? 'Compatible' : compat.state === 'bad' ? 'Incompatible' : 'Pendiente';
    const url = safeProductUrl(product.itemUrl);
    const image = safeProductUrl(product.imageUrl) || CATEGORY_IMAGES[product.category] || '';
    const media = image
      ? `<img class="product-photo" src="${escapeHTML(image)}" alt="Imagen de ${escapeHTML(product.name)}" loading="lazy">`
      : `<span class="product-mark">${escapeHTML(String(product.brand || 'AL').slice(0, 2).toUpperCase())}</span>`;
    const sellerName = product.source === 'store' ? product.seller : 'Referencia ALIUM';
    const sellerHtml = url
      ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(sellerName)}</a>`
      : escapeHTML(sellerName);
    const detailLink = url ? `<a class="supplier-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Ver en la tienda ↗</a>` : '';
    return `<article class="product-row ${selected ? 'product-selected' : ''}">
      <div class="product-info">${media}<div><b>${escapeHTML(product.name)}</b><small>${escapeHTML(product.spec || '')}</small>${product.source === 'store' ? '<small class="store-tag">Tienda verificada · precio del proveedor</small>' : '<small class="reference-tag">Precio de referencia</small>'}</div></div>
      <span class="product-brand">${escapeHTML(product.brand || '—')}</span>
      <b class="product-price">${productPriceLabel(product)}</b>
      <span class="compat-tag ${compat.state}" title="${escapeHTML(compat.text)}">${status}</span>
      <span class="supplier"><b>${sellerHtml}</b><small>${detailLink}</small></span>
      <button class="button small ${selected ? 'quiet' : 'primary'}" type="button" data-select-product="${escapeHTML(product.id)}">${selected ? 'Elegida ✓' : 'Elegir'}</button>
    </article>`;
  }).join('');
}

async function loadStoreProducts() {
  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    storeProducts = (Array.isArray(data.products) ? data.products : []).map((product) => ({
      ...product,
      id: product.id || `store-${product.dbId}`,
      seller: product.seller || 'Tienda ALIUM',
      source: 'store',
    }));
    if (!$('results').hidden) renderCatalog();
  } catch { /* el catálogo de referencia sigue disponible */ }
}

/* ---------------------------- Selección automática ---------------------------- */

function compatibleCheapest(category, predicate) {
  return PRODUCTS
    .filter((product) => product.category === category && (!predicate || predicate(product)))
    .sort((a, b) => a.price - b.price)
    .find((product) => compatibility(product).state !== 'bad') || null;
}

function buildAtTier(targetTier, integratedOnly) {
  chosen = {};
  const cpuCandidates = PRODUCTS
    .filter((product) => product.category === 'cpu' && product.platform === state.cpu && (!integratedOnly || product.igpu))
    .sort((a, b) => Math.abs(a.tier - targetTier) - Math.abs(b.tier - targetTier) || a.price - b.price);
  chosen.cpu = cpuCandidates[0];
  const choose = (category, predicate) => {
    const products = PRODUCTS
      .filter((product) => product.category === category && (!predicate || predicate(product)))
      .sort((a, b) => Math.abs((a.tier || 1) - targetTier) - Math.abs((b.tier || 1) - targetTier) || a.price - b.price);
    chosen[category] = products.find((product) => compatibility(product).state !== 'bad') || null;
  };
  choose('motherboard');
  choose('cooler');
  choose('memory');
  choose('storage');
  choose('gpu', (product) => (integratedOnly ? product.integrated : !product.integrated));
  choose('case');
  choose('psu');
}

function makeBuild() {
  const target = state.tier === 'Alta' ? 3 : state.tier === 'Media' ? 2 : 1;
  buildAtTier(target, state.budgetUsd < 650);
  let sum = REQUIRED.reduce((total, key) => total + (chosen[key] ? productPriceUsd(chosen[key]) : 0), 0);
  if (sum > state.budgetUsd) {
    buildAtTier(1, true);
    sum = REQUIRED.reduce((total, key) => total + (chosen[key] ? productPriceUsd(chosen[key]) : 0), 0);
  }
  $('budget-warning').hidden = sum <= state.budgetUsd;
  $('budget-warning').textContent = sum > state.budgetUsd
    ? 'La configuración básica de referencia supera tu presupuesto. Cambia piezas o aumenta el monto para ajustarla.'
    : '';
  renderResults();
}

function startSelection() {
  if (state.mode === 'manual') {
    chosen = {};
    activeCategory = 'cpu';
    $('budget-warning').hidden = true;
    renderResults();
  } else {
    makeBuild();
  }
}

function renderResults() {
  const manual = state.mode === 'manual';
  $('result-title').textContent = manual ? 'Tu PC para personalizar' : 'Tu propuesta inicial';
  $('result-subtitle').textContent = `${state.cpu || '—'} · ${state.tier || '—'} · ${state.use || '—'} · Presupuesto: ${formatMoney(state.budgetUsd || 0)}`;
  renderSelected();
  renderCategories();
  renderCatalog();
  renderOrderSummary();
}

/* ---------------------------- Pedido ---------------------------- */

function renderOrderSummary() {
  const panel = $('order-panel');
  if (!panel) return;
  const entries = CATEGORIES.filter((category) => chosen[category.id]);
  const subtotal = subtotalUsd();
  const fee = state.assembly === 'alium' ? assemblyFeeUsd() : 0;
  const total = subtotal + fee;
  const deposit = total * (DEPOSIT_PERCENT / 100);

  $('order-summary').innerHTML = entries.length
    ? entries.map((category) => {
      const product = chosen[category.id];
      return `<div class="order-line"><span><b>${category.name}</b><small>${escapeHTML(product.brand || '')} · ${escapeHTML(product.name)}</small></span><b>${productPriceLabel(product)}</b></div>`;
    }).join('')
    : '<p class="order-empty">Elige al menos una pieza para preparar tu pedido.</p>';

  $('order-subtotal').textContent = formatMoney(subtotal);
  $('order-assembly-fee').textContent = state.assembly === 'alium' ? `RD$ ${new Intl.NumberFormat('es-DO').format(ASSEMBLY_FEE_DOP)} (${formatMoney(fee)})` : 'No incluido';
  $('order-total').textContent = formatMoney(total);
  $('order-deposit').textContent = formatMoney(deposit);
  $('order-total-usd').textContent = usdText(total);
  $('order-deposit-usd').textContent = usdText(deposit);
  $('order-delivery-note').hidden = state.fulfillment !== 'entrega';
  $('order-address-field').hidden = state.fulfillment !== 'entrega';
  $('order-assembly-note').hidden = state.assembly !== 'alium';

  document.querySelectorAll('.order-choice[data-group="assembly"]').forEach((button) => {
    button.classList.toggle('selected', state.assembly === button.dataset.value);
    button.setAttribute('aria-pressed', String(state.assembly === button.dataset.value));
  });
  document.querySelectorAll('.order-choice[data-group="fulfillment"]').forEach((button) => {
    button.classList.toggle('selected', state.fulfillment === button.dataset.value);
    button.setAttribute('aria-pressed', String(state.fulfillment === button.dataset.value));
  });
}

function resetOrderAfterChange() {
  if (!state.orderSent) return;
  state.orderSent = false;
  $('order-success').hidden = true;
  $('order-form').hidden = false;
  const submit = $('send-order');
  submit.disabled = false;
  submit.textContent = 'Guardar pedido y abrir WhatsApp';
}

function buildOrderPayload() {
  const parts = CATEGORIES.filter((category) => chosen[category.id]).map((category) => {
    const product = chosen[category.id];
    return {
      ...product,
      category: category.id,
      price: Math.round(productPriceUsd(product) * 100) / 100,
      currency: 'USD',
      sourcePrice: Number(product.price) || 0,
      sourceCurrency: String(product.currency || 'USD').toUpperCase(),
    };
  });
  const subtotal = Math.round(parts.reduce((sum, part) => sum + (Number(part.price) || 0), 0) * 100) / 100;
  const assemblyFee = state.assembly === 'alium' ? Math.round(assemblyFeeUsd() * 100) / 100 : 0;
  return {
    customerName: $('order-name').value.trim(),
    customerContact: $('order-contact').value.trim(),
    customerEmail: $('order-email').value.trim(),
    platform: state.cpu || null,
    use: state.use || null,
    tier: state.tier || null,
    budget: state.budgetUsd || null,
    assembly: state.assembly,
    assemblyFee,
    total: Math.round((subtotal + assemblyFee) * 100) / 100,
    fulfillment: state.fulfillment,
    address: state.fulfillment === 'entrega' ? $('order-address').value.trim() : '',
    notes: $('order-notes').value.trim(),
    parts,
  };
}

function orderMessage(order) {
  const lines = [];
  lines.push('Hola ALIUM. Quiero solicitar esta PC.');
  lines.push('');
  lines.push(`Código: ${order.code}`);
  lines.push(`Nombre: ${order.customerName}`);
  lines.push(`Contacto: ${order.customerContact}`);
  if (order.customerEmail) lines.push(`Correo: ${order.customerEmail}`);
  lines.push('');
  lines.push(`USO: ${order.use || 'Por definir'} · Gama: ${order.tier || 'Por definir'} · Presupuesto: ${order.budget ? usdText(order.budget) : 'Por definir'}`);
  lines.push(`PLATAFORMA: ${order.platform || 'Por definir'}`);
  lines.push('');
  lines.push('PIEZAS (precios de referencia):');
  for (const part of order.parts) {
    const category = CATEGORIES.find((item) => item.id === part.category);
    const sourcePrice = Number(part.sourcePrice);
    const sourceCurrency = String(part.sourceCurrency || 'USD').toUpperCase();
    const shown = sourcePrice > 0
      ? (sourceCurrency === 'DOP' ? `RD$ ${new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(sourcePrice)}` : usdText(sourcePrice))
      : (part.price > 0 ? usdText(part.price) : 'Incluido');
    lines.push(`• ${category ? category.name : part.category}: ${part.brand || ''} ${part.name} — ${shown}`);
  }
  lines.push('');
  lines.push(`Subtotal piezas: ${usdText(order.subtotal)} (≈ ${dopText(order.subtotal)})`);
  const fee = Number(order.assemblyFee) || (order.assembly === 'alium' ? assemblyFeeUsd() : 0);
  if (order.assembly === 'alium') lines.push(`Armado por ALIUM: RD$ ${new Intl.NumberFormat('es-DO').format(ASSEMBLY_FEE_DOP)} (≈ ${usdText(fee)})`);
  else lines.push('Armado: yo armo la PC');
  const total = Number(order.total) || Number(order.subtotal) + fee;
  lines.push(`Total de referencia: ${usdText(total)} (≈ ${dopText(total)})`);
  lines.push(`Anticipo ${DEPOSIT_PERCENT}%: ${usdText(total * (DEPOSIT_PERCENT / 100))} (≈ ${dopText(total * (DEPOSIT_PERCENT / 100))})`);
  lines.push('');
  lines.push(`ENTREGA: ${order.fulfillment === 'entrega' ? `Domicilio — ${order.address}` : 'Retiro en punto acordado'}`);
  if (order.fulfillment === 'entrega') lines.push('(El costo de entrega se confirma según la zona.)');
  lines.push(`ARMADO: ${order.assembly === 'alium' ? 'ALIUM arma la PC' : 'El cliente arma la PC'}`);
  if (order.notes) {
    lines.push('');
    lines.push(`NOTAS: ${order.notes}`);
  }
  lines.push('');
  lines.push(`Acepto la política de garantía y el anticipo del ${DEPOSIT_PERCENT}%:`);
  lines.push(`${SITE_URL}/garantia.html`);
  lines.push('');
  lines.push(`Seguimiento del pedido: ${SITE_URL}/pedido.html?code=${encodeURIComponent(order.code)}`);
  lines.push('');
  lines.push('Quedo pendiente de la confirmación de disponibilidad, precio final y fecha estimada.');
  return lines.join('\n');
}

function whatsappUrl(message) {
  const text = encodeURIComponent(message);
  if (WHATSAPP_NUMBER) return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}

function showOrderStatus(message, isError) {
  const output = $('order-status');
  output.textContent = message;
  output.classList.toggle('error', Boolean(isError));
}

async function sendOrder(event) {
  event.preventDefault();
  if (state.orderSent) return;
  const button = $('send-order');
  const parts = CATEGORIES.filter((category) => chosen[category.id]);
  if (!parts.length) return showOrderStatus('Elige al menos una pieza antes de enviar tu pedido.', true);
  if (!$('order-name').value.trim() || $('order-name').value.trim().length < 2) return showOrderStatus('Escribe tu nombre.', true);
  if (!$('order-contact').value.trim() || $('order-contact').value.trim().length < 5) return showOrderStatus('Escribe un WhatsApp o correo para contactarte.', true);
  if (!state.assembly) return showOrderStatus('Elige si quieres que ALIUM arme la PC o si la armas tú.', true);
  if (!state.fulfillment) return showOrderStatus('Elige entre entrega a domicilio o retiro.', true);
  if (state.fulfillment === 'entrega' && $('order-address').value.trim().length < 5) return showOrderStatus('Escribe la dirección de entrega.', true);
  if (!$('order-accept').checked) return showOrderStatus('Debes aceptar la política de garantía y el anticipo del 50%.', true);

  button.disabled = true;
  button.textContent = 'Guardando tu pedido…';
  showOrderStatus('Guardando la selección y preparando WhatsApp…', false);

  const waWindow = window.open('about:blank', '_blank');
  if (waWindow) {
    try {
      waWindow.document.write('<!doctype html><title>ALIUM</title><body style="font-family:system-ui;background:#0a0911;color:#f7f5fb;padding:40px">Guardando tu pedido y abriendo WhatsApp…</body>');
    } catch { /* ventana bloqueada parcialmente */ }
  }

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOrderPayload()),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el pedido.');
    const order = data.order;
    const message = orderMessage(order);
    const url = whatsappUrl(message);
    lastWhatsAppUrl = url;
    state.orderSent = true;
    if (waWindow) waWindow.location.replace(url);
    $('order-form').hidden = true;
    $('order-success').hidden = false;
    $('order-code').textContent = order.code;
    $('order-track-link').href = `pedido.html?code=${encodeURIComponent(order.code)}`;
    $('order-whatsapp-link').href = url;
    $('order-whatsapp-copy').textContent = waWindow ? 'Abrir WhatsApp otra vez' : 'Abrir WhatsApp';
    $('order-success-text').textContent = waWindow
      ? 'Guardamos tu pedido. WhatsApp se abrió en otra pestaña con el mensaje listo: solo pulsa enviar.'
      : 'Guardamos tu pedido. Tu navegador bloqueó la pestaña nueva: pulsa el botón para abrir WhatsApp.';
    showOrderStatus('', false);
    $('order-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    if (waWindow) {
      try { waWindow.close(); } catch { /* ya cerrada */ }
    }
    showOrderStatus(error.message || 'No se pudo guardar el pedido. Intenta otra vez.', true);
    button.disabled = false;
    button.textContent = 'Guardar pedido y abrir WhatsApp';
  }
}

/* ---------------------------- Guardar en la cuenta ---------------------------- */

function buildParts() {
  return CATEGORIES.filter((category) => chosen[category.id]).map((category) => {
    const product = chosen[category.id];
    return {
      ...product,
      category: category.id,
      price: Math.round(productPriceUsd(product) * 100) / 100,
      currency: 'USD',
      sourcePrice: Number(product.price) || 0,
      sourceCurrency: String(product.currency || 'USD').toUpperCase(),
    };
  });
}

function showToast(message, isError) {
  const element = $('alium-toast');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', Boolean(isError));
  element.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => element.classList.remove('show'), 4500);
}

function updateAccountUI() {
  const button = $('login-open');
  const label = button ? button.querySelector('span') : null;
  if (currentUser) {
    if (label) label.textContent = (currentUser.name || 'Mi cuenta').split(' ')[0].slice(0, 16);
    if (button) { button.title = 'Mi cuenta'; button.setAttribute('aria-label', 'Mi cuenta de ALIUM'); }
    if (!$('order-name').value) $('order-name').value = currentUser.name || '';
    if (!$('order-email').value) $('order-email').value = currentUser.email || '';
  } else {
    if (label) label.textContent = 'Iniciar sesión';
    if (button) { button.title = 'Iniciar sesión'; button.setAttribute('aria-label', 'Iniciar sesión'); }
  }
}

async function loadAccount() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    currentUser = data.user || null;
  } catch { currentUser = null; }
  updateAccountUI();
}

function openSaveDialog() {
  const parts = buildParts();
  if (!parts.length) return alert('Primero elige al menos una pieza para guardar tu PC.');
  if (!currentUser) {
    pendingSave = true;
    $('login-dialog').showModal();
    return;
  }
  const total = parts.reduce((sum, part) => sum + (Number(part.price) || 0), 0);
  $('save-name').value = `Mi PC ${state.cpu} · ${new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}`;
  $('save-summary').textContent = `${parts.length} piezas · ${formatMoney(total)} · Se guardará una foto de esta configuración.`;
  $('save-message').textContent = '';
  $('save-dialog').showModal();
}

/* ---------------------------- Eventos ---------------------------- */

document.addEventListener('click', (event) => {
  const choice = event.target.closest('.choice[data-group]');
  if (choice) {
    state[choice.dataset.group] = choice.dataset.value;
    updateChoices();
    return;
  }

  const next = event.target.closest('.next');
  if (next) {
    if (step === 0 && !state.cpu) return alert('Elige AMD o Intel para continuar.');
    if (step === 1 && !state.use) return alert('Elige el uso principal de tu PC.');
    if (step === 2 && !state.tier) return alert('Elige una gama para continuar.');
    if (step === 3) {
      const amount = budgetNumber();
      const usd = state.currency === 'DOP' ? amount / exchangeRate : amount;
      if (!amount || usd < 300) return alert('Escribe un presupuesto equivalente a por lo menos $300 USD.');
      state.budget = amount;
      state.budgetUsd = usd;
    }
    showStep(step + 1);
    return;
  }

  if (event.target.closest('.back')) { showStep(step - 1); return; }

  if (event.target.id === 'show-results') {
    if (!state.mode) return alert('Elige cómo quieres seleccionar tus componentes.');
    startSelection();
    steps.forEach((element) => { element.hidden = true; });
    document.querySelector('.section-title').hidden = true;
    progress.style.width = '100%';
    $('results').hidden = false;
    $('order-panel').hidden = false;
    renderResults();
    document.querySelector('.builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const categoryButton = event.target.closest('[data-category]');
  if (categoryButton) {
    activeCategory = categoryButton.dataset.category;
    $('catalog-search').value = '';
    renderCategories();
    renderCatalog();
    return;
  }

  const add = event.target.closest('[data-select-product]');
  if (add) {
    const product = [...storeProducts, ...PRODUCTS].find((item) => item.id === add.dataset.selectProduct);
    if (!product) return;
    const status = compatibility(product);
    if (status.state === 'bad') { alert(`No se puede añadir: ${status.text}`); return; }
    chosen[product.category] = product;
    $('budget-warning').hidden = subtotalUsd() <= state.budgetUsd;
    resetOrderAfterChange();
    renderResults();
    return;
  }

  const remove = event.target.closest('[data-remove]');
  if (remove) {
    delete chosen[remove.dataset.remove];
    activeCategory = remove.dataset.remove;
    resetOrderAfterChange();
    renderResults();
    return;
  }

  if (event.target.closest('#go-order')) {
    $('order-panel').hidden = false;
    renderOrderSummary();
    $('order-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const orderChoice = event.target.closest('.order-choice[data-group]');
  if (orderChoice) {
    state[orderChoice.dataset.group] = orderChoice.dataset.value;
    if (orderChoice.dataset.group === 'fulfillment' && orderChoice.dataset.value === 'retiro') $('order-address').value = '';
    resetOrderAfterChange();
    renderOrderSummary();
    return;
  }

  if (event.target.id === 'assembly') { window.location.href = 'montaje.html'; return; }

  if (event.target.id === 'restart') {
    state.cpu = ''; state.use = ''; state.tier = ''; state.mode = '';
    state.budget = 0; state.budgetUsd = 0; state.assembly = ''; state.fulfillment = ''; state.orderSent = false;
    chosen = {};
    $('budget').value = '';
    $('results').hidden = true;
    $('order-panel').hidden = true;
    $('order-form').hidden = false;
    $('order-success').hidden = true;
    document.querySelector('.section-title').hidden = false;
    updateChoices();
    showStep(0);
    $('configurador').scrollIntoView({ behavior: 'smooth' });
  }
});

$('catalog-search').addEventListener('input', renderCatalog);
$('brand-filter').addEventListener('change', renderCatalog);
$('seller-filter').addEventListener('change', renderCatalog);
$('compatible-only').addEventListener('change', renderCatalog);
$('currency-select').addEventListener('change', (event) => applyCurrency(event.target.value, true));
$('theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('send-order').addEventListener('click', sendOrder);

const budgetField = $('budget');
if (budgetField) {
  budgetField.addEventListener('input', () => {
    const digits = budgetField.value.replace(/\D/g, '');
    if (!digits) { budgetField.value = ''; setBudgetField(0); return; }
    const formatted = new Intl.NumberFormat(state.currency === 'DOP' ? 'es-DO' : 'en-US', { maximumFractionDigits: 0 }).format(Number(digits));
    budgetField.value = formatted;
    const end = formatted.length;
    try { budgetField.setSelectionRange(end, end); } catch { /* sin selección */ }
    const helper = $('budget-helper');
    if (helper) {
      const symbol = state.currency === 'DOP' ? 'RD$' : '$';
      helper.textContent = `Monto disponible: ${symbol} ${formatted} ${state.currency} · se completa con separadores de miles.`;
    }
  });
}

$('login-open').addEventListener('click', () => {
  if (currentUser) window.location.href = 'cuenta.html';
  else $('login-dialog').showModal();
});
$('login-close').addEventListener('click', () => $('login-dialog').close());
$('save-close').addEventListener('click', () => $('save-dialog').close());
$('save-build').addEventListener('click', openSaveDialog);
$('save-build-top').addEventListener('click', openSaveDialog);

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const message = $('login-message');
  const button = $('login-submit');
  if (!email || !password) { message.textContent = 'Escribe tu correo y tu contraseña.'; return; }
  button.disabled = true;
  button.textContent = 'Entrando…';
  message.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
    currentUser = data.user;
    updateAccountUI();
    $('login-dialog').close();
    $('login-password').value = '';
    message.textContent = '';
    showToast('Sesión iniciada. Ya puedes guardar tus PCs.');
    if (pendingSave) { pendingSave = false; openSaveDialog(); }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Iniciar sesión';
  }
});

$('save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) { $('save-dialog').close(); $('login-dialog').showModal(); return; }
  const parts = buildParts();
  if (!parts.length) return;
  const name = $('save-name').value.trim();
  if (!name) { $('save-message').textContent = 'Ponle un nombre a tu PC.'; return; }
  const button = $('save-submit');
  button.disabled = true;
  button.textContent = 'Guardando…';
  $('save-message').textContent = '';
  try {
    const response = await fetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        platform: state.cpu || null,
        use: state.use || null,
        tier: state.tier || null,
        budget: state.budgetUsd || null,
        parts,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la PC.');
    $('save-dialog').close();
    showToast('PC guardada en tu cuenta.');
  } catch (error) {
    $('save-message').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar en mi cuenta';
  }
});

function restoreSavedBuild() {
  const raw = safeGet('alium_saved_build');
  if (!raw) return;
  try {
    const build = JSON.parse(raw);
    if (!build || !Array.isArray(build.parts) || !build.parts.length) throw new Error('vacío');
    safeSet('alium_saved_build', '');
    state.cpu = build.platform || '';
    state.use = build.use || '';
    state.tier = build.tier || '';
    state.budgetUsd = Number(build.budget) || 0;
    state.budget = state.currency === 'DOP' ? state.budgetUsd * exchangeRate : state.budgetUsd;
    if ($('budget')) setBudgetField(state.budget);
    chosen = {};
    build.parts.forEach((part) => { if (part && part.category) chosen[part.category] = part; });
    updateChoices();
    steps.forEach((element) => { element.hidden = true; });
    const title = document.querySelector('.section-title');
    if (title) title.hidden = true;
    progress.style.width = '100%';
    $('results').hidden = false;
    $('order-panel').hidden = false;
    renderResults();
    showToast('Cargamos tu PC guardada.');
    document.querySelector('.builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    safeSet('alium_saved_build', '');
  }
}

/* ---------------------------- Inicio ---------------------------- */

applyTheme(safeGet('alium_theme') || 'dark');
applyCurrency(safeGet('alium_currency') || 'USD', false);
showStep(0);
loadExchangeRate();
loadAccount();
restoreSavedBuild();
loadStoreProducts();

// Aviso visible mientras el WhatsApp configurado sea el número de prueba.
if (CONFIG.demoWhatsApp) {
  const demo = document.createElement('div');
  demo.className = 'order-demo';
  demo.innerHTML = '<b>Modo de prueba:</b> el WhatsApp configurado es un número de ejemplo. Cambia <code>public/assets/alium-config.js</code> por el número real de ALIUM.';
  const panel = $('order-panel');
  if (panel) panel.prepend(demo);
}
