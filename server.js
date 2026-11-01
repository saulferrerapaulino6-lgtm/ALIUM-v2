const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
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
let cachedEbayToken = null;

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function ebayApiRoot() {
  return process.env.EBAY_ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

async function getEbayAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error('La búsqueda de eBay aún no está configurada en el servidor.');
    error.status = 503;
    throw error;
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
    const error = new Error('eBay no aceptó las credenciales. Revisa que sean del mismo entorno (Sandbox o Producción).');
    error.status = 502;
    throw error;
  }
  cachedEbayToken = { value: data.access_token, expiresAt: Date.now() + Math.max(60, data.expires_in - 60) * 1000 };
  return cachedEbayToken.value;
}

async function searchEbay(url) {
  const category = url.searchParams.get('category') || 'cpu';
  if (!ALLOWED_CATEGORIES.has(category)) {
    const error = new Error('La categoría solicitada no es válida.');
    error.status = 400;
    throw error;
  }
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
    const error = new Error(data.errors?.[0]?.message || `eBay respondió con estado ${response.status}.`);
    error.status = 502;
    throw error;
  }
  const items = (data.itemSummaries || []).map(item => ({
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
  })).filter(item => Number.isFinite(item.price));

  return {
    provider: 'eBay', marketplace: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
    query: q, total: data.total || items.length, items,
    fetchedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (request, response) => {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    json(response, 400, { error: 'Solicitud inválida.' });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return json(response, 405, { error: 'Método no permitido.' });
    if (url.pathname === '/api/providers/ebay/search') {
      try {
        return json(response, 200, await searchEbay(url));
      } catch (error) {
        return json(response, error.status || 502, { error: error.message || 'No se pudo consultar eBay.' });
      }
    }
    return json(response, 404, { error: 'Endpoint API no encontrado.' });
  }

  if (url.pathname === '/health') return json(response, 200, { ok: true });

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Solicitud inválida');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/.env' || pathname.toLowerCase().endsWith('/.env')) {
    response.writeHead(403).end('Prohibido');
    return;
  }
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + path.sep)) {
    response.writeHead(403).end('Prohibido');
    return;
  }
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end('No encontrado');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(response);
  });
});

const port = Number(process.env.PORT) || 4174;
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log('ALIUM local: http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + port);
});
