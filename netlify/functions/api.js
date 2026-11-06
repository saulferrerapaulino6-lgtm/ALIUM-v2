const serverless = require('serverless-http');
const { server } = require('../../server.js');

const inner = serverless(server, { binary: false });

exports.handler = async (event, context) => {
  // Netlify calls /.netlify/functions/api/...; the app expects /api/...
  const original = event.path || '/';
  let target = original.replace(/^\/\.netlify\/functions\/api/, '/api');
  if (target === '/api/health') target = '/health';
  if (!target.startsWith('/')) target = '/' + target;
  event.path = target;
  if (event.rawPath) event.rawPath = target;
  context.callbackWaitsForEmptyEventLoop = false;
  return inner(event, context);
};
