// dsh 私有 API 的宿主进程内实现：把内核 server/dist/dshapi.js 的
// registerDshRoutes 直接在宿主进程里跑（动态导入 ESM dist），省掉
// 「铸个人令牌 + localhost HTTP 跳转」这一层。git HTTP/LFS、/api/v1、
// /api/web 身份链仍在内核子进程。
//
// 机制：
//   - lazy init：conf.load 用与内核子进程一致的 workDir/customDir，然后
//     动态导入 dist 的 db/git/markup/svc/dshapi；
//   - 注册一个伪 Router 收集 dshapi 的全部路由；
//   - dispatch() 每请求：宿主已知登录用户 → 铸个人令牌（仅做内核侧鉴权
//     校验的通道，不再发 HTTP）→ 构造精简 Context 壳 → 匹配路由执行；
//   - archive 下载等二进制直接写真实 res（不再被 JSON 化）。
//
// SQLite 并发：host 与内核子进程共享同一个 gogs.db（WAL 模式），
// better-sqlite3 同步写入偶发 SQLITE_BUSY——批量写路径（issues 等）在
// 内核侧仍是单一写者，宿主侧只做配置/查询级写入，风险可接受。

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let _ready = null;

async function ensureInit(cfg) {
  if (_ready) return _ready;
  _ready = (async () => {
    const serverDir = path.join(__dirname, '..', 'server');
    const customDir = path.join(cfg.dataDir, 'custom');
    const customConf = path.join(customDir, 'conf', 'app.ini');
    const { conf } = await import(pathToFileURL(path.join(serverDir, 'dist', 'conf.js')).href);
    conf.load(serverDir, customDir, customConf);
    const dshapi = await import(pathToFileURL(path.join(serverDir, 'dist', 'dshapi.js')).href);
    const routes = [];
    const fake = {
      get: (p, ...h) => routes.push({ method: 'GET', pattern: p, handler: h[0] }),
      post: (p, ...h) => routes.push({ method: 'POST', pattern: p, handler: h[0] }),
      patch: (p, ...h) => routes.push({ method: 'PATCH', pattern: p, handler: h[0] }),
      delete: (p, ...h) => routes.push({ method: 'DELETE', pattern: p, handler: h[0] }),
    };
    dshapi.registerDshRoutes(fake);
    return { routes };
  })();
  return _ready;
}

// 路径匹配：静态段 > :param 单段 > :* 通配剩余
function matchRoute(pattern, pathname) {
  const pp = pattern.split('/').filter(Boolean);
  const segs = pathname.split('/').filter(Boolean);
  const params = {};
  let i = 0, j = 0;
  while (i < pp.length && j < segs.length) {
    const seg = pp[i];
    if (seg === ':*' || seg === '*') { params[':*'] = segs.slice(j).join('/'); return params; }
    if (seg.startsWith(':')) params[seg] = decodeURIComponent(segs[j]);
    else if (seg !== segs[j]) return null;
    i++; j++;
  }
  if (i === pp.length && j === segs.length) return params;
  return null;
}

class ShimContext {
  constructor({ req, res, params, pathname, query, body, user }) {
    this.req = req;
    this.res = res;
    this.params = params;
    this.pathname = pathname;
    this.query = query;
    this.formObj = body;
    this.user = user;
    this.rendered = false;
  }
  Params(name) { return this.params[name] ?? ''; }
  ParamsInt64(name) { return Number(this.params[name]) || 0; }
  Query(name) { return this.query.get(name) ?? ''; }
  QueryInt(name) { return Number(this.query.get(name)) || 0; }
  async form() { return this.formObj; }
  get IsLogged() { return !!this.user; }
  JSON(status, obj) {
    this.res.statusCode = status;
    this.res.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.res.end(JSON.stringify(obj));
    this.rendered = true;
  }
  JSONSuccess(obj) { this.JSON(200, obj); }
  Path() { return this.pathname; }
}

/**
 * 进程内执行 /api/dsh/* 请求。
 * @param cfg 插件配置（含 dataDir/port）
 * @param actor 当前登录用户名（已铸个人令牌，仅用于内核侧鉴权字段）
 * @param method HTTP 方法
 * @param rest /dsh/... 路径（相对 /dsh-git-server/api 前缀已剥）
 * @param req 原始请求
 * @param res 原始响应
 * @returns true=已处理；false=路由不存在（回退 HTTP 转发）
 */
async function dispatch(cfg, actor, method, rest, req, res, token) {
  const { routes } = await ensureInit(cfg);
  // dshapi 的路由都是 /api/dsh/... 前缀；rest 是 'dsh/...' 形态
  const pathname = '/api/' + rest;
  const url = new URL(pathname, 'http://internal');
  for (const r of routes) {
    if (r.method !== method) continue;
    const params = matchRoute(r.pattern, url.pathname);
    if (!params) continue;
    const body = await readBodyJson(req);
    // 内核 authRepo 从 authorization 头取令牌；塞入 actor 的个人令牌
    req.headers.authorization = 'token ' + token;
    const c = new ShimContext({ req, res, params, pathname: url.pathname, query: url.searchParams, body, user: null });
    await r.handler(c);
    return true;
  }
  return false;
}

async function readBodyJson(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

module.exports = { dispatch };
