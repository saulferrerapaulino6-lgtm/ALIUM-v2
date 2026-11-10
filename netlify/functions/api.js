// Adaptador Netlify Functions para server.js (ALIUM v2, modelo de intermediación).
// Netlify redirige /api/* y /health a esta función (ver netlify.toml).
// server.js espera un request estilo Node (headers, socket, on('data'/'end'))
// y un response con writeHead/end/headersSent: aquí se recrean los dos.
const { handleApi } = require('../../server.js');

function toUrl(event) {
  // Netlify invoca la función como /.netlify/functions/api/<resto> por el
  // redirect de netlify.toml. La API espera /api/<resto>; /health va aparte.
  const rawPath = event.path || '/';
  let path;
  const prefix = '/.netlify/functions/api';
  if (rawPath === prefix || rawPath.startsWith(prefix + '/')) {
    const rest = rawPath.slice(prefix.length) || '/';
    path = rest === '/health' ? '/health' : '/api' + (rest.startsWith('/') ? rest : '/' + rest);
  } else {
    path = rawPath;
  }
  const qs = event.queryStringParameters
    ? '?' + new URLSearchParams(event.queryStringParameters).toString()
    : '';
  return new URL(path + qs, 'http://localhost');
}

exports.handler = async (event) => {
  const url = toUrl(event);
  if (url.pathname === '/health') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, accounts: Boolean(process.env.DATABASE_URL) }) };
  }
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
  const clientIp = event.headers && (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'])
    ? String(event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']).split(',')[0].trim()
    : (event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp) || '127.0.0.1';
  const bodyBuf = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : Buffer.alloc(0);
  const req = {
    method: event.httpMethod,
    headers,
    socket: { remoteAddress: clientIp, encrypted: headers['x-forwarded-proto'] === 'https' },
    on(evt, fn) {
      if (evt === 'data' && bodyBuf.length) fn(bodyBuf);
      if (evt === 'end') fn();
      return this;
    },
  };
  let status = 200;
  let resHeaders = {};
  let body = '';
  let headersSent = false;
  const res = {
    get headersSent() { return headersSent; },
    writeHead(s, h) { status = s; resHeaders = h || {}; headersSent = true; },
    setHeader() {},
    end(data) { body += data || ''; },
  };
  try {
    await handleApi(req, res, url);
  } catch (error) {
    if (!headersSent) {
      status = error.status || 502;
      resHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      body = JSON.stringify({ error: error.message || 'No se pudo completar la solicitud.' });
    }
  }
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...resHeaders },
    body,
  };
};
