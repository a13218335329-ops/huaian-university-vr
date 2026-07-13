import http from 'node:http';

const PORT = Number(globalThis.process?.env?.PORT || 8787);
const TARGET = 'https://vr.justeasy.cn/view/1i77k9o33n09m286-1781412008.html?sessionid=';
const ROOT = new URL('.', import.meta.url);
const HOSTS = {
  'vr.justeasy.cn': 'https://vr.justeasy.cn',
  'vrapi.justeasy.cn': 'https://vrapi.justeasy.cn',
  'vrxmlnew.justeasy.cn': 'https://vrxmlnew.justeasy.cn',
  'vrpic.justeasy.cn': 'https://vrpic.justeasy.cn',
  'res1.justeasy.cn': 'https://res1.justeasy.cn'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function proxyViewer(res) {
  try {
    const upstream = await fetch(TARGET, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; HuaianCampusProxy/1.0)',
        accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!upstream.ok) {
      send(res, upstream.status, `Upstream returned ${upstream.status}`);
      return;
    }

    let html = await upstream.text();
    // The upstream page blocks iframe embedding. The proxy is intended for a
    // site owner or an authorized integration and removes only those headers.
    html = rewriteUrls(html);
    html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
    send(res, 200, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self' http://localhost:* http://127.0.0.1:*",
      'X-Frame-Options': 'SAMEORIGIN'
    });
  } catch (error) {
    send(res, 502, `Proxy error: ${error.message}`);
  }
}

function rewriteUrls(text) {
  return Object.keys(HOSTS).reduce((value, host) => {
    return value.replaceAll(HOSTS[host], `/proxy/${host}`);
  }, text);
}

async function proxyMapped(pathname, res) {
  const match = pathname.match(/^\/proxy\/([^/]+)(\/.*)?$/);
  const host = match?.[1];
  if (!host || !HOSTS[host]) {
    send(res, 404, 'Unknown proxy host');
    return;
  }

  const target = `${HOSTS[host]}${match[2] || '/'}`;
  try {
    const upstream = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; HuaianCampusProxy/1.0)' } });
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    const isText = /javascript|json|xml|css|html|text\//i.test(type);
    const body = isText ? rewriteUrls(await upstream.text()) : Buffer.from(await upstream.arrayBuffer());
    send(res, upstream.status, body, { 'Content-Type': type });
  } catch (error) {
    send(res, 502, `Proxy error: ${error.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/vr') {
    await proxyViewer(res);
    return;
  }

  if (url.pathname.startsWith('/proxy/')) {
    await proxyMapped(url.pathname, res);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const file = await import('node:fs/promises');
    const html = await file.readFile(new URL('index.html', ROOT));
    send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
    return;
  }

  send(res, 404, 'Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`淮安大学全景网站: http://127.0.0.1:${PORT}`);
  console.log('此代理仅适用于你有权访问和集成的公开页面。');
});
