const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname);
const staticRoot = path.join(root, 'public');
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Load local secrets without adding a dependency. Never serve .env as a static file.
function loadLocalEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
loadLocalEnv();

const DEFAULT_QUERIES = {
  cpu: 'desktop CPU processor', cooler: 'CPU cooler', motherboard: 'desktop PC motherboard',
  memory: 'desktop RAM memory', storage: 'NVMe SSD', gpu: 'graphics card GPU',
  case: 'desktop PC case', psu: 'PC power supply', os: 'Windows 11 license', monitor: 'gaming monitor',
};
const ALLOWED_CATEGORIES = new Set(Object.keys(DEFAULT_QUERIES));
const SESSION_DAYS = 30;
const SESSION_COOKIE = 'alium_session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let cachedEbayToken = null;

/* ------------------------------------------------------------------ */
/* Base de datos (Neon Postgres)                                       */
/* ------------------------------------------------------------------ */

let pool = null;
let dbSetupPromise = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS alium_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alium_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES alium_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS alium_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES alium_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text,
  use_case text,
  tier text,
  currency text NOT NULL DEFAULT 'USD',
  budget numeric(12,2),
  total numeric(12,2) NOT NULL DEFAULT 0,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alium_sessions_user_idx ON alium_sessions(user_id);
CREATE INDEX IF NOT EXISTS alium_sessions_expiry_idx ON alium_sessions(expires_at);
CREATE INDEX IF NOT EXISTS alium_builds_user_created_idx ON alium_builds(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS alium_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text,
  notify boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

function databaseUrl() {
  return process.env.DATABASE_URL || '';
}

function getPool() {
  if (!databaseUrl()) {
    const error = new Error('Las cuentas todavía no están configuradas en el servidor.');
    error.status = 503;
    throw error;
  }
  if (!pool) {
    const { Pool } = require('pg');
    let connectionString = databaseUrl();
    if (!/[?&]sslmode=/i.test(connectionString)) {
      let local = false;
      try {
        const host = new URL(connectionString).hostname;
        local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      } catch { /* pg mostrará el error de formato */ }
      if (!local) connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=require';
    }
    pool = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
      application_name: 'alium-web',
    });
    pool.on('error', (error) => console.error('[db] error de conexión:', error.message));
  }
  return pool;
}

async function ensureDb() {
  if (dbSetupPromise) return dbSetupPromise;
  dbSetupPromise = (async () => {
    const db = getPool();
    await db.query(SCHEMA);
    return db;
  })().catch((error) => {
    dbSetupPromise = null;
    throw error;
  });
  return dbSetupPromise;
}

async function dbQuery(text, params) {
  const db = await ensureDb();
  return db.query(text, params);
}

/* ------------------------------------------------------------------ */
/* Contraseñas y sesiones                                              */
/* ------------------------------------------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error); else resolve(derived);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  const derived = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

let dummyHash = null;
async function burnPasswordTime(password) {
  if (!dummyHash) dummyHash = await hashPassword('alium-tiempo-constante');
  await verifyPassword(password, dummyHash);
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sessionId(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function parseCookies(request) {
  const header = request.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function isSecureRequest(request) {
  return request.headers['x-forwarded-proto'] === 'https' || Boolean(request.socket.encrypted);
}

async function createSession(userId) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await dbQuery('INSERT INTO alium_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [sessionId(token), userId, expiresAt]);
  await dbQuery('DELETE FROM alium_sessions WHERE expires_at < now()').catch(() => {});
  return token;
}

function sessionCookie(request, token, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecureRequest(request) ? '; Secure' : ''}`;
}

function clearSessionCookie(request) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecureRequest(request) ? '; Secure' : ''}`;
}

async function getSession(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const result = await dbQuery(
    `SELECT u.id, u.email, u.display_name, u.created_at
       FROM alium_sessions s
       JOIN alium_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId(token)],
  );
  return result.rows[0] || null;
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Validación, límites y utilidades HTTP                               */
/* ------------------------------------------------------------------ */

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const rateBuckets = new Map();
function rateLimit(key, limit = 12, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
}, 10 * 60 * 1000).unref();

function clientIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket.remoteAddress || 'desconocido';
}

function readJson(request, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, 'La solicitud es demasiado grande.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('formato');
        resolve(parsed);
      } catch {
        reject(httpError(400, 'Los datos enviados no son válidos.'));
      }
    });
    request.on('error', () => reject(httpError(400, 'No se pudieron leer los datos enviados.')));
  });
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 1e9 ? Math.round(number * 100) / 100 : null;
}

