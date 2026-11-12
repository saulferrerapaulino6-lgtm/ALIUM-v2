const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');

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

const CATEGORY_IDS = ['cpu', 'cooler', 'motherboard', 'memory', 'storage', 'gpu', 'case', 'psu', 'os', 'monitor'];
const ALLOWED_CATEGORIES = new Set(CATEGORY_IDS);
const SESSION_DAYS = 30;
const SESSION_COOKIE = 'alium_session';
const ADMIN_COOKIE = 'alium_admin';
const ADMIN_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ORDER_STATUSES = ['nuevo', 'contactado', 'cotizado', 'confirmado', 'comprando', 'en_transito', 'armando', 'listo', 'entregado', 'cancelado'];
const SUPPLIER_STATUSES = ['nuevo', 'contactado', 'aprobado', 'rechazado'];
const DEPOSIT_PERCENT = 50;

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
CREATE TABLE IF NOT EXISTS alium_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alium_admin_sessions (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS alium_admin_sessions_expiry_idx ON alium_admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS alium_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  website text,
  city text,
  categories text,
  message text,
  status text NOT NULL DEFAULT 'nuevo',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alium_suppliers_created_idx ON alium_suppliers(created_at DESC);
CREATE INDEX IF NOT EXISTS alium_suppliers_status_idx ON alium_suppliers(status);

CREATE TABLE IF NOT EXISTS alium_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES alium_suppliers(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  brand text,
  model text,
  spec text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  image_url text,
  product_url text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alium_products_supplier_idx ON alium_products(supplier_id);
CREATE INDEX IF NOT EXISTS alium_products_category_idx ON alium_products(category) WHERE active = true;

CREATE TABLE IF NOT EXISTS alium_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid REFERENCES alium_users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_contact text NOT NULL,
  customer_email text,
  platform text,
  use_case text,
  tier text,
  currency text NOT NULL DEFAULT 'USD',
  budget numeric(12,2),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  assembly_fee numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  assembly text NOT NULL DEFAULT 'cliente',
  fulfillment text NOT NULL DEFAULT 'retiro',
  address text,
  notes text,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  deposit_percent integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'nuevo',
  estimated_date date,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alium_orders_created_idx ON alium_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS alium_orders_status_idx ON alium_orders(status);
CREATE INDEX IF NOT EXISTS alium_orders_user_idx ON alium_orders(user_id);
ALTER TABLE alium_orders ADD COLUMN IF NOT EXISTS assembly_fee numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE alium_orders ADD COLUMN IF NOT EXISTS total numeric(12,2) NOT NULL DEFAULT 0;
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

const PART_TEXT_FIELDS = ['id', 'name', 'brand', 'spec', 'seller', 'currency', 'sourceCurrency', 'condition', 'itemUrl', 'imageUrl', 'platform', 'socket', 'memory', 'form'];
const PART_NUMBER_FIELDS = ['price', 'sourcePrice', 'watts', 'tier', 'minPsu', 'length', 'clearance', 'shipping', 'radiator'];
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
/* Tiendas, productos y pedidos                                       */
/* ------------------------------------------------------------------ */

function orderCode() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  return `AL-${stamp}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function sanitizeAttributes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const strings = ['socket', 'memory', 'form', 'condition'];
  const numbers = ['watts', 'minPsu', 'length', 'clearance', 'radiator', 'tier'];
  const booleans = ['igpu', 'integrated'];
  const arrays = ['supports', 'forms'];
  for (const field of strings) {
    if (typeof raw[field] === 'string' && raw[field].trim()) out[field] = cleanText(raw[field], 40);
  }
  for (const field of numbers) {
    if (raw[field] !== undefined && raw[field] !== null && raw[field] !== '') {
      const number = cleanNumber(raw[field]);
      if (number !== null) out[field] = number;
    }
  }
  for (const field of booleans) if (typeof raw[field] === 'boolean') out[field] = raw[field];
  for (const field of arrays) {
    if (Array.isArray(raw[field])) {
      out[field] = raw[field].filter((item) => typeof item === 'string' && item.trim()).map((item) => cleanText(item, 40)).slice(0, 12);
    }
  }
  return out;
}

function productFromRow(row) {
  const attributes = row.attributes && typeof row.attributes === 'object' ? row.attributes : {};
  return {
    id: `db:${row.id}`,
    dbId: row.id,
    category: row.category,
    name: row.name,
    brand: row.brand || '',
    model: row.model || '',
    spec: row.spec || '',
    price: Number(row.price) || 0,
    currency: row.currency || 'USD',
    imageUrl: row.image_url || '',
    itemUrl: row.product_url || '',
    seller: row.supplier_name || 'Tienda ALIUM',
    supplierId: row.supplier_id || null,
    source: 'store',
    active: row.active,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    ...attributes,
  };
}

function isPrivateAddress(address) {
  if (!net.isIP(address)) return true;
  if (address === '::1' || address === '0.0.0.0') return true;
  if (address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7));
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

async function assertPublicUrl(value) {
  const raw = validHttpUrl(value);
  if (!raw) throw httpError(400, 'La dirección debe empezar por https:// y ser válida.');
  const url = new URL(raw);
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw httpError(400, 'Esa dirección no está permitida.');
  let records;
  try {
    records = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw httpError(400, 'No se pudo resolver el dominio de la tienda.');
  }
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw httpError(400, 'Esa dirección no está permitida.');
  }
  return url.href;
}

function metaContent(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return cleanText(match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), 500);
  }
  return '';
}

async function importProductFromUrl(rawUrl) {
  const url = await assertPublicUrl(rawUrl);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ALIUM-CatalogBot/1.0 (+https://alium-pc-builder.netlify.app)', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw httpError(502, `La tienda respondió con estado ${response.status}.`);
  const type = String(response.headers.get('content-type') || '');
  if (!type.includes('text/html') && !type.includes('application/xhtml')) throw httpError(415, 'La dirección no devolvió una página HTML.');
  const html = (await response.text()).slice(0, 800_000);
  const title = metaContent(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<title[^>]*>([^<]+)<\/title>/i]);
  const image = metaContent(html, [/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i]);
  const description = metaContent(html, [/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i]);
  const price = metaContent(html, [/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i, /"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i]);
  const currency = metaContent(html, [/<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([^"']+)["']/i, /"priceCurrency"\s*:\s*"([A-Z]{3})"/i]);
  const brand = metaContent(html, [/<meta[^>]+property=["']product:brand["'][^>]+content=["']([^"']+)["']/i, /"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i]);
  return {
    url,
    name: title.slice(0, 160),
    brand: brand.slice(0, 60),
    spec: description.slice(0, 300),
    imageUrl: image ? validHttpUrl(image) : '',
    price: cleanNumber(String(price).replace(',', '.')) || 0,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
  };
}

function orderFromRow(row) {
  const toIso = (value) => (value ? new Date(value).toISOString() : null);
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id || null,
    customerName: row.customer_name,
    customerContact: row.customer_contact,
    customerEmail: row.customer_email || '',
    platform: row.platform || '',
    use: row.use_case || '',
    tier: row.tier || '',
    currency: row.currency || 'USD',
    budget: row.budget === null ? null : Number(row.budget),
    subtotal: Number(row.subtotal) || 0,
    assemblyFee: Number(row.assembly_fee) || 0,
    total: Number(row.total) || (Number(row.subtotal) || 0) + (Number(row.assembly_fee) || 0),
    assembly: row.assembly,
    fulfillment: row.fulfillment,
    address: row.address || '',
    notes: row.notes || '',
    parts: row.parts || [],
    depositPercent: Number(row.deposit_percent) || DEPOSIT_PERCENT,
    status: row.status,
    estimatedDate: row.estimated_date ? new Date(row.estimated_date).toISOString().slice(0, 10) : null,
    adminNotes: row.admin_notes || '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function publicOrder(row, options = {}) {
  const order = orderFromRow(row);
  if (options.tracking) {
    delete order.id;
    delete order.userId;
    delete order.customerContact;
    delete order.customerEmail;
    delete order.address;
    delete order.adminNotes;
  }
  return order;
}

async function insertOrderRecord(payload) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await dbQuery(
        `INSERT INTO alium_orders
           (code, user_id, customer_name, customer_contact, customer_email, platform, use_case, tier,
            currency, budget, subtotal, assembly_fee, total, assembly, fulfillment, address, notes, parts, deposit_percent, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,'nuevo')
         RETURNING *`,
        [
          orderCode(), payload.userId || null, payload.customerName, payload.customerContact, payload.customerEmail || null,
          payload.platform || null, payload.use || null, payload.tier || null, payload.budget, payload.subtotal,
          payload.assemblyFee || 0, payload.total || payload.subtotal, payload.assembly, payload.fulfillment,
          payload.address || null, payload.notes || null, JSON.stringify(payload.parts), DEPOSIT_PERCENT,
        ],
      );
      return result.rows[0];
    } catch (error) {
      lastError = error;
      if (error.code !== '23505') throw error;
    }
  }
  throw lastError;
}

async function trackOrder(code, contact) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!/^AL-[A-Z0-9]{5,14}$/.test(normalizedCode)) return null;
  const result = await dbQuery('SELECT * FROM alium_orders WHERE code = $1', [normalizedCode]);
  const row = result.rows[0];
  if (!row) return null;
  const provided = String(contact || '').trim().toLowerCase();
  if (provided.length < 4) return null;
  const phone = String(row.customer_contact || '').replace(/\D/g, '');
  const email = String(row.customer_email || '').toLowerCase();
  const providedDigits = provided.replace(/\D/g, '');
  const contactMatch = (email && provided === email)
    || (providedDigits.length >= 4 && phone.endsWith(providedDigits))
    || (providedDigits.length >= 4 && provided === phone.slice(-providedDigits.length));
  return contactMatch ? row : null;
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
  const site = process.env.PUBLIC_SITE_URL || 'https://alium-pc-builder.netlify.app';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#0b0912;color:#f6f2ff;padding:32px">
      <h1 style="margin:0 0 12px;font-size:24px">Tu cuenta de ALIUM está lista</h1>
      <p>Hola ${safeName}, ya puedes guardar tus configuraciones y volver a ellas cuando quieras.</p>
      <p><a href="${site}/cuenta.html" style="display:inline-block;background:#8a3cf0;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Abrir mi cuenta</a></p>
      <p style="color:#a9a2b8;font-size:13px">Te avisaremos aquí solo cuando haya novedades importantes, ofertas o mantenimiento. Puedes darte de baja respondiendo a este correo.</p>
    </div>`;
  return { subject: 'Tu cuenta de ALIUM está lista', html, text: `Hola ${name || ''}, tu cuenta de ALIUM está lista. Entra en ${site}/cuenta.html` };
}

/* ------------------------------------------------------------------ */
/* Acceso al panel de administración                                    */
/* ------------------------------------------------------------------ */

function hashAdminKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

async function getSetting(key) {
  const result = await dbQuery('SELECT value FROM alium_settings WHERE key = $1', [key]);
  return result.rows[0] ? String(result.rows[0].value) : null;
}

async function setSetting(key, value) {
  await dbQuery(
    `INSERT INTO alium_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value)],
  );
}

async function adminKeyValid(provided) {
  const key = String(provided || '').trim();
  if (!key) return false;
  const stored = await getSetting('admin_key_hash');
  if (!stored) return false;
  const actual = Buffer.from(hashAdminKey(key));
  const expected = Buffer.from(stored);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function adminCookie(request, token, maxAge = ADMIN_DAYS * 24 * 60 * 60) {
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecureRequest(request) ? '; Secure' : ''}`;
}

function clearAdminCookie(request) {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecureRequest(request) ? '; Secure' : ''}`;
}

async function createAdminSession() {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + ADMIN_DAYS * 24 * 60 * 60 * 1000);
  await dbQuery('INSERT INTO alium_admin_sessions (id, expires_at) VALUES ($1, $2)', [sessionId(token), expiresAt]);
  await dbQuery('DELETE FROM alium_admin_sessions WHERE expires_at < now()').catch(() => {});
  return token;
}

async function getAdminSession(request) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token) return null;
  const result = await dbQuery('SELECT id FROM alium_admin_sessions WHERE id = $1 AND expires_at > now()', [sessionId(token)]);
  return result.rows[0] || null;
}

async function adminAuthorizedRequest(request) {
  if (!databaseUrl()) return false;
  if (await getAdminSession(request)) return true;
  return adminKeyValid(request.headers['x-admin-key']);
}

async function revokeAdminSession(request) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (token && databaseUrl()) await dbQuery('DELETE FROM alium_admin_sessions WHERE id = $1', [sessionId(token)]);
}

async function handleApi(request, response, url) {
  const method = request.method;
  const pathname = url.pathname;

  if (pathname === '/api/site') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    return json(response, 200, {
      ok: true,
      depositPercent: DEPOSIT_PERCENT,
      orders: true,
      suppliers: true,
      accounts: { configured: Boolean(databaseUrl()), provider: 'Neon Postgres' },
    });
  }

  // Estadísticas públicas y agregadas: el monitor local detecta registros nuevos sin exponer datos personales.
  if (pathname === '/api/stats') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 200, { ok: true, accounts: false, users: 0, subscribers: 0, lastRegistrationAt: null });
    const result = await dbQuery(
      `SELECT
         (SELECT count(*)::int FROM alium_users) AS users,
         (SELECT count(*)::int FROM alium_subscribers WHERE notify = true) AS subscribers,
         (SELECT max(created_at) FROM alium_users) AS last_registration`,
    );
    const row = result.rows[0] || {};
    return json(response, 200, {
      ok: true,
      accounts: true,
      users: Number(row.users) || 0,
      subscribers: Number(row.subscribers) || 0,
      lastRegistrationAt: row.last_registration ? new Date(row.last_registration).toISOString() : null,
      checkedAt: new Date().toISOString(),
    });
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

  if (pathname === '/api/products') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 200, { ok: true, products: [] });
    const category = cleanText(url.searchParams.get('category'), 30);
    if (category && !ALLOWED_CATEGORIES.has(category)) return json(response, 400, { error: 'Categoría no válida.' });
    const params = [];
    let where = "p.active = true AND s.status = 'aprobado'";
    if (category) { params.push(category); where += ` AND p.category = $${params.length}`; }
    const result = await dbQuery(
      `SELECT p.*, s.business_name AS supplier_name, s.website AS supplier_website
         FROM alium_products p
         JOIN alium_suppliers s ON s.id = p.supplier_id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT 500`,
      params,
    );
    return json(response, 200, { ok: true, products: result.rows.map(productFromRow) });
  }

  if (pathname === '/api/stores') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 200, { ok: true, stores: [] });
    const result = await dbQuery(
      `SELECT id, business_name, website, city, categories, created_at
         FROM alium_suppliers WHERE status = 'aprobado' ORDER BY created_at DESC LIMIT 100`,
    );
    return json(response, 200, {
      ok: true,
      stores: result.rows.map((row) => ({
        id: row.id,
        name: row.business_name,
        website: row.website || '',
        city: row.city || '',
        categories: String(row.categories || '').split(',').map((item) => item.trim()).filter(Boolean),
      })),
    });
  }

  if (pathname === '/api/suppliers') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'El registro de tiendas todavía no está configurado. Falta DATABASE_URL.' });
    if (!rateLimit(`supplier:${clientIp(request)}`, 8, 60 * 60 * 1000)) return json(response, 429, { error: 'Demasiados intentos. Escríbenos por WhatsApp.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request, 64 * 1024);
    const businessName = cleanText(body.businessName, 120);
    const contactName = cleanText(body.contactName, 80);
    const email = cleanText(body.email, 254).toLowerCase();
    const phone = cleanText(body.phone, 40);
    const website = validHttpUrl(body.website);
    const city = cleanText(body.city, 80);
    const message = cleanText(body.message, 1500);
    const categories = (Array.isArray(body.categories) ? body.categories : String(body.categories || '').split(','))
      .map((item) => cleanText(item, 30)).filter((item) => ALLOWED_CATEGORIES.has(item));
    if (businessName.length < 2) return json(response, 400, { error: 'Escribe el nombre de la tienda.' });
    if (contactName.length < 2) return json(response, 400, { error: 'Escribe el nombre de la persona de contacto.' });
    if (!EMAIL_RE.test(email)) return json(response, 400, { error: 'Escribe un correo electrónico válido.' });
    if (phone.length < 7) return json(response, 400, { error: 'Escribe un WhatsApp o teléfono de contacto.' });
    if (!website) return json(response, 400, { error: 'Escribe la página web de la tienda (debe empezar por https://).' });
    if (city.length < 2) return json(response, 400, { error: 'Escribe la ciudad o zona de la tienda.' });
    await dbQuery(
      `INSERT INTO alium_suppliers (business_name, contact_name, email, phone, website, city, categories, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [businessName, contactName, email, phone, website, city, categories.join(','), message || null],
    );
    return json(response, 201, {
      ok: true,
      message: 'Recibimos los datos de tu tienda. Te contactaremos por WhatsApp o correo para validar el catálogo.',
    });
  }

  if (pathname === '/api/orders/track') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'El seguimiento todavía no está configurado.' });
    if (!rateLimit(`track:${clientIp(request)}`, 30)) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    const row = await trackOrder(url.searchParams.get('code'), url.searchParams.get('contact'));
    if (!row) return json(response, 404, { error: 'No encontramos un pedido con ese código y contacto. Revisa los datos.' });
    return json(response, 200, { ok: true, order: publicOrder(row, { tracking: true }) });
  }

  if (pathname === '/api/orders') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Los pedidos todavía no están configurados. Falta DATABASE_URL.' });
    if (!rateLimit(`order:${clientIp(request)}`, 12, 60 * 60 * 1000)) return json(response, 429, { error: 'Has enviado muchos pedidos. Escríbenos por WhatsApp para continuar.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request, 192 * 1024);
    const customerName = cleanText(body.customerName, 80);
    const customerContact = cleanText(body.customerContact, 80);
    const customerEmail = cleanText(body.customerEmail, 254).toLowerCase();
    const platform = ['AMD', 'Intel'].includes(body.platform) ? body.platform : null;
    const use = cleanText(body.use, 40) || null;
    const tier = cleanText(body.tier, 20) || null;
    const budget = cleanNumber(body.budget);
    const assembly = body.assembly === 'alium' ? 'alium' : body.assembly === 'cliente' ? 'cliente' : '';
    const fulfillment = body.fulfillment === 'entrega' ? 'entrega' : body.fulfillment === 'retiro' ? 'retiro' : '';
    const address = cleanText(body.address, 300);
    const notes = cleanText(body.notes, 1000);
    const rawParts = Array.isArray(body.parts) ? body.parts : [];
    const parts = rawParts.map(sanitizePart).filter(Boolean).slice(0, 20);
    if (customerName.length < 2) return json(response, 400, { error: 'Escribe tu nombre.' });
    if (customerContact.length < 5) return json(response, 400, { error: 'Escribe un WhatsApp o correo para contactarte.' });
    if (customerEmail && !EMAIL_RE.test(customerEmail)) return json(response, 400, { error: 'El correo electrónico no es válido.' });
    if (!parts.length) return json(response, 400, { error: 'Tu pedido no tiene piezas. Elige al menos una.' });
    if (!assembly) return json(response, 400, { error: 'Elige si quieres que ALIUM arme la PC o si la armas tú.' });
    if (!fulfillment) return json(response, 400, { error: 'Elige entre entrega a domicilio o retiro.' });
    if (fulfillment === 'entrega' && address.length < 5) return json(response, 400, { error: 'Escribe la dirección de entrega.' });
    const subtotal = Math.round(parts.reduce((sum, part) => sum + (Number(part.price) || 0), 0) * 100) / 100;
    const rawFee = assembly === 'alium' ? Number(body.assemblyFee) || 0 : 0;
    const assemblyFee = Math.round(Math.min(Math.max(rawFee, 0), 2000) * 100) / 100;
    const total = Math.round((subtotal + assemblyFee) * 100) / 100;
    const user = await getSession(request).catch(() => null);
    const row = await insertOrderRecord({
      userId: user ? user.id : null,
      customerName, customerContact, customerEmail, platform, use, tier, budget, subtotal,
      assemblyFee, total, assembly, fulfillment, address, notes, parts,
    });
    return json(response, 201, { ok: true, order: publicOrder(row) });
  }

  if (pathname === '/api/admin/login') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'El panel todavía no está configurado. Falta DATABASE_URL en el servidor.' });
    if (!rateLimit(`admin-login:${clientIp(request)}`, 10)) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request);
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (!key) return json(response, 400, { error: 'Escribe la clave de administrador.' });
    if (!(await adminKeyValid(key))) return json(response, 401, { error: 'Clave incorrecta.' });
    const token = await createAdminSession();
    return json(response, 200, { ok: true }, { 'Set-Cookie': adminCookie(request, token) });
  }

  if (pathname === '/api/admin/logout') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    await revokeAdminSession(request).catch(() => {});
    return json(response, 200, { ok: true }, { 'Set-Cookie': clearAdminCookie(request) });
  }

  if (pathname === '/api/admin/session') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    const authenticated = await adminAuthorizedRequest(request);
    return json(response, 200, { ok: true, authenticated });
  }

  if (pathname === '/api/admin/overview') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });

    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
    const [users, subscribers, counts] = await Promise.all([
      dbQuery(
        `SELECT u.id, u.display_name, u.email, u.created_at,
                (SELECT count(*)::int FROM alium_builds b WHERE b.user_id = u.id) AS builds
           FROM alium_users u
          ORDER BY u.created_at DESC
          LIMIT $1`,
        [limit],
      ),
      dbQuery(
        `SELECT email, source, created_at FROM alium_subscribers
          WHERE notify = true ORDER BY created_at DESC LIMIT $1`,
        [Math.min(limit, 100)],
      ),
      dbQuery(
        `SELECT
           (SELECT count(*)::int FROM alium_users) AS users,
           (SELECT count(*)::int FROM alium_subscribers WHERE notify = true) AS subscribers,
           (SELECT count(*)::int FROM alium_builds) AS builds,
           (SELECT count(*)::int FROM alium_orders) AS orders,
           (SELECT count(*)::int FROM alium_orders WHERE status NOT IN ('entregado','cancelado')) AS open_orders,
           (SELECT count(*)::int FROM alium_suppliers) AS suppliers,
           (SELECT count(*)::int FROM alium_suppliers WHERE status = 'nuevo') AS new_suppliers,
           (SELECT count(*)::int FROM alium_products WHERE active = true) AS products,
           (SELECT count(*)::int FROM alium_users WHERE created_at > now() - interval '7 days') AS recent,
           (SELECT max(created_at) FROM alium_users) AS last_registration`,
      ),
    ]);

    const row = counts.rows[0] || {};
    const toIso = (value) => (value ? new Date(value).toISOString() : null);
    return json(response, 200, {
      ok: true,
      checkedAt: new Date().toISOString(),
      totals: {
        users: Number(row.users) || 0,
        subscribers: Number(row.subscribers) || 0,
        builds: Number(row.builds) || 0,
        orders: Number(row.orders) || 0,
        openOrders: Number(row.open_orders) || 0,
        suppliers: Number(row.suppliers) || 0,
        newSuppliers: Number(row.new_suppliers) || 0,
        products: Number(row.products) || 0,
        recentUsers: Number(row.recent) || 0,
        lastRegistrationAt: toIso(row.last_registration),
      },
      users: users.rows.map((item) => ({
        id: item.id,
        name: item.display_name,
        email: item.email,
        builds: Number(item.builds) || 0,
        createdAt: toIso(item.created_at),
      })),
      subscribers: subscribers.rows.map((item) => ({
        email: item.email,
        source: item.source || '',
        createdAt: toIso(item.created_at),
      })),
    });
  }

  if (pathname === '/api/admin/orders') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    const status = cleanText(url.searchParams.get('status'), 20);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
    const params = [];
    let where = '';
    if (status && ORDER_STATUSES.includes(status)) { params.push(status); where = `WHERE status = $${params.length}`; }
    params.push(limit);
    const result = await dbQuery(`SELECT * FROM alium_orders ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    return json(response, 200, { ok: true, orders: result.rows.map(orderFromRow) });
  }

  const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/i);
  if (adminOrderMatch) {
    if (method !== 'PATCH') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request);
    const found = await dbQuery('SELECT * FROM alium_orders WHERE id = $1', [adminOrderMatch[1]]);
    if (!found.rows[0]) return json(response, 404, { error: 'Pedido no encontrado.' });
    const current = found.rows[0];
    const status = body.status === undefined ? current.status : cleanText(body.status, 20);
    if (!ORDER_STATUSES.includes(status)) return json(response, 400, { error: 'Estado del pedido no válido.' });
    let estimatedDate = current.estimated_date;
    if (body.estimatedDate !== undefined) {
      const raw = cleanText(body.estimatedDate, 10);
      estimatedDate = raw ? raw : null;
      if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return json(response, 400, { error: 'La fecha estimada debe tener formato AAAA-MM-DD.' });
    }
    const adminNotes = body.adminNotes === undefined ? current.admin_notes : (cleanText(body.adminNotes, 2000) || null);
    const result = await dbQuery(
      `UPDATE alium_orders SET status = $1, estimated_date = $2, admin_notes = $3, updated_at = now()
        WHERE id = $4 RETURNING *`,
      [status, estimatedDate, adminNotes, adminOrderMatch[1]],
    );
    return json(response, 200, { ok: true, order: orderFromRow(result.rows[0]) });
  }

  if (pathname === '/api/admin/suppliers') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    const result = await dbQuery('SELECT * FROM alium_suppliers ORDER BY created_at DESC LIMIT 500');
    return json(response, 200, {
      ok: true,
      suppliers: result.rows.map((row) => ({
        id: row.id, businessName: row.business_name, contactName: row.contact_name, email: row.email,
        phone: row.phone || '', website: row.website || '', city: row.city || '',
        categories: String(row.categories || '').split(',').filter(Boolean), message: row.message || '',
        status: row.status, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
    });
  }

  const adminSupplierMatch = pathname.match(/^\/api\/admin\/suppliers\/([0-9a-f-]{36})$/i);
  if (adminSupplierMatch) {
    if (method !== 'PATCH') return json(response, 405, { error: 'Método no permitido.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request);
    const status = cleanText(body.status, 20);
    if (!SUPPLIER_STATUSES.includes(status)) return json(response, 400, { error: 'Estado de tienda no válido.' });
    const result = await dbQuery('UPDATE alium_suppliers SET status = $1 WHERE id = $2 RETURNING id, status', [status, adminSupplierMatch[1]]);
    if (!result.rows[0]) return json(response, 404, { error: 'Tienda no encontrada.' });
    return json(response, 200, { ok: true, id: result.rows[0].id, status: result.rows[0].status });
  }

  if (pathname === '/api/admin/products') {
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    if (method === 'GET') {
      const result = await dbQuery(
        `SELECT p.*, s.business_name AS supplier_name
           FROM alium_products p
           LEFT JOIN alium_suppliers s ON s.id = p.supplier_id
          ORDER BY p.created_at DESC LIMIT 500`,
      );
      return json(response, 200, { ok: true, products: result.rows.map(productFromRow) });
    }
    if (method === 'POST') {
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
      const body = await readJson(request, 128 * 1024);
      const category = cleanText(body.category, 30);
      const name = cleanText(body.name, 160);
      const supplierId = cleanText(body.supplierId, 36);
      const price = cleanNumber(body.price);
      const currency = body.currency === 'DOP' ? 'DOP' : 'USD';
      if (!ALLOWED_CATEGORIES.has(category)) return json(response, 400, { error: 'Categoría no válida.' });
      if (name.length < 2) return json(response, 400, { error: 'Escribe el nombre del producto.' });
      if (!/^[0-9a-f-]{36}$/i.test(supplierId)) return json(response, 400, { error: 'Elige la tienda proveedora.' });
      if (price === null || price < 0) return json(response, 400, { error: 'Escribe un precio válido.' });
      const supplier = await dbQuery('SELECT id FROM alium_suppliers WHERE id = $1', [supplierId]);
      if (!supplier.rows[0]) return json(response, 404, { error: 'La tienda seleccionada no existe.' });
      const attributes = sanitizeAttributes(body.attributes || body);
      const result = await dbQuery(
        `INSERT INTO alium_products
           (supplier_id, category, name, brand, model, spec, price, currency, image_url, product_url, attributes, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
         RETURNING *, (SELECT business_name FROM alium_suppliers WHERE id = $1) AS supplier_name`,
        [supplierId, category, name, cleanText(body.brand, 80) || null, cleanText(body.model, 120) || null,
          cleanText(body.spec, 300) || null, price, currency, validHttpUrl(body.imageUrl) || null,
          validHttpUrl(body.productUrl) || null, JSON.stringify(attributes), body.active !== false],
      );
      return json(response, 201, { ok: true, product: productFromRow(result.rows[0]) });
    }
    return json(response, 405, { error: 'Método no permitido.' });
  }

  if (pathname === '/api/admin/products/import') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
    const body = await readJson(request);
    const suggestion = await importProductFromUrl(body.url);
    return json(response, 200, { ok: true, suggestion });
  }

  const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([0-9a-f-]{36})$/i);
  if (adminProductMatch) {
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    if (method === 'DELETE') {
      const result = await dbQuery('DELETE FROM alium_products WHERE id = $1 RETURNING id', [adminProductMatch[1]]);
      if (!result.rows[0]) return json(response, 404, { error: 'Producto no encontrado.' });
      return json(response, 200, { ok: true });
    }
    if (method === 'PATCH') {
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(response, 415, { error: 'Formato de solicitud no admitido.' });
      const body = await readJson(request, 128 * 1024);
      const found = await dbQuery('SELECT * FROM alium_products WHERE id = $1', [adminProductMatch[1]]);
      if (!found.rows[0]) return json(response, 404, { error: 'Producto no encontrado.' });
      const current = found.rows[0];
      const category = body.category === undefined ? current.category : cleanText(body.category, 30);
      if (!ALLOWED_CATEGORIES.has(category)) return json(response, 400, { error: 'Categoría no válida.' });
      const price = body.price === undefined ? Number(current.price) : cleanNumber(body.price);
      if (price === null || price < 0) return json(response, 400, { error: 'Precio no válido.' });
      const attributes = body.attributes === undefined ? current.attributes : sanitizeAttributes(body.attributes || body);
      const result = await dbQuery(
        `UPDATE alium_products SET category=$1, name=$2, brand=$3, model=$4, spec=$5, price=$6,
           currency=$7, image_url=$8, product_url=$9, attributes=$10::jsonb, active=$11, updated_at=now()
         WHERE id=$12
         RETURNING *, (SELECT business_name FROM alium_suppliers WHERE id = supplier_id) AS supplier_name`,
        [category, cleanText(body.name, 160) || current.name, body.brand === undefined ? current.brand : (cleanText(body.brand, 80) || null),
          body.model === undefined ? current.model : (cleanText(body.model, 120) || null),
          body.spec === undefined ? current.spec : (cleanText(body.spec, 300) || null),
          price, body.currency === 'DOP' ? 'DOP' : body.currency === 'USD' ? 'USD' : current.currency,
          body.imageUrl === undefined ? current.image_url : (validHttpUrl(body.imageUrl) || null),
          body.productUrl === undefined ? current.product_url : (validHttpUrl(body.productUrl) || null),
          JSON.stringify(attributes), body.active === undefined ? current.active : Boolean(body.active), adminProductMatch[1]],
      );
      return json(response, 200, { ok: true, product: productFromRow(result.rows[0]) });
    }
    return json(response, 405, { error: 'Método no permitido.' });
  }

  if (pathname === '/api/admin/subscribers') {
    if (method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
    if (!databaseUrl()) return json(response, 503, { error: 'Falta DATABASE_URL.' });
    const result = await dbQuery('SELECT email, source, created_at FROM alium_subscribers WHERE notify = true ORDER BY created_at DESC LIMIT 5000');
    return json(response, 200, {
      count: result.rows.length,
      emails: result.rows.map((row) => ({ email: row.email, source: row.source, createdAt: row.created_at })),
    });
  }

  if (pathname === '/api/admin/notify') {
    if (method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
    if (!(await adminAuthorizedRequest(request))) return json(response, 401, { error: 'No autorizado.' });
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
