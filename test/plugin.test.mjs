// dsh-git-server 插件合约测试（node --test）。
// 覆盖：配置归一化/白名单补丁、app.ini 渲染、子进程启动→就绪→git 操作→
// user-management 凭据→停止 的完整链路（真实 vendor/ts-gogs 子进程）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = (await import('../src/index.js')).default
const runner = await import('../src/runner.js')

function testHost() {
  // 极简宿主：只实现插件用到的 settings/webServer/slots 形状
  const registered = { settings: null, routes: [] }
  return {
    registered,
    webServer: { register: (r) => registered.routes.push(r) },
    settings: {
      register(ns, schema, opts) {
        let data = { ...(opts && opts.base) }
        registered.settings = {
          get: () => data,
          update: async (patch) => { data = { ...data, ...patch } },
        }
        return registered.settings
      },
    },
    _cleanups: [],
    effect(fn) { try { const c = fn && fn(); if (typeof c === 'function') this._cleanups.push(c) } catch {} },
    logger: { info() {}, warn() {}, error() {} },
  }
}

test('normalizeConfig: 默认值与范围收敛', () => {
  const cfg = runner.normalizeConfig({})
  assert.equal(cfg.enabled, true)
  assert.equal(cfg.host, '0.0.0.0')
  assert.equal(cfg.port, 3400)
  assert.ok(cfg.dataDir.includes('dsh-git-server'))
  const bad = runner.normalizeConfig({ port: 80 })
  assert.ok(bad.port >= 1024)
})

test('sanitizePatch: 只收白名单且跳过无变化字段', () => {
  const cur = runner.normalizeConfig({ port: 3400, dataDir: '/a' })
  // host 已从白名单移除（监听地址写死 0.0.0.0，不再是设置项）；junk 非白名单；port 无变化
  const out = runner.sanitizePatch({ port: 3400, host: '9.9.9.9', dataDir: '/b', junk: 'x' }, cur)
  assert.deepEqual(out, { dataDir: '/b' })
})

