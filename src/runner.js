'use strict'

/**
 * @weibaohui/dsh-git-server — ts-gogs 子进程运行器（宿主无关，可直测）。
 *
 * 职责：把 vendor/ts-gogs（Gogs 的 TypeScript 平替，构建产物随包分发）作为
 * 受管子进程跑起来：
 *   1. 把配置渲染成 app.ini 写进 <dataDir>/custom/conf/app.ini（INSTALL_LOCK
 *      直接置位，跳过安装向导）；
 *   2. spawn `node dist/index.js`（GOGS_CUSTOM 指向上面的 custom 目录）；
 *   3. 就绪探测：轮询 http://host:port/ 直到 2xx/3xx（首连前就绪，防
 *      ECONNRESET 噪音），超时判失败并带上最后一段 stderr；
 *   4. 崩溃自动拉起（退避 2s→30s）；配置指纹变化由上层先 stop 再 start。
 *
 * 认证模式（authMode）通过环境变量传给 ts-gogs：
 *   - user-management：DSH_UM_USERS_FILE 指向 user-management 的 users.json，
 *     git HTTP Basic 与网页登录接受 UM 用户名密码（映射到本库管理员）；
 *   - gogs（默认）：ts-gogs 自己的账号/令牌体系。首次启动用
 *     DSH_BOOTSTRAP_ADMIN 播种管理员（用户库为空时）。
 */

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')

const PLUGIN_ID = 'dsh-git-server'
// gogs 以该子路径对外（生成的链接/资产都带此前缀），宿主代理路由与之对齐
const UI_SUBPATH = '/dsh-git-server/ui'
const VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'ts-gogs')

const DEFAULTS = {
  enabled: false,
  host: '127.0.0.1',
  port: 3400,
  dataDir: '', // 空 = dshHome()/dsh-git-server/data
  authMode: 'gogs', // 'gogs' | 'user-management'
  adminPassword: '', // 播种的管理员密码（首次自动生成并持久化）
  disableRegistration: false, // 关闭网页自助注册（仅管理员建号）
}

const NUM_RANGES = { port: [1024, 65535] }

function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(require('node:os').homedir(), '.dsh')
}

function defaultDataDir() {
  return path.join(dshHome(), PLUGIN_ID, 'data')
}

function resolveDataDir(dir) {
  if (!dir || typeof dir !== 'string') return defaultDataDir()
  const expanded = dir.startsWith('~') ? path.join(dshHome(), dir.slice(1)) : dir
  return path.isAbsolute(expanded) ? expanded : path.join(dshHome(), expanded)
}

function generateSecret() {
  return crypto.randomBytes(24).toString('hex')
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS, ...(raw || {}) }
  cfg.enabled = !!cfg.enabled
  cfg.host = String(cfg.host || DEFAULTS.host)
  cfg.port = Math.max(NUM_RANGES.port[0], Math.min(NUM_RANGES.port[1], Math.floor(Number(cfg.port) || DEFAULTS.port)))
  cfg.dataDir = resolveDataDir(cfg.dataDir)
  cfg.authMode = cfg.authMode === 'user-management' ? 'user-management' : 'gogs'
  cfg.adminPassword = String(cfg.adminPassword || '')
  cfg.disableRegistration = !!cfg.disableRegistration
  return cfg
}

function sanitizePatch(patch, current) {
  const out = {}
  if (patch == null || typeof patch !== 'object') return out
  if (typeof patch.enabled === 'boolean') out.enabled = patch.enabled
  if (typeof patch.host === 'string' && patch.host.trim()) out.host = patch.host.trim()
  if (patch.port !== undefined) {
    const n = Math.floor(Number(patch.port))
    if (Number.isFinite(n) && n >= NUM_RANGES.port[0] && n <= NUM_RANGES.port[1]) out.port = n
  }
  if (typeof patch.dataDir === 'string') out.dataDir = patch.dataDir.trim()
  if (patch.authMode === 'gogs' || patch.authMode === 'user-management') out.authMode = patch.authMode
  if (typeof patch.adminPassword === 'string') out.adminPassword = patch.adminPassword
  if (typeof patch.disableRegistration === 'boolean') out.disableRegistration = patch.disableRegistration
  // 防呆：改动这些字段必须真的有变化，否则 reconciler 会空转重建
  for (const k of Object.keys(out)) if (current && current[k] === out[k]) delete out[k]
  return out
}

