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
    authMode: Schema.string().default(engine.DEFAULTS.authMode),
    adminPassword: Schema.string().default(engine.DEFAULTS.adminPassword),
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

    const state = { handle: null, fingerprint: '', error: null, restarting: 0 }

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

    function umAvailability(cfg) {
      if (cfg.authMode !== 'user-management') return null
      const file = engine.umUsersFilePath()
      try { return fs.statSync(file) ? 'ok' : 'missing' } catch { return 'missing' }
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
        authMode: cfg.authMode,
        umAvailable: umAvailability(cfg),
        adminUser: 'root',
        adminPassword: cfg.adminPassword || readPasswordFile(),
        crashes: state.restarting,
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
      await ensureAdminPassword(cfg)
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
      if (state.handle) { await state.handle.stop(); state.handle = null }
      try {
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
        state.error = String((e && e.message) || e)
        logger.error('dsh-git-server: ' + state.error)
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