test('writeAppIni: 渲染关键配置且幂等', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dgs-ini-'))
  const cfg = runner.normalizeConfig({ dataDir: dir, port: 3999, host: '127.0.0.1' })
  const file = runner.writeAppIni(cfg)
  const ini = readFileSync(file, 'utf8')
  assert.match(ini, /INSTALL_LOCK = true/)
  assert.match(ini, /HTTP_PORT = 3999/)
  assert.match(ini, /DISABLE_SSH = true/)
  assert.match(ini, new RegExp(cfg.dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const mtime = statSafe(file)
  runner.writeAppIni(cfg)
  assert.equal(statSafe(file), mtime, '内容不变不应重写')
  function statSafe(p) { try { return statSync(p).mtimeMs } catch { return 0 } }
})

test('插件 apply：注册 settings 与同源路由，disabled 不启动子进程', async () => {
  const host = testHost()
  const dataDir = mkdtempSync(join(tmpdir(), 'dgs-data-'))
  // 极简可链式 Schema 桩：boolean()/string()/number().step().min().max().default()
  const chainish = () => { const o = { default: (d) => d }; return o }
  const FakeSchema = {
    object: (def) => def,
    boolean: () => chainish(),
    string: () => chainish(),
    number: () => { const c = chainish(); c.step = () => c; c.min = () => c; c.max = () => c; return c },
  }
  plugin.__internals.__seedSchema(FakeSchema)
  plugin.apply(host, { enabled: false, dataDir })
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(host.registered.settings, 'settings 未注册')
  assert.equal(host.registered.routes.length, 1)
  assert.deepEqual(host.registered.routes.map((r) => r.path),
    ['/dsh-git-server/api'])
  // status 路由不应启动子进程
  const req = new EventEmitter()
  req.url = '/dsh-git-server/api/status'
  req.method = 'GET'
  let wrote = ''
  const res = new EventEmitter()
  res.writeHead = (code, headers) => { wrote += code }
  res.end = (body) => { res.body = body || '' }
  const apiRoute = host.registered.routes.find((r) => r.path === '/dsh-git-server/api')
  await apiRoute.handler(req, res)
  const doc = JSON.parse(res.body)
  assert.equal(doc.running, false)
  for (const c of host._cleanups) try { c() } catch {}
})

async function runE2EAttempt() {
  const dataDir = mkdtempSync(join(tmpdir(), 'dgs-e2e-'))
  // dsh 服务注入：定位真实 user-management store 模块（本机插件仓库/ profile）
  const umStoreCandidates = [
    process.env.DSH_UM_STORE_PATH,
    join(repoRoot, '..', 'user-management', 'src', 'store.js'),
    join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@weibaohui', 'user-management', 'src', 'store.js'),
  ].filter(Boolean)
  const umStorePath = umStoreCandidates.find((c) => existsSync(c))
  if (!umStorePath) throw new Error('user-management store 模块不可用（测试需要真实 service）')
  // 临时 dsh home + 真实 store 建号（与 UM 网关同一代码路径）
  const umHome = mkdtempSync(join(tmpdir(), 'dgs-umhome-'))
  const umStore = (await import('node:module')).createRequire(import.meta.url)(umStorePath)
  const store = umStore.createStore({ home: umHome })
  await store.load()
  await store.createUser({ username: 'drilluser', password: 'Passw0rd!123', role: 'admin' })
  process.env.DSH_UM_STORE_PATH = umStorePath
  process.env.DSH_UM_HOME = umHome

  const { createServer } = await import('node:net')
  const freePort = await new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
  })
  const cfg = runner.normalizeConfig({
    enabled: true,
    host: '127.0.0.1',
    port: freePort,
    dataDir,
    adminPassword: 'seed-admin-pass-123',
  })
  const logLines = []
  const handle = await runner.start(cfg, { logger: (l) => logLines.push(l) })
  try {
    assert.ok(handle.pid > 0)
    const dir = mkdtempSync(join(tmpdir(), 'dgs-work-'))

    // 0) UM 凭据走 basic 铸 token（同名账户拉通：token 属于 drilluser 本人）
    const mintRes = await fetch(`http://127.0.0.1:${freePort}/api/v1/users/drilluser/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from('drilluser:Passw0rd!123').toString('base64') },
      body: JSON.stringify({ name: 'e2e' }),
    })
    assert.equal(mintRes.status, 201)
    const drillToken = (await mintRes.json()).sha1
    const createRes = await fetch(`http://127.0.0.1:${freePort}/api/v1/user/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `token ${drillToken}` },
      body: JSON.stringify({ name: 'demo', auto_init: true, readme: 'Default', private: false }),
    })
    assert.equal(createRes.status, 201)
    // 密码永不同步断言：影子账号的 passwd 是随机不可用占位（≠ UM 密码的哈希），
    // 登录校验永远走 UM service
    const { encodePassword } = await import('../server/dist/authx/password.js')
    const dbm = (await import('better-sqlite3')).default(join(dataDir, 'gogs.db'))
    const row = dbm.prepare('SELECT salt, passwd, is_admin FROM user WHERE name = ?').get('drilluser')
    assert.ok(row, 'drilluser 影子账号已开户')
    assert.notEqual(row.passwd, encodePassword('Passw0rd!123', row.salt), 'passwd 不得同步 UM 密码')
    assert.equal(row.is_admin, 1, 'UM admin → 影子账号管理员')
    dbm.close()
    // 1) UM 凭据 clone（瞬断重试 3 次）
    let cloned = false
    for (let i = 0; i < 3 && !cloned; i++) {
      try {
        execFileSync('git', ['-c', 'credential.helper=', 'clone', `http://drilluser:Passw0rd%21123@127.0.0.1:${freePort}/drilluser/demo.git`, join(dir, 'demo')], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: 'pipe' })
        cloned = true
      } catch (e) {
        rmSync(join(dir, 'demo'), { recursive: true, force: true })
        if (i === 2) throw new Error('clone failed: ' + ((e.stderr && e.stderr.toString()) || e.message).slice(0, 300))
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    assert.ok(cloned, 'clone 未成功')
    // 2) 提交并 push（drilluser 本人身份）
    writeFileSync(join(dir, 'demo', 'a.txt'), 'hello from drill\n')
    const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'd', GIT_AUTHOR_EMAIL: 'd@d.local', GIT_COMMITTER_NAME: 'd', GIT_COMMITTER_EMAIL: 'd@d.local' }
    execFileSync('git', ['add', '.'], { cwd: join(dir, 'demo') })
    execFileSync('git', ['commit', '-m', 'c1'], { cwd: join(dir, 'demo'), env: gitEnv })
    execFileSync('git', ['-c', 'credential.helper=', 'push', 'origin', 'master'], { cwd: join(dir, 'demo'), env: gitEnv })
  } finally {
    writeFileSync('/tmp/dgs-e2e-log.txt', logLines.join('\n'))
    await handle.stop().catch(() => {})
    delete process.env.DSH_UM_STORE_PATH
    delete process.env.DSH_UM_HOME
  }
}

test('端到端：子进程启动 → git clone/push → user-management 凭据 → 停止', { timeout: 180000 }, async () => {
  try {
    await runE2EAttempt()
  } catch (e) {
    // 子进程类测试偶发瞬断（连接提前关闭等）——整体重试一次
    console.log('first attempt failed:', String(e.message).slice(0, 100), '— retrying')
    await runE2EAttempt()
  }
})
