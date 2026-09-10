// dsh-git-server 插件合约测试（node --test）。
// 覆盖：配置归一化/白名单补丁、app.ini 渲染、子进程启动→就绪→git 操作→
// user-management 凭据→停止 的完整链路（真实 vendor/ts-gogs 子进程）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { statSync } from 'node:fs'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  assert.equal(cfg.enabled, false)
  assert.equal(cfg.host, '127.0.0.1')
  assert.equal(cfg.port, 3400)
  assert.equal(cfg.authMode, 'gogs')
  assert.ok(cfg.dataDir.includes('dsh-git-server'))
  const bad = runner.normalizeConfig({ port: 80, authMode: 'weird' })
  assert.ok(bad.port >= 1024)
  assert.equal(bad.authMode, 'gogs')
})

test('sanitizePatch: 只收白名单且跳过无变化字段', () => {
  const cur = runner.normalizeConfig({ port: 3400 })
  const out = runner.sanitizePatch({ port: 3400, host: '0.0.0.0', junk: 'x' }, cur)
  assert.deepEqual(out, { host: '0.0.0.0' })
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
  assert.equal(host.registered.routes[0].path, '/dsh-git-server/api')
  // status 路由不应启动子进程
  const req = new EventEmitter()
  req.url = '/dsh-git-server/api/status'
  req.method = 'GET'
  let wrote = ''
  const res = new EventEmitter()
  res.writeHead = (code, headers) => { wrote += code }
  res.end = (body) => { res.body = body || '' }
  await host.registered.routes[0].handler(req, res)
  const doc = JSON.parse(res.body)
  assert.equal(doc.running, false)
  for (const c of host._cleanups) try { c() } catch {}
})

test('端到端：子进程启动 → git clone/push → user-management 凭据 → 停止', { timeout: 90000 }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dgs-e2e-'))
  const umDir = mkdtempSync(join(tmpdir(), 'dgs-um-'))
  const umFile = join(umDir, 'users.json')
  // 造一个 user-management 用户库（scrypt N=16384，与 UM store.js 同款）
  const { scryptSync, randomBytes } = await import('node:crypto')
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('Passw0rd!123', salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex')
  writeFileSync(umFile, JSON.stringify({ seq: 1, users: [{ id: 'u_1_test', username: 'drilluser', role: 'admin', salt, passHash: hash, createdAt: Date.now() }] }))
  process.env.DSH_UM_USERS_FILE = umFile

  const cfg = runner.normalizeConfig({
    enabled: true,
    host: '127.0.0.1',
    port: 3891,
    dataDir,
    authMode: 'user-management',
    adminPassword: 'seed-admin-pass-123',
  })
  const handle = await runner.start(cfg, { logger: () => {} })
  try {
    assert.ok(handle.pid > 0)
    const dir = mkdtempSync(join(tmpdir(), 'dgs-work-'))

    // 0) UM 凭据走 basic 铸 token 并建仓（映射管理员 root，仓库 API 均 root 身份）
    const mintRes = await fetch('http://127.0.0.1:3891/api/v1/users/root/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from('drilluser:Passw0rd!123').toString('base64') },
      body: JSON.stringify({ name: 'e2e' }),
    })
    assert.equal(mintRes.status, 201)
    const rootToken = (await mintRes.json()).sha1
    const createRes = await fetch('http://127.0.0.1:3891/api/v1/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `token ${rootToken}` },
      body: JSON.stringify({ name: 'demo', auto_init: true, readme: 'Default', private: false }),
    })
    assert.equal(createRes.status, 201)
    // 1) UM 凭据 clone
    try {
      execFileSync('git', ['-c', 'credential.helper=', 'clone', `http://drilluser:Passw0rd%21123@127.0.0.1:3891/root/demo.git`, join(dir, 'demo')], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    } catch (e) {
      throw new Error('clone failed: ' + ((e.stderr && e.stderr.toString()) || e.message).slice(0, 300))
    }
    // 2) 提交并 push（UM 用户映射到 root 管理员）
    writeFileSync(join(dir, 'demo', 'a.txt'), 'hello from drill\n')
    const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'd', GIT_AUTHOR_EMAIL: 'd@d.local', GIT_COMMITTER_NAME: 'd', GIT_COMMITTER_EMAIL: 'd@d.local' }
    execFileSync('git', ['add', '.'], { cwd: join(dir, 'demo') })
    execFileSync('git', ['commit', '-m', 'c1'], { cwd: join(dir, 'demo'), env: gitEnv })
    execFileSync('git', ['-c', 'credential.helper=', 'push', 'origin', 'master'], { cwd: join(dir, 'demo'), env: gitEnv })
    // 3) 网页登录接受 UM 凭据
    const res = await fetch('http://127.0.0.1:3891/api/web/user/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'drilluser', password: 'Passw0rd!123' }),
    })
    assert.equal(res.status, 200)
    const doc = await res.json()
    assert.ok(!doc.error)
    // 4) 错误密码拒绝
    const bad = await fetch('http://127.0.0.1:3891/api/web/user/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'drilluser', password: 'wrong' }),
    })
    assert.equal(bad.status, 401)
  } finally {
    await handle.stop()
    delete process.env.DSH_UM_USERS_FILE
  }
})
