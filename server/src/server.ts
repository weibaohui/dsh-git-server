// HTTP server: request pipeline wiring session/context/router/static/SPA,
// mirroring cmd/gogs/internal/web/web.go dispatch order.
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { conf } from './conf.js';
import { Context, Session, Contexter, setServeWebHandler } from './context.js';
import { registerAPIRoutes } from './api/v1.js';
import { handleGitHTTP } from './gitx/http.js';
import { md5 } from './authx/password.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
};

function serveFile(res: http.ServerResponse, file: string, cacheForever = true): boolean {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
    if (cacheForever) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function serveStaticPrefix(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  // static roots, mirroring macaron.Static registration order
  for (const [prefix, dir] of [
    ['/css/', path.join(conf.workDir, 'public', 'css')],
    ['/js/', path.join(conf.workDir, 'public', 'js')],
    ['/img/', path.join(conf.workDir, 'public', 'img')],
    ['/plugins/', path.join(conf.workDir, 'public', 'plugins')],
    ['/assets/', path.join(conf.workDir, 'public', 'assets')],
    ['/less/', path.join(conf.workDir, 'public', 'less')],
  ] as const) {
    if (pathname.startsWith(prefix)) {
      const rel = pathname.slice(prefix.length);
      const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
      return serveFile(res, path.join(dir, safe));
    }
  }
  // custom public overrides first
  const customDir = path.join(conf.customDir, 'public');
  if (fs.existsSync(customDir)) {
    const rel = pathname.replace(/^\/+/, '');
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    if (safe && serveFile(res, path.join(customDir, safe))) return true;
  }
  return false;
}

/** Serve the SPA shell (public/dist/index.html) with WebContext substitution. */
function serveGone(c: Context): void {
  // 原版 gogs 网页界面已裁撤：dsh 原生 UI 覆盖全部功能，
  // 3400 只保留 git HTTP 协议 + /api/v1 + /api/dsh（/api/web 登录面已随 SPA 裁撤）
  c.res.statusCode = 404;
  c.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  c.res.end('web UI removed — use the dsh Git panel; git HTTP and APIs remain on this port');
}

let router: import('./router.js').Router;

export async function startServer(): Promise<http.Server> {
  setServeWebHandler((c) => serveGone(c));

  const { Router } = await import('./router.js');
  router = new Router();
  registerAPIRoutes(router);
  const { registerDshRoutes } = await import('./dshapi.js');
  registerDshRoutes(router);

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (e: any) {
      console.error('[server panic]', e?.stack ?? e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end('Internal server error');
    }
  });

  return new Promise((resolve) => {
    server.listen(conf.httpPort, conf.httpAddr, () => resolve(server));
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://internal');
  let pathname = decodeURIComponent(url.pathname);
  if (conf.subpath && pathname.startsWith(conf.subpath + '/')) {
    pathname = pathname.slice(conf.subpath.length);
  } else if (conf.subpath && pathname === conf.subpath) {
    pathname = '/';
  }

  // internal: /-/api/sanitize_ipynb (bluemonday-style ipynb HTML sanitizer)
  if (pathname === '/-/api/sanitize_ipynb' && req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const { sanitizeHTML } = await import('./markup.js');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(sanitizeHTML(Buffer.concat(chunks).toString('utf8')));
    return;
  }

  // internal: /-/metrics (prometheus text format; gated by [prometheus] ENABLED)
  if (pathname === '/-/metrics' && req.method === 'GET') {
    if (!conf.prometheusEnabled) {
      res.statusCode = 404;
      res.end();
      return;
    }
    if (conf.prometheusEnableBasicAuth) {
      const expected = 'Basic ' + Buffer.from('gogsmetrics:gogsplant').toString('base64');
      if (req.headers.authorization !== expected) {
        res.statusCode = 401;
        res.end();
        return;
      }
    }
    const { renderMetrics } = await import('./metrics.js');
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(renderMetrics());
    return;
  }

  // healthcheck
  if (pathname === '/healthcheck' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? undefined : '* Database connection: OK\n');
    return;
  }

  // redirect helper (flamego)
  if (pathname === '/redirect') {
    let to = url.searchParams.get('to') ?? '';
    if (!to.startsWith('/') || to.startsWith('//')) to = conf.subpath + '/';
    res.statusCode = 303;
    res.setHeader('Location', to);
    res.end();
    return;
  }
  if (pathname === '/robots.txt') {
    const f = path.join(conf.customDir, 'robots.txt');
    if (fs.existsSync(f)) {
      serveFile(res, f, false);
    } else {
      res.statusCode = 404;
      res.end();
    }
    return;
  }

  // git smart HTTP: /:username/:reponame(.git)(.wiki)/...
  if (handleGitHTTP(req, res, pathname)) return;

  const c = new Context(req, res);
  const session = new Session(cookieValue(req, conf.cookieUserName));
  c.init(session);

  // flash cookie read
  c.flash.readFromCookie(cookieValue(req, 'macaron_flash'));

  // macaron writes session/flash cookies just before the response flushes
  const origEnd = res.end.bind(res);
  (res as any).end = (...args: any[]) => {
    if (!res.headersSent) {
      const maxAge = 86400 * conf.loginRememberDays;
      c.SetCookie(conf.cookieUserName, session.sid, maxAge);
      if (c.flash.hasWrites()) {
        c.SetCookie('macaron_flash', c.flash.encoded(), 0);
      }
    }
    return (origEnd as any)(...args);
  };

  // global Contexter (i18n + session auth + common Data), like macaron global middleware
  await Contexter()(c);

  // API v1?
  if (pathname === '/api' || pathname.startsWith('/api/v1') || pathname.startsWith('/api/v1/')) {
    const match = router.match(req.method ?? 'GET', pathname);
    if (match) {
      c.params = match.params;
      await runChain(match.route.handlers, c);
      finalize(c);
      return;
    }
    res.statusCode = 404;
    res.end();
    return;
  }

  // captcha image (flamego/captcha equivalent)
  if (pathname.startsWith('/captcha/')) {
    const { newCaptcha } = await import('./toolx.js');
    const { id, svg } = newCaptcha();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', `gogs_captcha=${id}; Path=${conf.subpath || '/'}; HttpOnly`);
    res.end(svg);
    return;
  }

  // avatar endpoints
  // avatar middleware: serve cached → download from gravatar source (once) → default
  const avatarMatch = /^\/user\/avatar\/([0-9a-f]{32})$/.exec(pathname);
  if (avatarMatch) {
    const hash = avatarMatch[1];
    const cached = path.join(conf.avatarUploadPath, hash);
    const failMark = path.join(conf.avatarUploadPath, hash + '.failed');
    const defaultPng = path.join(conf.workDir, 'public', 'img', 'avatar_default.png');
    const serveDefault = () => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      serveFile(res, defaultPng, false);
    };
    if (fs.existsSync(cached)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Type', 'image/png');
      fs.createReadStream(cached).pipe(res);
      return;
    }
    if (conf.disableGravatar || fs.existsSync(failMark)) {
      serveDefault();
      return;
    }
    // one-shot gravatar download with short timeout; negative-cached for 24h
    try {
      const buf = await downloadAvatar(conf.gravatarSource + hash + '?d=identicon');
      fs.mkdirSync(conf.avatarUploadPath, { recursive: true });
      fs.writeFileSync(cached, buf);
      res.setHeader('Content-Type', 'image/png');
      res.end(buf);
    } catch {
      try { fs.mkdirSync(conf.avatarUploadPath, { recursive: true }); fs.writeFileSync(failMark, ''); } catch {}
      serveDefault();
    }
    return;
  }
  const customAvatarMatch = /^\/user\/avatars\/(\d+)$/.exec(pathname);
  if (customAvatarMatch) {
    if (serveFile(res, path.join(conf.avatarUploadPath, customAvatarMatch[1]), false)) return;
    res.statusCode = 302;
    res.setHeader('Location', conf.subpath + '/img/avatar_default.png');
    res.end();
    return;
  }
  const repoAvatarMatch = /^\/repo-avatars\/([0-9a-f]{40})$/.exec(pathname);
  if (repoAvatarMatch) {
    if (serveFile(res, path.join(conf.repositoryAvatarUploadPath, repoAvatarMatch[1]), false)) return;
    res.statusCode = 302;
    res.setHeader('Location', conf.subpath + '/img/avatar_default.png');
    res.end();
    return;
  }

  // go-get meta (gogs ServeGoGet): quick response regardless of repo existence
  if (url.searchParams.get('go-get') === '1') {
    const m = /^\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (m) {
      const [, ownerName, repoName] = m;
      let branchName = 'master';
      const owner = (await import('./db/db.js')).getUserByUsername(ownerName);
      const repo = owner ? (await import('./db/db.js')).getRepoByOwnerAndName(owner, repoName) : null;
      if (repo && repo.default_branch) branchName = repo.default_branch;
      const prefix = conf.externalURL + [ownerName, repoName, 'src', branchName].join('/');
      const goGetImport = conf.url.host + (conf.subpath || '') + '/' + ownerName + '/' + repoName;
      const cloneLink = conf.externalURL + path.posix.join(ownerName, repoName) + '.git';
      const insecureFlag = conf.externalURL.startsWith('https://') ? '' : '--insecure ';
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.statusCode = 200;
      res.end(`<!doctype html>
<html>
\t<head>
\t\t<meta name="go-import" content="${goGetImport} git ${cloneLink}">
\t\t<meta name="go-source" content="${goGetImport} _ ${prefix}{/dir} ${prefix}{/dir}/{file}#L{line}">
\t</head>
\t<body>
\t\tgo get ${insecureFlag}${goGetImport}
\t</body>
</html>
`);
      return;
    }
  }

  // static assets — served BEFORE routes (macaron.Static ordering; otherwise
  // /css/gogs.min.css would be captured by /:username/:reponame)
  if (serveStaticPrefix(req, res, pathname)) return;

  // SPA dist static files: vite base './' makes asset URLs relative to the
  // page path (e.g. /user/sign-in → /user/assets/index-*.js), so any
  // .../assets/<file> request resolves against public/dist/assets
  const assetFile = /\/(?:[a-zA-Z0-9_.-]+\/)?assets\/([a-zA-Z0-9_.-]+)$/.exec(pathname);
  if ((req.method === 'GET' || req.method === 'HEAD') && assetFile) {
    const safe = path.normalize(assetFile[1]).replace(/^(\.\.\/)+/, '');
    if (serveFile(res, path.join(conf.workDir, 'public', 'dist', 'assets', safe), false)) return;
    res.statusCode = 404;
    res.end();
    return;
  }

  // route table
  const match = router.match(req.method ?? 'GET', pathname);
  if (match) {
    c.params = match.params;
    await runChain(match.route.handlers, c);
    finalize(c);
    return;
  }

  // web UI removed (see serveGone)
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveGone(c);
    return;
  }

  res.statusCode = 404;
  res.end();
}

function downloadAvatar(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? require('node:https') : require('node:http');
    const req2 = mod.get(url, { timeout: 5000 }, (r: any) => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('status ' + r.statusCode)); }
      const chunks: Buffer[] = [];
      r.on('data', (d: Buffer) => chunks.push(d));
      r.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req2.on('timeout', () => req2.destroy(new Error('timeout')));
    req2.on('error', reject);
  });
}

function cookieValue(req: http.IncomingMessage, name: string): string | undefined {
  const cookie = req.headers.cookie ?? '';
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

async function runChain(handlers: ((c: Context) => void | Promise<void>)[], c: Context): Promise<void> {
  for (const h of handlers) {
    if (c.rendered) return;
    await h(c);
  }
}

/** After handlers: release session back to the store. */
function finalize(c: Context): void {
  c.session.Release();
}

export { serveFile };