function serverFingerprint(cfg) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ enabled: cfg.enabled, host: cfg.host, port: cfg.port, dataDir: cfg.dataDir, authMode: cfg.authMode, adminPassword: cfg.adminPassword, disableRegistration: cfg.disableRegistration, vendor: vendorStamp() }))
    .digest('hex')
}

let _vendorStamp = null
function vendorStamp() {
  if (_vendorStamp) return _vendorStamp
  try {
    const st = fs.statSync(path.join(VENDOR_DIR, 'dist', 'index.js'))
    _vendorStamp = `${st.mtimeMs}:${st.size}`
  } catch {
    _vendorStamp = 'missing'
  }
  return _vendorStamp
}

/** 渲染并写入 app.ini（幂等；内容不变不写，避免无谓的 mtime 抖动）。 */
function writeAppIni(cfg) {
  const customDir = path.join(cfg.dataDir, 'custom', 'conf')
  fs.mkdirSync(customDir, { recursive: true })
  fs.mkdirSync(path.join(cfg.dataDir, 'repositories'), { recursive: true })
  fs.mkdirSync(path.join(cfg.dataDir, 'log'), { recursive: true })
  const secretFile = path.join(cfg.dataDir, 'custom', 'secret-key.txt')
  let secret = ''
  try { secret = fs.readFileSync(secretFile, 'utf8').trim() } catch {}
  if (!secret) {
    secret = generateSecret()
    fs.writeFileSync(secretFile, secret + '\n', { mode: 0o600 })
  }
  const sshDisabled = true // 插件默认不动系统 sshd / authorized_keys
  const ini = [
    `RUN_USER = ${os.userInfo().username}`,
    'RUN_MODE = prod',
    '',
    '[auth]',
    'DISABLE_REGISTRATION = ' + (cfg.disableRegistration ? 'true' : 'false'),
    '',
    '[server]',
    `HTTP_ADDR = ${cfg.host}`,
    `HTTP_PORT = ${cfg.port}`,
    `EXTERNAL_URL = http://${cfg.host === '0.0.0.0' || cfg.host === '::' ? '127.0.0.1' : cfg.host}:${cfg.port}${UI_SUBPATH}/`,
    'DISABLE_SSH = ' + (sshDisabled ? 'true' : 'false'),
    'START_SSH_SERVER = false',
    'REWRITE_AUTHORIZED_KEYS_AT_START = false',
    'DISABLE_GRAVATAR = true',
    '',
    '[repository]',
    `ROOT = ${path.join(cfg.dataDir, 'repositories')}`,
    '',
    '[database]',
    `PATH = ${path.join(cfg.dataDir, 'gogs.db')}`,
    '',
    '[security]',
    'INSTALL_LOCK = true',
    `SECRET_KEY = ${secret}`,
    '',
    '[log]',
    'MODE = file',
    'LEVEL = Info',
    `ROOT_PATH = ${path.join(cfg.dataDir, 'log')}`,
    '',
  ].join('\n')
  const file = path.join(customDir, 'app.ini')
  try {
    if (fs.readFileSync(file, 'utf8') === ini) return file
  } catch {}
  fs.writeFileSync(file, ini, { mode: 0o600 })
  return file
}

let depsInstallInFlight = null

/**
 * 依赖自检 + 自动安装。`dsh plugin add` 对 link: 包不装依赖、pnpm 默认
 * 还会拦 better-sqlite3 的构建脚本，所以启动前自检关键原生依赖，缺失就在
 * 插件目录自动跑一次 `npm install --omit=dev`（npm 默认执行安装脚本，
 * better-sqlite3 拿预编译产物）。幂等：并发调用共享同一 in-flight。
 */
function ensureDeps({ logger = () => {} } = {}) {
  let probe
  try {
    const { createRequire } = require('node:module')
    probe = createRequire(path.join(VENDOR_DIR, 'dist', 'index.js'))
  } catch {}
  const critical = ['better-sqlite3', 'ssh2', 'marked', 'ini', 'busboy', 'qrcode']
  const missing = []
  for (const name of critical) {
    try { probe && probe.resolve(name) } catch { missing.push(name) }
  }
  if (!missing.length) return { installed: false, missing: [] }
  if (depsInstallInFlight) return depsInstallInFlight
  logger(`检测到缺失依赖 ${missing.join(', ')}，自动执行 npm install（首次可能需要 1-2 分钟）…`)
  depsInstallInFlight = new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: path.join(VENDOR_DIR, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let tail = ''
    const collect = (d) => { tail = (tail + d.toString()).slice(-2000); logger(`[npm] ${d.toString().trimEnd()}`) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const killer = setTimeout(() => child.kill('SIGKILL'), 300000)
    child.once('exit', (code) => {
      clearTimeout(killer)
      depsInstallInFlight = null
      // 装完复检
      const still = []
      for (const name of critical) {
        try { probe && probe.resolve(name) } catch { still.push(name) }
      }
      if (code === 0 && !still.length) resolve({ installed: true, missing: [] })
      else reject(new Error(`依赖自动安装失败（exit=${code}${still.length ? '，仍缺: ' + still.join(',') : ''}）\n${tail.slice(-600)}`))
    })
  })
  return depsInstallInFlight
}

