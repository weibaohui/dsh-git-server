'use strict'

/**
 * @weibaohui/dsh-git-server — Host half（cordis 宿主接线）。
 *
 * 四件事：
 *  1. settings 服务注册 schema（enabled/host/port/dataDir/authMode，3s 内
 *     热生效——reconciler 指纹比对，变化才重启子进程）；
 *  2. 内嵌 ts-gogs 子进程生命周期（src/runner.js：写 app.ini → spawn →
 *     就绪探测 → 崩溃自动拉起）；
 *  3. 同源路由 /dsh-git-server/api/*（status/settings）给宿主设置页用——
 *     认证由宿主 web 门禁负责，此处不重复做；
 *  4. 管理员密码管理：首次启动自动生成并持久化（settings 优先，token 文件
 *     兜底），设置页可见可轮换。
 *
 * authMode：
 *   - gogs（默认）：ts-gogs 自己的账号/令牌体系（管理员密码在状态里展示）；
 *   - user-management：git HTTP Basic 与网页登录接受 user-management 的
 *     用户名密码（映射到本库管理员），用户库缺失自动回退 gogs 模式。
 */

const fs = require('node:fs')
const path = require('node:path')

const engine = require('./runner')

const name = engine.PLUGIN_ID
const inject = ['webServer', 'settings']
const API_PREFIX = '/' + engine.PLUGIN_ID + '/api'
const SETTINGS_NS = engine.PLUGIN_ID

// ── schemastery 加载（settings 服务同源；缺席时仅 loader config 生效）──────

const { pathToFileURL } = require('node:url')
const os = require('node:os')

let schemaPromise = null

function hostCandidatePaths(pkgName, rel) {
  const prefixes = [process.env.DSH_GLOBAL_PREFIX, os.homedir() + '/.local'].filter(Boolean)
  return prefixes.map((prefix) =>
    path.join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', pkgName, rel),
  )
}

function startSchemaLoader() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const candidates = [
        ...hostCandidatePaths('schemastery', 'lib/index.cjs'),
        '@deepseek-ai/schemastery',
      ]
      const errors = []
      for (const target of candidates) {
        try {
          const specifier = target.includes('/') && !target.startsWith('@') && target.includes('node_modules')
            ? pathToFileURL(target).href
            : target
          const mod = await import(specifier)
          return mod
        } catch (e) {
          errors.push(`${target}: ${String((e && e.message) || e).slice(0, 160)}`)
        }
      }
      throw new Error(errors.join(' | '))
    })()
  }
  return schemaPromise
}

async function resolveSchema() {
  try {
    const mod = await startSchemaLoader()
    if (!mod) return null
    const Schema = mod.default || mod.Schema || (typeof mod === 'function' ? mod : null)
    return Schema && typeof Schema.object === 'function' ? Schema : null
  } catch {
    return null
  }
}

function __seedSchema(Schema) {
  schemaPromise = Promise.resolve(Schema ? { default: Schema } : null)
}

function settingsSchema(Schema) {
  if (!Schema || typeof Schema.object !== 'function') return null
  return Schema.object({
    enabled: Schema.boolean().default(engine.DEFAULTS.enabled),
    host: Schema.string().default(engine.DEFAULTS.host),
    port: Schema.number().step(1).min(engine.NUM_RANGES.port[0]).max(engine.NUM_RANGES.port[1]).default(engine.DEFAULTS.port),
    dataDir: Schema.string().default(engine.DEFAULTS.dataDir),
    adminPassword: Schema.string().default(engine.DEFAULTS.adminPassword),
    impersonateSecret: Schema.string().default(engine.DEFAULTS.impersonateSecret),
  })
}

// ── 插件 ─────────────────────────────────────────────────────────────────

