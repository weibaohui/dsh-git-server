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
      umGogsSession = null
      perUserSessions.clear()
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

    // ── 完整界面反代：/dsh-git-server/ui/* → 内嵌 ts-gogs ────────────────
    // 浏览器统一从 dsh 访问 git 网页端（dsh 门禁认证），不再直连插件端口。
    // git 客户端仍可直连 <host>:<port>（CLI 凭据简单，走门禁反而不兼容）。
    // user-management 模式下代理自动注入 gogs 会话（root 已是 UM 凭据的映射
    // 身份）——内嵌界面免二次登录；用户自己登录过则保留其会话。
    let umGogsSession = null // 兼容字段：子进程重启后由 reconcile 清空
    const perUserSessions = new Map() // um_session token → gogs 会话 cookie
    async function gogsSessionCookie(cfg, reqCookie) {
      if (reqCookie && /i_like_gogs=/.test(reqCookie)) return null // 已有 gogs 会话，不覆盖
      // dsh 会话（um_session）→ 用户名 → 铸同名的 gogs 会话（账户 1:1）
      const umToken = (reqCookie || '').match(/um_session=([^;]+)/)
      if (!umToken) return null
      const username = umUsernameForSession(decodeURIComponent(umToken[1]))
      if (!username) return null
      const cacheKey = umToken[1]
      const hit = perUserSessions.get(cacheKey)
      if (hit) return hit
      try {
        const res = await fetch(`http://127.0.0.1:${cfg.port}/api/web/user/dsh-impersonate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Dsh-Secret': cfg.impersonateSecret },
          body: new URLSearchParams({ username }).toString(),
        })
        const m = (res.headers.get('set-cookie') || '').match(/i_like_gogs=[^;]+/)
        if (!m) return null
        perUserSessions.set(cacheKey, m[0])
        return m[0]
      } catch {
        return null
      }
    }

    // ── 完整界面反代：/dsh-git-server/ui/* → 内嵌 ts-gogs ────────────────
    // 浏览器统一从 dsh 访问 git 网页端（dsh 门禁认证），不再直连插件端口。
    // git 客户端仍可直连 <host>:<port>（CLI 凭据简单，走门禁反而不兼容）。
    // user-management 模式下自动注入 gogs 会话（root 是 UM 凭据的映射身份），
    // 内嵌界面免二次登录；用户自己登录过则保留其会话。
    async function proxyUi(req, res) {
      const cfg = engine.normalizeConfig(effective())
      const url = new URL(req.url || '/', 'http://dsh.local')
      const targetPath = url.pathname + url.search // 已带 /dsh-git-server/ui 前缀（= 子进程子路径）
      const sess = await gogsSessionCookie(cfg, req.headers.cookie)
      const headers = { ...req.headers }
      headers.host = `127.0.0.1:${cfg.port}`
      headers['x-dsh-proxy'] = '1'
      delete headers['content-length']
      delete headers.connection
      if (sess) headers.cookie = headers.cookie ? headers.cookie + '; ' + sess : sess

      await new Promise((resolve) => {
        const up = require('node:http').request(
          { host: '127.0.0.1', port: cfg.port, path: targetPath, method: req.method, headers },
          (ur) => {
            const outHeaders = {}
            for (const [k, v] of Object.entries(ur.headers)) {
              if (['connection', 'transfer-encoding', 'content-security-policy', 'x-frame-options'].includes(k)) continue
              outHeaders[k] = v
            }
            res.writeHead(ur.statusCode || 502, outHeaders)
            ur.on('data', (c) => { if (!res.write(c)) ur.pause() })
            res.on('drain', () => ur.resume())
            ur.on('end', () => res.end())
            ur.on('error', () => { try { res.end() } catch {} })
            resolve()
          },
        )
        up.on('error', (e) => {
          try {
            res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('dsh-git-server: Git 服务器未运行 — 请在设置里启用')
          } catch {}
          resolve()
        })
        req.on('error', () => up.destroy())
        req.pipe(up)
      })
    }

    if (webServer && typeof webServer.register === 'function') {
      ctx.effect(() => {
        webServer.register({
          kind: 'prefix',
          path: engine.UI_SUBPATH,
          handler: (req, res) => { proxyUi(req, res).catch((e) => logger.error('dsh-git-server: proxy: ' + ((e && e.message) || e))) },
        })
      }, 'dsh-git-server: ui proxy route')
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
              if (req.method === 'GET' && rest === '/repos') {
                const cfg = engine.normalizeConfig(effective())
                if (!state.handle) { sendJson(res, 200, { ok: true, repos: [] }); return }
                const list = await gogsApi(cfg, 'GET', '/user/repos')
                const repos = (Array.isArray(list.json) ? list.json : []).map((x) => ({
                  id: x.id, name: x.name, fullName: x.full_name || x.name,
                  private: !!x.private, htmlUrl: x.html_url || x.clone_url,
                  cloneUrl: `http://${cfg.host === '0.0.0.0' ? '127.0.0.1' : cfg.host}:${cfg.port}/${x.full_name || x.name}.git`,
                  stars: x.stars_count, issues: x.open_issues_count,
                }))
                sendJson(res, 200, { ok: true, repos })
                return
              }
              if (req.method === 'POST' && rest === '/repos') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const cfg = engine.normalizeConfig(effective())
                const name = String(body.name || '').trim()
                if (!name) { sendJson(res, 400, { ok: false, error: '仓库名不能为空' }); return }
                const r = await gogsApi(cfg, 'POST', '/user/repos', { name, private: !!body.private, auto_init: body.autoInit !== false, readme: 'Default' })
                sendJson(res, r.status === 201 ? 201 : r.status, r.status === 201 ? { ok: true, repo: r.json } : { ok: false, error: (r.json && r.json.message) || '创建失败' })
                return
              }
              if (req.method === 'DELETE' && rest.startsWith('/repos/')) {
                const full = decodeURIComponent(rest.slice('/repos/'.length)).replace(/\.git$/, '')
                const cfg = engine.normalizeConfig(effective())
                const r = await gogsApi(cfg, 'DELETE', `/repos/root/${full}`)
                sendJson(res, [200, 204].includes(r.status) ? 200 : r.status, [200, 204].includes(r.status) ? { ok: true } : { ok: false, error: '删除失败' })
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