const PART_TEXT_FIELDS = ['id', 'name', 'brand', 'spec', 'seller', 'currency', 'condition', 'itemUrl', 'imageUrl', 'platform', 'socket', 'memory', 'form'];
const PART_NUMBER_FIELDS = ['price', 'watts', 'tier', 'minPsu', 'length', 'clearance', 'shipping', 'radiator'];
const PART_BOOL_FIELDS = ['igpu', 'integrated', 'isLive'];
const PART_ARRAY_FIELDS = ['supports', 'forms'];

function sanitizePart(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const category = cleanText(raw.category, 30);
  if (!ALLOWED_CATEGORIES.has(category)) return null;
  const part = { category };
  for (const field of PART_TEXT_FIELDS) {
    if (typeof raw[field] === 'string') part[field] = raw[field].slice(0, field === 'itemUrl' || field === 'imageUrl' ? 1_000 : 300);
  }
  if (!part.name) return null;
  for (const field of PART_NUMBER_FIELDS) {
    if (raw[field] !== undefined && raw[field] !== null && raw[field] !== '') {
      const number = cleanNumber(raw[field]);
      if (number !== null) part[field] = number;
    }
  }
  for (const field of PART_BOOL_FIELDS) if (typeof raw[field] === 'boolean') part[field] = raw[field];
  for (const field of PART_ARRAY_FIELDS) {
    if (Array.isArray(raw[field])) {
      part[field] = raw[field].filter((item) => typeof item === 'string').map((item) => item.slice(0, 40)).slice(0, 12);
    }
  }
  if (part.itemUrl && !/^https:\/\//i.test(part.itemUrl)) delete part.itemUrl;
  if (part.imageUrl && !/^https:\/\//i.test(part.imageUrl)) delete part.imageUrl;
  if (part.currency && !/^[A-Z]{3}$/.test(part.currency)) delete part.currency;
  return part;
}

/* ------------------------------------------------------------------ */
/* eBay                                                               */
/* ------------------------------------------------------------------ */

function ebayApiRoot() {
  return process.env.EBAY_ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

async function getEbayAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw httpError(503, 'La búsqueda de eBay aún no está configurada en el servidor.');
  }
  if (cachedEbayToken && cachedEbayToken.expiresAt > Date.now() + 30_000) return cachedEbayToken.value;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${ebayApiRoot()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw httpError(502, 'eBay no aceptó las credenciales. Revisa que sean del mismo entorno (Sandbox o Producción).');
  }
  cachedEbayToken = { value: data.access_token, expiresAt: Date.now() + Math.max(60, data.expires_in - 60) * 1000 };
  return cachedEbayToken.value;
}

async function searchEbay(url) {
  const category = url.searchParams.get('category') || 'cpu';
  if (!ALLOWED_CATEGORIES.has(category)) throw httpError(400, 'La categoría solicitada no es válida.');
  const typedQuery = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const platform = (url.searchParams.get('platform') || '').trim();
  let q = typedQuery || DEFAULT_QUERIES[category];
  if (category === 'cpu' && platform && !q.toLowerCase().includes(platform.toLowerCase())) q = `${platform} ${q}`;
  const query = new URLSearchParams({ q, limit: '24' });
  const apiRoot = ebayApiRoot();
  const token = await getEbayAccessToken();
  const response = await fetch(`${apiRoot}/buy/browse/v1/item_summary/search?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
      'Accept-Language': 'en-US',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(502, data.errors?.[0]?.message || `eBay respondió con estado ${response.status}.`);
  }
  const items = (data.itemSummaries || []).map((item) => ({
    id: item.itemId,
    title: item.title || 'Producto de eBay',
    image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
    price: Number(item.price?.value),
    currency: item.price?.currency || 'USD',
    seller: item.seller?.username || 'Vendedor de eBay',
    condition: item.condition || item.conditionId || 'Condición no indicada',
    shipping: item.shippingOptions?.[0]?.shippingCost?.value ?? null,
    shippingCurrency: item.shippingOptions?.[0]?.shippingCost?.currency || item.price?.currency || 'USD',
    url: item.itemAffiliateWebUrl || item.itemWebUrl || '',
    platform,
  })).filter((item) => Number.isFinite(item.price));

  return {
    provider: 'eBay', marketplace: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
    query: q, total: data.total || items.length, items,
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Rutas de la API                                                    */
/* ------------------------------------------------------------------ */

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) return { sent: false, reason: 'email_not_configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`No se pudo enviar el correo (Resend ${response.status}). ${detail.slice(0, 200)}`);
  }
  return { sent: true };
}

function welcomeEmail(name) {
  const safeName = escapeHtml(name || 'gracias');
  const site = process.env.PUBLIC_SITE_URL || 'https://alium.netlify.app';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#0b0912;color:#f6f2ff;padding:32px">
      <h1 style="margin:0 0 12px;font-size:24px">Tu cuenta de ALIUM está lista</h1>
      <p>Hola ${safeName}, ya puedes guardar tus configuraciones y volver a ellas cuando quieras.</p>
      <p><a href="${site}/cuenta.html" style="display:inline-block;background:#8a3cf0;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Abrir mi cuenta</a></p>
      <p style="color:#a9a2b8;font-size:13px">Te avisaremos aquí solo cuando haya novedades importantes, ofertas o mantenimiento. Puedes darte de baja respondiendo a este correo.</p>
    </div>`;
  return { subject: 'Tu cuenta de ALIUM está lista', html, text: `Hola ${name || ''}, tu cuenta de ALIUM está lista. Entra en ${site}/cuenta.html` };
}

function adminAuthorized(request) {
  const expected = process.env.ADMIN_TOKEN || '';
  if (!expected) return false;
  const header = String(request.headers.authorization || '');
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : String(request.headers['x-admin-token'] || '');
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function handleApi(request, response, url) {
  const method = request.method;
  const pathname = url.pathname;

  if (pathname === '/api/providers/status') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    return json(response, 200, {
      ebay: { configured: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) },
      amazon: { available: false, reason: 'Amazon Creators API requiere cuenta de Afiliados y aprobación expresa para mostrar su contenido en una app móvil y junto a otros comercios.' },
      accounts: { configured: Boolean(databaseUrl()), provider: 'Neon Postgres' },
      email: { configured: emailConfigured(), provider: 'Resend' },
    });
  }

  if (pathname === '/api/providers/ebay/search') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    return json(response, 200, await searchEbay(url));
  }

  if (pathname === '/api/subscribe') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Los avisos todavía no están configurados. Falta DATABASE_URL en el servidor.' });
    if (!rateLimit(`subscribe:${clientIp(request)}`, 10)) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request);
    const email = cleanText(body.email, 254).toLowerCase();
    const source = cleanText(body.source, 40) || 'web';
    if (!EMAIL_RE.test(email)) return json(response, 400, { error: 'Escribe un correo electrónico válido.' });
    await dbQuery(
      `INSERT INTO alium_subscribers (email, source) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET notify = true, source = COALESCE(alium_subscribers.source, EXCLUDED.source)`,
      [email, source],
    );
    return json(response, 201, { ok: true, message: 'Te avisaremos de novedades, ofertas y mantenimiento.' });
  }

  if (pathname === '/api/admin/subscribers') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!adminAuthorized(request)) return json(response, 401, { error: 'No autorizado.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    const result = await dbQuery('SELECT email, source, created_at FROM alium_subscribers WHERE notify = true ORDER BY created_at DESC LIMIT 5000');
    return json(response, 200, {
      count: result.rows.length,
      emails: result.rows.map((row) => ({ email: row.email, source: row.source, createdAt: row.created_at })),
    });
  }

  if (pathname === '/api/admin/notify') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!adminAuthorized(request)) return json(response, 401, { error: 'No autorizado.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!emailConfigured()) return json(response, 501, { error: 'Configura RESEND_API_KEY y EMAIL_FROM para enviar avisos por correo.' });
    const body = await readJson(request);
    const subject = cleanText(body.subject, 120);
    const message = cleanText(body.message, 4000);
    if (!subject || !message) return json(response, 400, { error: 'Escribe el asunto y el mensaje.' });
    const result = await dbQuery('SELECT email FROM alium_subscribers WHERE notify = true LIMIT 500');
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#201b2b;line-height:1.6"><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p style="color:#777183;font-size:12px">Recibes este aviso porque te suscribiste en ALIUM.</p></div>`;
    let sent = 0;
    const failed = [];
    for (const row of result.rows) {
      try {
        await sendEmail({ to: row.email, subject, html, text: message });
        sent += 1;
      } catch (error) {
        failed.push({ email: row.email, error: error.message });
      }
    }
    return json(response, 200, { sent, failed: failed.length, errors: failed.slice(0, 5) });
  }

  if (pathname === '/api/auth/me') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 200, { user: null, accounts: { configured: false } });
    const user = await getSession(request);
    return json(response, 200, { user: user ? publicUser(user) : null, accounts: { configured: true } });
  }

  if (pathname === '/api/auth/register') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Las cuentas todavía no están configuradas. Falta DATABASE_URL en el servidor.' });
    if (!rateLimit(`register:${clientIp(request)}`, 8)) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });

    const body = await readJson(request);
    const name = cleanText(body.name, 60);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    if (name.length < 2) return json(response, 400, { error: 'Escribe tu nombre (al menos 2 caracteres).' });
    if (!EMAIL_RE.test(email)) return json(response, 400, { error: 'Escribe un correo electrónico válido.' });
    if (password.length < 8) return json(response, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
    if (password.length > 200) return json(response, 400, { error: 'La contraseña es demasiado larga.' });

    const passwordHash = await hashPassword(password);
    let row;
    try {
      const result = await dbQuery(
        `INSERT INTO alium_users (email, display_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, created_at`,
        [email, name, passwordHash],
      );
      row = result.rows[0];
    } catch (error) {
      if (error.code === '23505') return json(response, 409, { error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
      throw error;
    }

    const token = await createSession(row.id);
    if (body.newsletter !== false) {
      try {
        await dbQuery('INSERT INTO alium_subscribers (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [email, 'registro']);
        if (emailConfigured()) await sendEmail({ to: email, ...welcomeEmail(name) });
      } catch (error) {
        console.error('[email] no se pudo registrar el aviso de bienvenida:', error.message);
      }
    }
    return json(response, 201, { user: publicUser(row) }, { 'Set-Cookie': sessionCookie(request, token) });
  }

  if (pathname === '/api/auth/login') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Las cuentas todavía no están configuradas. Falta DATABASE_URL en el servidor.' });
    if (!rateLimit(`login:${clientIp(request)}`, 12)) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });

    const body = await readJson(request);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL_RE.test(email) || !password) return json(response, 401, { error: 'Correo o contraseña incorrectos.' });

    const result = await dbQuery('SELECT id, email, display_name, password_hash, created_at FROM alium_users WHERE email = $1', [email]);
    const row = result.rows[0];
    if (!row) {
      await burnPasswordTime(password);
      return json(response, 401, { error: 'Correo o contraseña incorrectos.' });
    }
    if (!(await verifyPassword(password, row.password_hash))) {
      return json(response, 401, { error: 'Correo o contraseña incorrectos.' });
    }

    const token = await createSession(row.id);
    return json(response, 200, { user: publicUser(row) }, { 'Set-Cookie': sessionCookie(request, token) });
  }

  if (pathname === '/api/auth/logout') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token && databaseUrl()) await dbQuery('DELETE FROM alium_sessions WHERE id = $1', [sessionId(token)]);
    return json(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(request) });
  }

  if (pathname === '/api/auth/account') {
    if (method !== 'DELETE') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Las cuentas todavía no están configuradas.' });
    if (!rateLimit(`delete:${clientIp(request)}`, 6)) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });

    const user = await getSession(request);
    if (!user) return json(response, 401, { error: 'Tu sesión terminó. Vuelve a iniciar sesión.' });
    const body = await readJson(request);
    const password = typeof body.password === 'string' ? body.password : '';
    const result = await dbQuery('SELECT password_hash FROM alium_users WHERE id = $1', [user.id]);
    if (!result.rows[0] || !(await verifyPassword(password, result.rows[0].password_hash))) {
      return json(response, 403, { error: 'La contraseña no es correcta.' });
    }
    await dbQuery('DELETE FROM alium_users WHERE id = $1', [user.id]);
    await dbQuery('DELETE FROM alium_subscribers WHERE email = $1', [user.email]).catch(() => {});
    return json(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(request) });
  }

  if (pathname === '/api/builds') {
    if (!databaseUrl()) return json(response, 503, { error: 'Las cuentas todavía no están configuradas. Falta DATABASE_URL en el servidor.' });
    const user = await getSession(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión para guardar o ver tus PCs.' });

    if (method === 'GET') {
      const result = await dbQuery(
        `SELECT id, name, platform, use_case, tier, currency, budget, total, parts, created_at
           FROM alium_builds WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [user.id],
      );
      const builds = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        platform: row.platform,
        use: row.use_case,
        tier: row.tier,
        currency: row.currency,
        budget: row.budget === null ? null : Number(row.budget),
        total: Number(row.total),
        parts: row.parts,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      }));
      return json(response, 200, { builds });
    }

    if (method === 'POST') {
      if (!rateLimit(`save:${user.id}`, 60, 60 * 60 * 1000)) return json(response, 429, { error: 'Has guardado muchas PCs en poco tiempo. Intenta más tarde.' });
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
      const body = await readJson(request, 128 * 1024);
      const name = cleanText(body.name, 80) || 'Mi PC ALIUM';
      const rawParts = Array.isArray(body.parts) ? body.parts : [];
      const parts = rawParts.map(sanitizePart).filter(Boolean).slice(0, 20);
      if (!parts.length) return json(response, 400, { error: 'La PC no tiene piezas para guardar.' });
      const platform = ['AMD', 'Intel'].includes(body.platform) ? body.platform : null;
      const use = cleanText(body.use, 40) || null;
      const tier = cleanText(body.tier, 20) || null;
      const budget = cleanNumber(body.budget);
      const total = Math.round(parts.reduce((sum, part) => sum + (Number(part.price) || 0), 0) * 100) / 100;

      const result = await dbQuery(
        `INSERT INTO alium_builds (user_id, name, platform, use_case, tier, currency, budget, total, parts)
         VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, $8::jsonb)
         RETURNING id, name, platform, use_case, tier, currency, budget, total, parts, created_at`,
        [user.id, name, platform, use, tier, budget, total, JSON.stringify(parts)],
      );
      const row = result.rows[0];
      return json(response, 201, {
        build: {
          id: row.id, name: row.name, platform: row.platform, use: row.use_case, tier: row.tier,
          currency: row.currency, budget: row.budget === null ? null : Number(row.budget),
          total: Number(row.total), parts: row.parts,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        },
      });
    }

    return json(response, 405, { error: 'Método no permitido.' });
  }

  const buildMatch = pathname.match(/^\/api\/builds\/([0-9a-f-]{36})$/i);
  if (buildMatch) {
    if (method !== 'DELETE') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Las cuentas todavía no están configuradas.' });
    const user = await getSession(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión para eliminar una PC.' });
    const result = await dbQuery('DELETE FROM alium_builds WHERE id = $1 AND user_id = $2 RETURNING id', [buildMatch[1], user.id]);
    if (!result.rowCount) return json(response, 404, { error: 'No encontramos esa PC en tu cuenta.' });
    return json(response, 200, { ok: true });
  }

  return json(response, 404, { error: 'Endpoint API no encontrado.' });
}

/* ------------------------------------------------------------------ */
/* Servidor                                                           */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (request, response) => {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    json(response, 400, { error: 'Solicitud inválida.' });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(request, response, url);
    } catch (error) {
      if (!error.status) console.error('[api]', error);
      if (!response.headersSent) json(response, error.status || 502, { error: error.message || 'No se pudo completar la solicitud.' });
      else response.end();
    }
    return;
  }

  if (url.pathname === '/health') {
    return json(response, 200, { ok: true, accounts: Boolean(databaseUrl()) });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Método no permitido');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Solicitud inválida');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname.split('/').some((segment) => segment.startsWith('.')) || pathname.toLowerCase().includes('node_modules')) {
    response.writeHead(403).end('Prohibido');
    return;
  }

  const file = path.resolve(staticRoot, `.${pathname}`);
  if (file !== staticRoot && !file.startsWith(staticRoot + path.sep)) {
    response.writeHead(403).end('Prohibido');
    return;
  }
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end('No encontrado');
      return;
    }
    const extension = path.extname(file).toLowerCase();
    response.writeHead(200, {
      'Content-Type': mime[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(file).pipe(response);
  });
});

module.exports = { server, handleApi };

if (require.main === module) {
  const port = Number(process.env.PORT) || 4174;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    console.log('ALIUM local: http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + port);
    if (!databaseUrl()) {
      console.log('[db] DATABASE_URL no está definido: las cuentas quedan desactivadas hasta configurarlo.');
      return;
    }
    ensureDb()
      .then(() => console.log('[db] esquema de cuentas listo.'))
      .catch((error) => console.error('[db] no se pudo preparar el esquema:', error.message));
  });
}