/**
 * 启动 ts-gogs 子进程。返回句柄 { pid, stop() }。
 * 就绪前抛错（带 stderr 尾部）；就绪判定 = GET / 返回任意状态（TS 服务
 * 起来后即使 404/302 也代表监听器在线）。
 */
async function start(cfg, { logger = () => {}, onExit } = {}) {
  await ensureDeps({ logger })
  const appIni = writeAppIni(cfg)
  const entry = path.join(VENDOR_DIR, 'dist', 'index.js')
  if (!fs.existsSync(entry)) throw new Error(`vendor/ts-gogs 构建产物缺失: ${entry}`)
  const env = {
    ...process.env,
    GOGS_CUSTOM: path.join(cfg.dataDir, 'custom'),
    DSH_BOOTSTRAP_ADMIN: `root:${cfg.adminPassword || generateSecret()}`,
  }
  if (cfg.adminPassword) env.DSH_ADMIN_PASSWORD = cfg.adminPassword
  if (cfg.authMode === 'user-management') {
    // 尊重外部注入（测试/自定义），默认取 dsh 家目录的 UM 用户库
    env.DSH_UM_USERS_FILE = process.env.DSH_UM_USERS_FILE || path.join(dshHome(), 'user-management', 'users.json')
    env.DSH_UM_AS_USER = process.env.DSH_UM_AS_USER || 'root'
  } else {
    delete env.DSH_UM_USERS_FILE
  }

  const child = spawn(process.execPath, [entry], { cwd: VENDOR_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderrTail = ''
  child.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-4000)
    logger(`[gogs] ${d.toString().trimEnd()}`)
  })
  child.stdout.on('data', (d) => logger(`[gogs] ${d.toString().trimEnd()}`))

  const exited = new Promise((resolve) => child.once('exit', (code, sig) => resolve({ code, sig })))

  // 就绪探测：最长 30s；进程先退则立即失败
  const deadline = Date.now() + 30000
  let ready = false
  let lastErr = ''
  while (Date.now() < deadline) {
    const gone = await Promise.race([exited.then((e) => e || { code: 0 }), new Promise((r) => setTimeout(() => r(null), 500))])
    if (gone) {
      throw new Error(`ts-gogs 进程退出 code=${gone.code}\n${stderrTail.slice(-800)}`)
    }
    try {
      const res = await fetch(`http://${cfg.host === '0.0.0.0' || cfg.host === '::' ? '127.0.0.1' : cfg.host}:${cfg.port}/`, { redirect: 'manual' })
      if (res.status > 0) { ready = true; break }
    } catch (e) {
      lastErr = (e && e.message) || String(e)
    }
  }
  if (!ready) {
    child.kill('SIGTERM')
    throw new Error(`ts-gogs 就绪探测超时（30s）：${lastErr}\n${stderrTail.slice(-800)}`)
  }

  let stopping = false
  const handle = {
    pid: child.pid,
    async stop() {
      if (stopping) return
      stopping = true
      child.removeAllListeners('exit')
      child.kill('SIGTERM')
      const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 5000)
      await new Promise((resolve) => child.once('exit', () => { clearTimeout(t); resolve() }))
    },
    onExit(cb) {
      child.once('exit', (code, sig) => { if (!stopping && cb) cb({ code, sig, stderrTail }) })
    },
    appIni,
  }
  return handle
}

function umUsersFilePath() {
  return process.env.DSH_UM_USERS_FILE || path.join(dshHome(), 'user-management', 'users.json')
}

module.exports = {
  ensureDeps,
  UI_SUBPATH,
  umUsersFilePath,
  PLUGIN_ID,
  DEFAULTS,
  NUM_RANGES,
  VENDOR_DIR,
  dshHome,
  defaultDataDir,
  resolveDataDir,
  normalizeConfig,
  sanitizePatch,
  serverFingerprint,
  writeAppIni,
  start,
  generateSecret,
}