module.exports = {
  name,
  inject,
  version: '0.1.0',
  __internals: { settingsSchema, resolveSchema, __seedSchema, API_PREFIX, SETTINGS_NS },

  apply(ctx, config) {
    // 宿主可能过滤插件 logger 输出；console.error 走 stderr 保底可见（launchd 下进 err.log）
    const hostLogger = ctx.logger && typeof ctx.logger.warn === 'function' ? ctx.logger : null
    const logger = {
      info(m) { try { hostLogger && hostLogger.info && hostLogger.info(m) } catch {} console.error(m) },
      warn(m) { try { hostLogger && hostLogger.warn && hostLogger.warn(m) } catch {} console.error(m) },
      error(m) { try { hostLogger && hostLogger.error && hostLogger.error(m) } catch {} console.error(m) },
    }
    const webServer = ctx.webServer

    const base = engine.normalizeConfig({ ...engine.DEFAULTS, ...(config || {}) })
    let settingsScope = null
    let memoryPatch = {}
    let pwFileCache = null

    const state = { handle: null, fingerprint: '', error: null, restarting: 0, deps: 'ok' }

    const warnThrottledAt = new Map()
    function warnThrottled(key, line, ttlMs = 60000) {
      const t = Date.now()
      if (t - (warnThrottledAt.get(key) || 0) < ttlMs) return
      warnThrottledAt.set(key, t)
      logger.warn(`dsh-git-server: ${line}`)
    }

    function passwordFile() {
      return path.join(engine.resolveDataDir(base.dataDir || ''), 'custom', 'admin-password.txt')
    }
    function readPasswordFile() {
      if (pwFileCache !== null) return pwFileCache
      try { pwFileCache = fs.readFileSync(passwordFile(), 'utf8').trim() } catch { pwFileCache = '' }
      return pwFileCache
    }
    function writePasswordFile(pw) {
      try {
        fs.mkdirSync(path.dirname(passwordFile()), { recursive: true })
        fs.writeFileSync(passwordFile(), pw + '\n', { mode: 0o600 })
        pwFileCache = pw
      } catch (e) {
        logger.warn(`dsh-git-server: 管理员密码文件写入失败: ${(e && e.message) || e}`)
      }
    }

    /** 确保管理员密码存在：settings → 密码文件（已有的先采纳）→ 自动生成。 */
    async function ensureAdminPassword(cfg) {
      if (cfg.adminPassword) return
      const fromFile = readPasswordFile()
      if (fromFile) {
        memoryPatch.adminPassword = fromFile
        cfg.adminPassword = fromFile
        return
      }
      const pw = engine.generateSecret().slice(0, 20)
      if (settingsScope && typeof settingsScope.update === 'function') {
        try {
          await settingsScope.update({ adminPassword: pw })
        } catch (e) {
          logger.warn(`dsh-git-server: 管理员密码写入 settings 失败，退回文件: ${(e && e.message) || e}`)
          memoryPatch.adminPassword = pw
          writePasswordFile(pw)
        }
      } else {
        memoryPatch.adminPassword = pw
        writePasswordFile(pw)
      }
      cfg.adminPassword = pw
    }

    // ── 用户桥：dsh 会话 → kernel 用户（建号）→ kernel 个人令牌（按人缓存） ──
    const userTokens = new Map() // username → { pw, token }（子进程重启由 reconcile 清空）
    async function kernelTokenFor(cfg, username) {
      const hit = userTokens.get(username)
      if (hit && hit.pw === cfg.adminPassword) return hit.token
      // 1) 影子建号（kernel 侧按 UM profile 同名开户；幂等）
      await fetch(`http://127.0.0.1:${cfg.port}/api/web/user/dsh-impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Dsh-Secret': cfg.impersonateSecret },
        body: new URLSearchParams({ username }).toString(),
      }).catch(() => {})
      // 2) 管理员 basic 为该用户铸个人令牌（此后所有 API 以本人身份执行）
      const res = await fetch(`http://127.0.0.1:${cfg.port}/api/v1/users/${encodeURIComponent(username)}/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`root:${cfg.adminPassword}`).toString('base64'),
        },
        body: JSON.stringify({ name: 'dsh-' + Date.now().toString(36) }),
      })
      if (res.status !== 200 && res.status !== 201) throw new Error(`铸用户令牌失败(${username}): ${res.status}`)
      const token = ((await res.json()) || {}).sha1
      userTokens.set(username, { pw: cfg.adminPassword, token })
      return token
    }
    async function kernelApi(cfg, username, method, path, body) {
      const token = await kernelTokenFor(cfg, username)
      const headers = { Authorization: `token ${token}` }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      const res = await fetch(`http://127.0.0.1:${cfg.port}/api/v1${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      return { status: res.status, json }
    }
    function umUsernameOf(req) {
      // 网关链路：um_session 由网关代理以 x-um-session 头转发（cookie 被其
      // 替换为 dsh-auth）；直连链路：cookie 里带 um_session。两者都查。
      const hdr = req.headers['x-um-session']
      const m = hdr ? [null, String(hdr)] : String(req.headers.cookie || '').match(/um_session=([^;]+)/)
      if (!m) return null
      return umUsernameForSession(decodeURIComponent(m[1]))
    }

    // ── ts-gogs 管理桥：用 root:adminPassword 铸 token，代理仓库管理 ──────
    let adminTokenCache = null
    async function adminToken(cfg) {
      if (adminTokenCache && adminTokenCache.pw === cfg.adminPassword) return adminTokenCache.token
      const auth = 'Basic ' + Buffer.from(`root:${cfg.adminPassword}`).toString('base64')
      const res = await fetch(`http://127.0.0.1:${cfg.port}/api/v1/users/root/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ name: 'dsh-settings-' + Date.now().toString(36) }),
      })
      if (res.status !== 200 && res.status !== 201) throw new Error(`铸管理令牌失败: ${res.status}`)
      const token = ((await res.json()) || {}).sha1
      adminTokenCache = { pw: cfg.adminPassword, token }
      return token
    }
    async function gogsApi(cfg, method, path, body) {
      const token = await adminToken(cfg)
      const headers = { Authorization: `token ${token}` }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      const res = await fetch(`http://127.0.0.1:${cfg.port}/api/v1${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      return { status: res.status, json, text }
    }

    function impersonateFile() {
      return path.join(engine.resolveDataDir(base.dataDir || ''), 'custom', 'impersonate-secret.txt')
    }
    function readImpersonateFile() {
      try { return fs.readFileSync(impersonateFile(), 'utf8').trim() } catch { return '' }
    }
    function writeImpersonateFile(v) {
      try {
        fs.mkdirSync(path.dirname(impersonateFile()), { recursive: true })
        fs.writeFileSync(impersonateFile(), v + '\n', { mode: 0o600 })
      } catch (e) {
        logger.warn(`dsh-git-server: impersonate secret 文件写入失败: ${(e && e.message) || e}`)
      }
    }
    async function ensureImpersonateSecret(cfg) {
      if (cfg.impersonateSecret) return
      const fromFile = readImpersonateFile()
      const pw = fromFile || engine.generateSecret()
      memoryPatch.impersonateSecret = pw
      cfg.impersonateSecret = pw
      if (fromFile) return
      if (settingsScope && typeof settingsScope.update === 'function') {
        try { await settingsScope.update({ impersonateSecret: pw }) } catch (e) {
          logger.warn(`dsh-git-server: impersonate secret 写入 settings 失败，退回文件: ${(e && e.message) || e}`)
          writeImpersonateFile(pw)
        }
      } else writeImpersonateFile(pw)
    }

    // dsh 会话（um_session cookie）→ user-management 用户名
    let umSessionsCache = null
    let umSessionsStamp = null
    function umUsernameForSession(token) {
      const file = path.join(engine.dshHome(), 'user-management', 'sessions.json')
      let stamp = null
      try { const st = fs.statSync(file); stamp = `${st.mtimeMs}:${st.size}` } catch { return null }
      if (stamp !== umSessionsStamp || !umSessionsCache) {
        try {
          umSessionsCache = JSON.parse(fs.readFileSync(file, 'utf8')).tokens || {}
          umSessionsStamp = stamp
        } catch { umSessionsCache = {} }
      }
      const rec = umSessionsCache[token]
      if (!rec || (rec.expiresAt && rec.expiresAt < Date.now())) return null
      return rec.username || null
    }

    function umAvailability(cfg) {
      const mod = engine.locateUmStore()
      if (!mod) return 'missing'
      try { fs.statSync(mod); return 'ok' } catch { return 'missing' }
    }

    function status() {
      const cfg = engine.normalizeConfig(effective())
      const lan = require('node:os').networkInterfaces()
      let lanIp = null
      for (const list of Object.values(lan)) {
        for (const ni of list || []) {
          if (ni.family === 'IPv4' && !ni.internal) { lanIp = ni.address; break }
        }
        if (lanIp) break
      }
      const openToLan = cfg.host === '0.0.0.0' || cfg.host === '::'
      const urlHost = openToLan ? (lanIp || '127.0.0.1') : cfg.host
      return {
        ok: true,
        running: Boolean(state.handle),
        pid: state.handle ? state.handle.pid : null,
        enabled: cfg.enabled,
        error: state.error,
        host: cfg.host,
        port: cfg.port,
        urlLocal: `http://127.0.0.1:${cfg.port}/`,
        urlLan: openToLan && lanIp ? `http://${lanIp}:${cfg.port}/` : null,
        urlDisplay: `http://${urlHost}:${cfg.port}/`,
        dataDir: cfg.dataDir,
        umAvailable: umAvailability(cfg),
        adminUser: 'root',
        adminPassword: cfg.adminPassword || readPasswordFile(),
        crashes: state.restarting,
        deps: state.deps,
      }
    }

    function effective() {
      const fromSettings = settingsScope && typeof settingsScope.get === 'function'
        ? settingsScope.get()
        : null
      return engine.normalizeConfig({ ...base, ...(fromSettings || {}), ...memoryPatch })
    }

    let restartTimer = null
    /** 配置协调器：指纹变化才重启子进程；enabled=false 则停机。 */
    async function reconcile() {
      const cfg = engine.normalizeConfig(effective())
      if (state.retryAt && Date.now() < state.retryAt) return status()
      await ensureAdminPassword(cfg)
      await ensureImpersonateSecret(cfg)
      const fp = engine.serverFingerprint(cfg)
      if (fp === state.fingerprint) return status()

      if (!cfg.enabled) {
        if (state.handle) { await state.handle.stop(); state.handle = null }
        state.fingerprint = fp
        state.error = null
        logger.info('dsh-git-server: 已停用，git 服务器子进程关闭')
        return status()
      }

      state.fingerprint = fp // 先记账防并发重建；失败时错误落在 state.error
      userTokens.clear()
      if (state.handle) { await state.handle.stop(); state.handle = null }
      try {
        // 依赖自检/自动安装的日志始终可见；子进程自身输出仅在 verbose 模式转发
        await engine.ensureDeps({ logger: (line) => logger.info(`dsh-git-server: ${line}`) })
        state.deps = 'ok'
        const handle = await engine.start(cfg, {
          logger: (line) => { if (process.env.DSH_GIT_SERVER_VERBOSE) logger.info(`dsh-git-server: ${line}`) },
        })
        handle.onExit(({ code, stderrTail }) => {
          // 意外退出：清指纹让 reconciler 的下一跳（3s）自动拉起
          if (state.handle === handle) state.handle = null
          state.fingerprint = ''
          state.restarting++
          logger.warn(`dsh-git-server: ts-gogs 意外退出 code=${code}，3s 后自动拉起\n${(stderrTail || '').slice(-400)}`)
        })
        state.handle = handle
        state.error = null
        logger.info(
          `dsh-git-server: Git 服务器 http://${cfg.host}:${cfg.port}/ ` +
            `auth=${cfg.authMode === 'user-management' ? 'user-management' : 'gogs'} dataDir=${cfg.dataDir}`,
        )
      } catch (e) {
        const msg = String((e && e.message) || e)
        // 失败后清指纹 + 30s 退避，让心跳自动重试（in-flight 去重防并发装）
        state.handle = null
        state.fingerprint = ''
        state.retryAt = Date.now() + 30000
        if (/依赖自动安装/.test(msg)) {
          state.deps = 'failed'
          state.error = msg
          logger.warn('dsh-git-server: ' + msg + '（30s 后自动重试）')
        } else {
          state.deps = 'ok'
          state.error = msg
          logger.error('dsh-git-server: ' + msg)
        }
      }
      return status()
    }

    // ── settings 注册（异步；缺席不阻塞宿主半其余功能）───────────────────
    ;(async () => {
      const Schema = await resolveSchema()
      if (Schema && ctx.settings && typeof ctx.settings.register === 'function') {
        try {
          settingsScope = ctx.settings.register(SETTINGS_NS, settingsSchema(Schema), { base })
          logger.info('dsh-git-server: settings-registered')
        } catch (e) {
          logger.warn(`dsh-git-server: settings register 失败（仅 loader config 生效）: ${(e && e.message) || e}`)
        }
      } else {
        logger.warn(
          `dsh-git-server: settings 不可用（Schema=${Boolean(Schema)}, ctx.settings=${Boolean(ctx.settings)}）——配置退回进程内兜底`,
        )
      }
      await reconcile()
    })().catch((e) => logger.error(`dsh-git-server: init: ${(e && e.message) || e}`))

    // ── 同源 API：status / settings ─────────────────────────────────────
    function repoCard(x, actor) {
      return {
        id: x.id, name: x.name, owner: (x.owner && (x.owner.login || x.owner.username)) || '',
        fullName: x.full_name, private: !!x.private,
        stars: x.stars_count || 0, issues: x.open_issues_count || 0, forks: x.forks_count || 0,
        description: x.description || '',
      }
    }
    function errText(r) {
      const j = r.json
      if (j && j.message) return String(j.message)
      if (Array.isArray(j) && j[0] && j[0].message) return j[0].message
      return 'kernel ' + r.status
    }

    function sendJson(res, statusCode, payloadOut) {
      const body = JSON.stringify(payloadOut)
      res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
      })
      res.end(body)
    }

    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > 64 * 1024) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    if (webServer && typeof webServer.register === 'function') {
      ctx.effect(() => {
        webServer.register({
          kind: 'prefix',
          path: API_PREFIX,
          handler: async (req, res) => {
            const url = new URL(req.url || '/', 'http://dsh.local')
            const rest = url.pathname.slice(API_PREFIX.length)
            try {
              if (req.method === 'GET' && (rest === '' || rest === '/' || rest === '/status')) {
                sendJson(res, 200, status())
                return
              }
              const cfg = engine.normalizeConfig(effective())
              const actor = umUsernameOf(req) // dsh 会话 → 操作者本人
              if (!actor) { sendJson(res, 401, { ok: false, error: '需要 dsh 登录' }); return }
              const parts = rest.split('/').filter(Boolean) // dsh|repos,o,r,what...

              // GET /me — 本人 + 仓库列表
              if (req.method === 'GET' && (rest === '/me' || rest === '' || rest === '/')) {
                const me = await kernelApi(cfg, actor, 'GET', '/user')
                const repos = await kernelApi(cfg, actor, 'GET', '/user/repos')
                sendJson(res, 200, {
                  ok: true,
                  user: { name: actor, isAdmin: !!(me.json && me.json.is_admin) },
                  repos: Array.isArray(repos.json) ? repos.json.map((x) => repoCard(x)) : [],
                })
                return
              }
              // POST /repos — 建仓（本人身份）
              if (req.method === 'POST' && rest === '/repos') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const name = String(body.name || '').trim()
                if (!name) { sendJson(res, 400, { ok: false, error: '仓库名不能为空' }); return }
                const r = await kernelApi(cfg, actor, 'POST', '/user/repos',
                  { name, private: !!body.private, auto_init: body.autoInit !== false, readme: 'Default' })
                sendJson(res, r.status === 201 ? 200 : r.status,
                  r.status === 201 ? { ok: true, repo: repoCard(r.json, actor) } : { ok: false, error: errText(r) })
                return
              }
              // DELETE /repos/:owner/:name
              const delM = req.method === 'DELETE' && rest.startsWith('/repos/') && rest.split('/').length === 4
              if (delM) {
                const [, , owner, name] = rest.split('/')
                const r = await kernelApi(cfg, actor, 'DELETE', `/repos/${owner}/${name}`)
                sendJson(res, [200, 204].includes(r.status) ? 200 : r.status,
                  [200, 204].includes(r.status) ? { ok: true } : { ok: false, error: '删除失败（无权限或不存在）' })
                return
              }
              // GET /repos/:o/:r/tree|raw|commits|branches|issues...
              if (req.method === 'GET' && parts[0] === 'repos' && parts.length >= 4) {
                const [, owner, repo, ...tail] = parts
                const what = tail.join('/')
                const q = (n) => url.searchParams.get(n) || ''
                if (what === 'tree') {
                  const pth = q('path') ? '?ref=' + encodeURIComponent(q('ref') || '') + '&path=' + encodeURIComponent(q('path'))
                    : '?ref=' + encodeURIComponent(q('ref') || '')
                  const r = await kernelApi(cfg, actor, 'GET', `/repos/${owner}/${repo}/contents${pth}`)
                  sendJson(res, r.status, Array.isArray(r.json)
                    ? { ok: true, entries: r.json.map((e) => ({ name: e.name, type: e.type, path: e.path, size: e.size })) }
                    : { ok: false, error: errText(r) })
                  return
                }
                if (what === 'raw') {
                  const r = await kernelApi(cfg, actor, 'GET',
                    `/repos/${owner}/${repo}/raw/${encodeURIComponent(q('ref'))}/${q('path').split('/').map(encodeURIComponent).join('/')}`)
                  // raw 端点返回文本（非 JSON）
                  const res2 = await fetch(`http://127.0.0.1:${cfg.port}/api/v1/repos/${owner}/${repo}/raw/${encodeURIComponent(q('ref'))}/${q('path').split('/').map(encodeURIComponent).join('/')}`,
                    { headers: { Authorization: 'token ' + await kernelTokenFor(cfg, actor) } })
                  const text = await res2.text()
                  sendJson(res, 200, { ok: res2.status === 200, text: res2.status === 200 ? text.slice(0, 512 * 1024) : '', error: res2.status === 200 ? null : 'not found' })
                  return
                }
                if (what === 'commits') {
                  const r = await kernelApi(cfg, actor, 'GET', `/repos/${owner}/${repo}/commits${q('ref') ? '?sha=' + encodeURIComponent(q('ref')) : ''}`)
                  const list = Array.isArray(r.json) ? r.json : (r.json && r.json.data) || []
                  sendJson(res, r.status, { ok: Array.isArray(list), commits: (Array.isArray(list) ? list : []).slice(0, 30).map((c) => ({
                    sha: (c.sha || '').slice(0, 10), message: (c.commit && c.commit.message) || c.message || '',
                    author: (c.author && (c.author.login || c.author.name)) || (c.commit && c.commit.author && c.commit.author.name) || '',
                    date: (c.commit && c.commit.author && c.commit.author.date) || c.created_at || '',
                  })) })
                  return
                }
                if (what === 'branches') {
                  const r = await kernelApi(cfg, actor, 'GET', `/repos/${owner}/${repo}/branches`)
                  sendJson(res, r.status, { ok: Array.isArray(r.json), branches: (Array.isArray(r.json) ? r.json : []).map((b) => ({ name: b.name, sha: (b.commit && b.commit.id) || b.sha })) })
                  return
                }
                if (what === 'issues') {
                  const state = q('state') || 'open'
                  const r = await kernelApi(cfg, actor, 'GET', `/repos/${owner}/${repo}/issues?state=${state}&type=issues`)
                  sendJson(res, r.status, { ok: Array.isArray(r.json), issues: (Array.isArray(r.json) ? r.json : []).map((i) => ({
                    number: i.number, title: i.title, state: i.state, user: i.user && i.user.login,
                    comments: i.comments, updatedAt: i.updated_at,
                  })) })
                  return
                }
                if (what.startsWith('issues/') && tail.length === 3) {
                  // issues/:idx/comments
                  const idx = tail[1]
                  if (tail[2] === 'comments') {
                    const r = await kernelApi(cfg, actor, 'GET', `/repos/${owner}/${repo}/issues/${idx}/comments`)
                    sendJson(res, r.status, { ok: Array.isArray(r.json), comments: (Array.isArray(r.json) ? r.json : []).map((c) => ({
                      id: c.id, body: c.body, user: c.user && c.user.login, created: c.created_at,
                    })) })
                    return
                  }
                }
              }
              // POST /repos/:o/:r/issues — 建工单
              if (req.method === 'POST' && parts[0] === 'repos' && parts[3] === 'issues' && parts.length === 4) {
                const [, owner, repo] = parts
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = await kernelApi(cfg, actor, 'POST', `/repos/${owner}/${repo}/issues`, {
                  title: String(body.title || ''), body: String(body.body || ''),
                  ...(Array.isArray(body.labels) ? { labels: body.labels } : {}),
                  ...(body.milestone ? { milestone: body.milestone } : {}),
                  ...(body.assignee ? { assignee: body.assignee } : {}),
                })
                sendJson(res, r.status === 201 ? 200 : r.status, r.status === 201 ? { ok: true } : { ok: false, error: errText(r) })
                return
              }
              // POST /repos/:o/:r/issues/:idx/comments
              if (req.method === 'POST' && parts[0] === 'repos' && parts[3] === 'issues' && parts[5] === 'comments') {
                const [, owner, repo, , idx] = parts
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = await kernelApi(cfg, actor, 'POST', `/repos/${owner}/${repo}/issues/${idx}/comments`, { body: String(body.body || '') })
                sendJson(res, r.status === 201 ? 200 : r.status, r.status === 201 ? { ok: true } : { ok: false, error: errText(r) })
                return
              }
              // /dsh/*：宿主进程内直接执行内核 dshapi（省铸令牌+HTTP 跳转）。
              // 异常/未匹配路由回退到原来的 HTTP 转发，保证任何内核端点仍可到达。
              if (parts && parts[0] === 'dsh') {
                try {
                  const token = await kernelTokenFor(cfg, actor)
                  const { dispatch } = require('./dsh-host')
                  const handled = await dispatch(cfg, actor, req.method, rest, req, res, token)
                  if (handled) return
                } catch (e) {
                  sendJson(res, 502, { ok: false, error: 'in-process dispatch failed: ' + String((e && e.message) || e) })
                  return
                }
                // 未匹配（理论上不会发生——dshapi 的路由全注册了）则回退透传
                const kernelPath = '/api' + (rest.startsWith('/') ? rest : '/' + rest) + (url.search || '')
                try {
                  const token = await kernelTokenFor(cfg, actor)
                  const headers = { Authorization: 'token ' + token }
                  let bodyStr
                  if (req.method !== 'GET' && req.method !== 'HEAD') {
                    bodyStr = await readBody(req)
                    headers['Content-Type'] = 'application/json'
                  }
                  const upstream = await fetch(`http://127.0.0.1:${cfg.port}${kernelPath}`, {
                    method: req.method, headers, body: bodyStr,
                  })
                  const text = await upstream.text()
                  let json = null
                  try { json = JSON.parse(text) } catch { json = { ok: false, error: text.slice(0, 200) } }
                  sendJson(res, upstream.status, json)
                } catch (e) {
                  sendJson(res, 502, { ok: false, error: String((e && e.message) || e) })
                }
                return
              }

              // PATCH /repos/:o/:r/issues/:idx — 开/关工单
              if (req.method === 'PATCH' && parts[0] === 'repos' && parts[3] === 'issues' && parts.length === 5) {
                const [, owner, repo, , idx] = parts
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = await kernelApi(cfg, actor, 'PATCH', `/repos/${owner}/${repo}/issues/${idx}`, { state: body.state === 'closed' ? 'closed' : 'open' })
                sendJson(res, r.status === 201 || r.status === 200 ? 200 : r.status, { ok: [200, 201].includes(r.status) })
                return
              }

              if (req.method === 'PUT' && rest === '/settings') {
                let patchBody = null
                try {
                  patchBody = JSON.parse((await readBody(req)) || '{}')
                } catch {
                  sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
                  return
                }
                const patch = engine.sanitizePatch(patchBody, effective())
                memoryPatch = { ...memoryPatch, ...patch }
                if (typeof patch.adminPassword === 'string' && patch.adminPassword) writePasswordFile(patch.adminPassword)
                if (settingsScope && typeof settingsScope.update === 'function') {
                  try {
                    await settingsScope.update(patch)
                  } catch (e) {
                    logger.warn(`dsh-git-server: settings update 失败（仅本次进程生效）: ${(e && e.message) || e}`)
                  }
                }
                await reconcile()
                sendJson(res, 200, status())
                return
              }
              sendJson(res, 404, { ok: false, error: 'not found' })
            } catch (e) {
              try { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }) } catch {}
            }
          },
        })
      }, 'dsh-git-server: api route')
    } else {
      logger.warn('dsh-git-server: webServer 不可用，设置 API 未注册')
    }

    // ── 协调器心跳：兜住手改 settings.yaml / 意外退出的自动拉起 ───────────
    ctx.effect(() => {
      restartTimer = setInterval(() => {
        reconcile().catch((e) => logger.error(`dsh-git-server: reconcile: ${(e && e.message) || e}`))
      }, 3000)
      return () => {
        clearInterval(restartTimer)
        if (state.handle) state.handle.stop().catch(() => {})
      }
    }, 'dsh-git-server: reconciler + child process')
  },
}
