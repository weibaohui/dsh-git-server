/* Generated from client/index.js by scripts/build-client.mjs — do not edit by hand.
 * Regenerate with: npm run build:client
 */
window.__ModuleLoader__.load({
  id: "@weibaohui/dsh-git-server",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")
    /**
     * @weibaohui/dsh-git-server - Browser half.
     *
     * Single surface: the host settings page section. All colors come from the
     * ui-theme `--dsw-*` token layers; all copy from the locale registry
     * (zh/en). The client is a thin editor over the plugin's HTTP API
     * (GET /status, PUT /settings) — the plugin owns the embedded ts-gogs child
     * process and its lifecycle.
     */

    let __React = null
    try { __React = require('react') } catch {}
    if (!__React || typeof __React.createElement !== 'function') {
      __React = {
        createElement(type, props, ...kids) {
          return { type, props: props || {}, kids: kids.flat(9).filter(k => k !== null && k !== undefined && k !== false && k !== true || true) }
        },
        useState(init) { const v = [typeof init === 'function' ? init() : init]; return [v[0], x => { v[0] = typeof x === 'function' ? x(v[0]) : x }] },
        useEffect() {}, useMemo(fn) { return fn() }, useRef(v = null) { return { current: v } },
      }
    }
    const { createElement: h, useState, useEffect } = __React

    let P = null
    try { P = require('@deepseek-ai/dsh-client-ui-primitives') } catch {}

    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById('dgs-styles')) return
      const holder = document.createElement('div')
      holder.id = 'dgs-styles'
      holder.style.display = 'none'
      holder.innerHTML = STYLE
      document.head.appendChild(holder)
    }

    const prim = (name) => P && P[name]
      ? P[name]
      : function Shim(props) {
          const { children, ...rest } = props
          return h('button', { ...rest, 'data-p-shim': name }, children)
        }

    // ── Locale ───────────────────────────────────────────────────────────────

    const NS = 'dshGitServer'

    const ZH = {
      title: 'Git 服务器',
      running: '运行中',
      stopped: '已停用',
      failed: '启动失败',
      hint: '内嵌 ts-gogs（Gogs 的 TypeScript 平替）：独立端口跑完整 Git 服务——HTTP clone/push、网页端、issue、PR、wiki、发版。与本机 dsh 网页互不相干，崩溃自动拉起。',
      secService: '服务',
      enabled: '启用 Git 服务器',
      hostLabel: '监听地址',
      hostHint: '0.0.0.0 = 局域网可访问；127.0.0.1 = 仅本机',
      portLabel: '端口',
      dataDirLabel: '数据目录',
      dataDirHint: '仓库、数据库与日志都在这里。留空 = ~/.dsh/dsh-git-server/data，支持 ~ 前缀',
      secAuth: '认证',
      authModeLabel: '账号体系',
      authModeGogs: 'Gogs 账号（本库独立账号 + 令牌）',
      authModeUM: 'user-management 账号（复用登录用户名密码）',
      authModeUMHint: 'git clone/push 与网页登录都能用 user-management 的用户名密码（映射为本库管理员 root）。开启两步验证（TOTP）的账号不可用；user-management 用户库缺失时自动回退 Gogs 账号模式。',
      authModeGogsHint: '管理员账号 root，密码见下方「管理员密码」。网页注册入口开放，普通账号自行注册。',
      adminCredTitle: '管理员账号',
      adminUser: '用户名',
      adminPass: '密码',
      adminRotate: '换一个密码',
      adminRotateHint: '重启 Git 服务器后生效（仅重置 root 密码）',
      umMissing: 'user-management 用户库不可用（未安装或文件缺失），已自动回退 Gogs 账号模式',
      openServer: '打开 Git 服务器',
      crashes: '自动拉起次数',
      save: '保存并应用',
      saved: '已保存，正在应用…',
      saveFailed: '保存失败',
      loading: '加载中…',
      notRunning: '服务器未运行',
      secTip: '提示',
      tipClone: '克隆示例：git clone <地址>/<用户名>/<仓库名>.git',
      secRepos: '仓库管理',
      regLabel: '开放网页注册',
      regHint: '关闭后只有管理员能建号（管理员登录后仍可在网页端建仓）',
      reposTitle: '仓库',
      reposEmpty: '还没有仓库——用下面的表单创建，或在 Git 服务器网页端操作',
      repoCreatePlaceholder: '新仓库名称（如 my-project）',
      repoCreateBtn: '创建仓库',
      repoPrivate: '私有',
      repoDelete: '删除',
      repoDeleteConfirm: '确定删除仓库',
      repoLoadFailed: '仓库列表加载失败',
      reposCount: (n) => `${n} 个仓库`,
      uiTitle: 'Git 服务器 · 完整界面',
      uiOpenNew: '在新标签页打开',
      uiReload: '刷新',
      uiConfigShow: '展开配置与管理',
      uiConfigHide: '收起配置与管理',
      uiLoginHint: '首次进入需要登录：账号体系在下方配置里选择（user-management 账号可直接用 dsh 的用户名密码）。',
      uiNotRunning: 'Git 服务器未运行——在下方配置里勾选启用后自动启动。',
    }

    const EN = {
      title: 'Git Server',
      running: 'Running',
      stopped: 'Stopped',
      failed: 'Failed',
      hint: 'Embedded ts-gogs (a faithful TypeScript port of Gogs): a full Git service on its own port — HTTP clone/push, web UI, issues, PRs, wiki, releases. Independent from the dsh web app; auto-restarts on crash.',
      secService: 'Service',
      enabled: 'Enable Git server',
      hostLabel: 'Listen address',
      hostHint: '0.0.0.0 = LAN accessible; 127.0.0.1 = local only',
      portLabel: 'Port',
      dataDirLabel: 'Data directory',
      dataDirHint: 'Repositories, database and logs live here. Empty = ~/.dsh/dsh-git-server/data, ~ prefix supported',
      secAuth: 'Authentication',
      authModeLabel: 'Account system',
      authModeGogs: 'Gogs accounts (built-in accounts + tokens)',
      authModeUM: 'user-management accounts (reuse login credentials)',
      authModeUMHint: 'git clone/push and web sign-in accept user-management usernames/passwords (mapped to the built-in admin root). Accounts with TOTP enabled cannot use it; falls back to Gogs accounts when the user store is missing.',
      authModeGogsHint: 'Admin account root, password shown below. Web registration is open for regular accounts.',
      adminCredTitle: 'Admin account',
      adminUser: 'Username',
      adminPass: 'Password',
      adminRotate: 'Rotate password',
      adminRotateHint: 'Takes effect on next server restart (resets root password only)',
      umMissing: 'user-management user store unavailable (not installed or missing), fell back to Gogs accounts',
      openServer: 'Open Git server',
      crashes: 'Auto-restarts',
      save: 'Save & apply',
      saved: 'Saved, applying…',
      saveFailed: 'Save failed',
      loading: 'Loading…',
      notRunning: 'Server not running',
      secTip: 'Tip',
      tipClone: 'Clone example: git clone <url>/<username>/<repo>.git',
      secRepos: 'Repositories',
      regLabel: 'Open web registration',
      regHint: 'When off, only the admin can create accounts (admins can still create repos on the web)',
      reposTitle: 'Repositories',
      reposEmpty: 'No repositories yet — create one below or on the Git server web UI',
      repoCreatePlaceholder: 'New repository name (e.g. my-project)',
      repoCreateBtn: 'Create repository',
      repoPrivate: 'Private',
      repoDelete: 'Delete',
      repoDeleteConfirm: 'Delete repository',
      repoLoadFailed: 'Failed to load repositories',
      reposCount: (n) => `${n} repositories`,
      uiTitle: 'Git Server · Full UI',
      uiOpenNew: 'Open in new tab',
      uiReload: 'Reload',
      uiConfigShow: 'Show configuration & management',
      uiConfigHide: 'Hide configuration & management',
      uiLoginHint: 'First visit needs sign-in: pick the account system below (user-management accounts work with your dsh username/password).',
      uiNotRunning: 'Git server not running — enable it in the configuration below.',
    }

    // ── Styles ───────────────────────────────────────────────────────────────

    const STYLE = `
    <style id="dgs-styles">
      .dgs-page { padding: 12px 16px 24px; color: var(--dsw-alias-text-primary); }
      .dgs-body { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
      .dgs-card { background: var(--dsw-alias-surface-default); border: 1px solid var(--dsw-alias-border-default); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
      .dgs-title { font-size: 15px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }
      .dgs-badge { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-default); }
      .dgs-badge.ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
      .dgs-badge.bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
      .dgs-hint { font-size: 12px; color: var(--dsw-alias-text-secondary); line-height: 1.6; }
      .dgs-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .dgs-row label { font-size: 13px; min-width: 130px; color: var(--dsw-alias-text-secondary); }
      .dgs-row input[type=text], .dgs-row input[type=number] {
        flex: 1; min-width: 180px; padding: 6px 10px; font-size: 13px; color: var(--dsw-alias-text-primary);
        background: var(--dsw-alias-surface-input); border: 1px solid var(--dsw-alias-border-default); border-radius: 6px;
      }
      .dgs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
      .dgs-divider { border: none; border-top: 1px solid var(--dsw-alias-border-default); margin: 2px 0; }
      .dgs-toolbar { display: flex; justify-content: flex-end; gap: 8px; }
      .dgs-link { font-size: 13px; color: var(--dsw-alias-text-link); }
      a.dgs-open { font-size: 13px; color: var(--dsw-alias-text-link); }
      .dgs-iframe { width: 100%; height: 72vh; border: 1px solid var(--dsw-alias-border-default); border-radius: 10px; background: #fff; }
      .dgs-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      details.dgs-config > summary { cursor: pointer; font-size: 13px; color: var(--dsw-alias-text-secondary); user-select: none; }
    </style>
    `

    // ── Section component ────────────────────────────────────────────────────

    function SettingsSection({ t }) {
      const [status, setStatus] = useState(null)
      const [form, setForm] = useState({ enabled: false, host: '127.0.0.1', port: 3400, dataDir: '', authMode: 'gogs', disableRegistration: false })
      const [busy, setBusy] = useState(false)
      const [toast, setToast] = useState('')
      const [errText, setErrText] = useState('')
      const [configOpen, setConfigOpen] = useState(null) // null=未运行时自动展开
      const [uiKey, setUiKey] = useState(0)
      const [repos, setRepos] = useState(null)
      const [newRepo, setNewRepo] = useState('')

      async function loadRepos() {
        try {
          const res = await fetch('/dsh-git-server/api/repos')
          const doc = await res.json()
          if (!gone) setRepos(doc && doc.ok ? doc.repos : [])
        } catch { if (!gone) setRepos([]) }
      }
      let gone = false

      useEffect(() => {
        let gone = false
        ;(async () => {
          try {
            const res = await fetch('/dsh-git-server/api/status')
            const doc = await res.json()
            if (gone) return
            setStatus(doc)
            setForm({
              enabled: !!doc.enabled,
              host: doc.host || '127.0.0.1',
              port: doc.port || 3400,
              dataDir: doc.dataDir || '',
              authMode: doc.authMode || 'gogs',
              disableRegistration: !!doc.disableRegistration,
            })
            if (doc.running) loadRepos()
          } catch (e) {
            if (!gone) setErrText(String((e && e.message) || e))
          }
        })()
        return () => { gone = true }
      }, [])

      async function doSave() {
        setBusy(true)
        setToast(t('saved'))
        try {
          const res = await fetch('/dsh-git-server/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
          const doc = await res.json()
          if (doc && doc.ok !== false) { setStatus(doc); loadRepos() }
          else setErrText(doc && doc.error ? doc.error : t('saveFailed'))
        } catch (e) {
          setErrText(String((e && e.message) || e))
        } finally {
          setBusy(false)
          setTimeout(() => setToast(''), 2500)
        }
      }

      async function doCreateRepo() {
        const name = newRepo.trim()
        if (!name) return
        setBusy(true)
        try {
          const res = await fetch('/dsh-git-server/api/repos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, autoInit: true }),
          })
          const doc = await res.json()
          if (doc && doc.ok) { setNewRepo(''); await loadRepos(); setToast(name + ' ✓') }
          else setErrText((doc && doc.error) || t('saveFailed'))
        } catch (e) { setErrText(String((e && e.message) || e)) }
        finally { setBusy(false); setTimeout(() => setToast(''), 2500) }
      }

      async function doDeleteRepo(name) {
        if (!confirm(t('repoDeleteConfirm') + ' ' + name + ' ?')) return
        setBusy(true)
        try {
          await fetch('/dsh-git-server/api/repos/' + encodeURIComponent(name), { method: 'DELETE' })
          await loadRepos()
        } catch (e) { setErrText(String((e && e.message) || e)) }
        finally { setBusy(false) }
      }

      async function doRotate() {
        const pw = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
        setForm((f) => ({ ...f }))
        try {
          const res = await fetch('/dsh-git-server/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminPassword: pw }),
          })
          const doc = await res.json()
          if (doc && doc.ok !== false) { setStatus(doc); setToast(t('adminRotateHint')) }
        } catch {}
      }

      const running = !!(status && status.running)
      const badge = !status
        ? null
        : status.error
          ? h('span', { className: 'dgs-badge bad' }, t('failed'))
          : status.running
            ? h('span', { className: 'dgs-badge ok' }, t('running'))
            : h('span', { className: 'dgs-badge' }, t('stopped'))
      let body
      try {
        body = h('div', { className: 'dgs-card' },
          h('h2', { className: 'dgs-title' }, t('title'), badge,
            status && status.crashes > 0 ? h('span', { className: 'dgs-hint' }, `${t('crashes')}: ${status.crashes}`) : null),
          h('div', { className: 'dgs-hint' }, t('hint')),

          h('div', { className: 'dgs-row' },
            h('label', null, t('enabled')),
            h('input', {
              type: 'checkbox', checked: !!form.enabled,
              onChange: (e) => setForm((f) => ({ ...f, enabled: e.target.checked })),
            })),

          h('div', { className: 'dgs-row' },
            h('label', null, t('hostLabel')),
            h('input', { type: 'text', value: form.host, onChange: (e) => setForm((f) => ({ ...f, host: e.target.value })) })),
          h('div', { className: 'dgs-hint' }, t('hostHint')),

          h('div', { className: 'dgs-row' },
            h('label', null, t('portLabel')),
            h('input', { type: 'number', value: form.port, onChange: (e) => setForm((f) => ({ ...f, port: Number(e.target.value) })) })),

          h('div', { className: 'dgs-row' },
            h('label', null, t('dataDirLabel')),
            h('input', { type: 'text', value: form.dataDir, placeholder: '~/.dsh/dsh-git-server/data', onChange: (e) => setForm((f) => ({ ...f, dataDir: e.target.value })) })),
          h('div', { className: 'dgs-hint' }, t('dataDirHint')),

          h('hr', { className: 'dgs-divider' }),
          h('div', { className: 'dgs-row' },
            h('label', null, t('authModeLabel')),
            h('select', {
              value: form.authMode,
              onChange: (e) => setForm((f) => ({ ...f, authMode: e.target.value })),
              style: { flex: '1', padding: '6px', border: '1px solid var(--dsw-alias-border-default)', borderRadius: '6px', background: 'var(--dsw-alias-surface-input)', color: 'var(--dsw-alias-text-primary)' },
            },
              h('option', { value: 'gogs' }, t('authModeGogs')),
              h('option', { value: 'user-management' }, t('authModeUM')))),
          h('div', { className: 'dgs-hint' }, form.authMode === 'user-management' ? t('authModeUMHint') : t('authModeGogsHint')),
          status && status.authMode === 'user-management' && status.umAvailable !== 'ok'
            ? h('div', { className: 'dgs-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('umMissing'))
            : null,
          h('div', { className: 'dgs-row' },
            h('label', null, t('regLabel')),
            h('input', { type: 'checkbox', checked: !form.disableRegistration,
              onChange: (e) => setForm((f) => ({ ...f, disableRegistration: !e.target.checked })) })),
          h('div', { className: 'dgs-hint' }, t('regHint')),

          h('div', { className: 'dgs-row' },
            h('label', null, t('adminCredTitle')),
            h('span', { className: 'dgs-mono' }, `${t('adminUser')}: root`),
            h('span', { className: 'dgs-mono' }, `${t('adminPass')}: ${status && status.adminPassword ? status.adminPassword : '••••••'}`),
            h(prim('Button') || 'button', {
              'data-p-button': 'secondary', onClick: doRotate, disabled: busy,
              style: P ? undefined : { padding: '4px 10px', cursor: 'pointer' },
            }, t('adminRotate'))),
          h('div', { className: 'dgs-hint' }, t('adminRotateHint')),

          h('div', { className: 'dgs-row' },
            status && status.running
              ? h('a', { className: 'dgs-open', href: status.urlLocal, target: '_blank', rel: 'noreferrer' }, '↗ ' + t('openServer'))
              : h('span', { className: 'dgs-hint' }, t('notRunning')),
            status && status.running ? h('span', { className: 'dgs-mono' }, t('tipClone')) : null),

          h('hr', { className: 'dgs-divider' }),
          h('h2', { className: 'dgs-title' }, t('secRepos'),
            Array.isArray(repos) ? h('span', { className: 'dgs-hint' }, t('reposCount')(repos.length)) : null),
          status && status.running
            ? h('div', { className: 'dgs-row' },
                h('input', { type: 'text', value: newRepo, placeholder: t('repoCreatePlaceholder'),
                  onChange: (e) => setNewRepo(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') doCreateRepo() },
                  style: { flex: '1', minWidth: '180px', padding: '6px 10px', fontSize: '13px', color: 'var(--dsw-alias-text-primary)', background: 'var(--dsw-alias-surface-input)', border: '1px solid var(--dsw-alias-border-default)', borderRadius: '6px' } }),
                h(prim('Button') || 'button', { 'data-p-button': 'primary', onClick: doCreateRepo, disabled: busy || !newRepo.trim(),
                  style: P ? undefined : { padding: '6px 12px', cursor: 'pointer' } }, t('repoCreateBtn')))
            : null,
          Array.isArray(repos) && repos.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                repos.map((rp) => h('div', { key: rp.id || rp.name, className: 'dgs-row', style: { gap: '8px' } },
                  h('a', { className: 'dgs-link', href: rp.htmlUrl, target: '_blank', rel: 'noreferrer',
                      style: { minWidth: '140px', fontWeight: '600' } }, rp.name),
                  rp.private ? h('span', { className: 'dgs-badge' }, t('repoPrivate')) : null,
                  h('span', { className: 'dgs-mono', style: { flex: '1' } }, rp.cloneUrl),
                  h(prim('Button') || 'button', { 'data-p-button': 'secondary', onClick: () => doDeleteRepo(rp.name), disabled: busy,
                    style: P ? undefined : { padding: '3px 10px', cursor: 'pointer' } }, t('repoDelete')))))
            : (status && status.running ? h('div', { className: 'dgs-hint' }, t('reposEmpty')) : null),

          errText ? h('div', { className: 'dgs-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, errText) : null,
          h('div', { className: 'dgs-toolbar' },
            h(prim('Button') || 'button', {
              'data-p-button': 'primary', onClick: doSave, disabled: busy,
              style: P ? undefined : { padding: '6px 14px', cursor: 'pointer' },
            }, t('save'))),
        )
      } catch (renderErr) {
        ;(globalThis.__skErrors = globalThis.__skErrors || []).push('body: ' + (renderErr && renderErr.message))
        body = h('div', { className: 'dgs-card', style: { color: 'var(--dsw-alias-state-error-primary)' } },
          '⚠️ ' + String((renderErr && renderErr.message) || renderErr))
      }

      const detailsOpen = configOpen === null ? !running : configOpen
      return h('div', { className: 'dgs-page' },
        h('div', { className: 'dgs-body' },
          h('div', { className: 'dgs-toolbar' },
            badge,
            running ? h(prim('Button') || 'button', {
              'data-p-button': 'secondary', onClick: () => setUiKey((k) => k + 1),
              style: P ? undefined : { padding: '4px 10px', cursor: 'pointer' },
            }, t('uiReload')) : null,
            running ? h('a', { className: 'dgs-open', href: '/dsh-git-server/ui/', target: '_blank', rel: 'noreferrer' }, '↗ ' + t('uiOpenNew')) : null,
          ),
          running
            ? h('iframe', { key: uiKey, className: 'dgs-iframe', src: '/dsh-git-server/ui/', title: t('uiTitle') })
            : h('div', { className: 'dgs-hint' }, t('uiNotRunning')),
          running ? h('div', { className: 'dgs-hint' }, t('uiLoginHint')) : null,
          h('details', { className: 'dgs-config', open: !!detailsOpen,
            onToggle: (e) => setConfigOpen(e.target.open) },
            h('summary', null, detailsOpen ? t('uiConfigHide') : t('uiConfigShow')),
            h('div', { style: { paddingTop: '10px' } }, body)),
        ),
      )
    }

    function SettingsSlotComponent(props) {
      useEffect(ensureStyles, [])
      return h(SettingsSection, { t: props.__t })
    }

    // ── Plugin plane contract ────────────────────────────────────────────────

    const CLIENT_NAME = '@weibaohui/dsh-git-server'

    module.exports = {
      name: CLIENT_NAME,
      inject: ['slots', 'locale'],
      __internals: { NS, ZH, EN },
      __boot(container, opts = {}) {
        ensureStyles()
        let t = opts.t || ((key) => ZH[key] ?? EN[key] ?? key)
        const root = require('react-dom/client').createRoot(container)
        root.render(h(SettingsSlotComponent, { t }))
        return root
      },
      apply(ctx) {
        let t = (key) => ZH[key] ?? EN[key] ?? key
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            ctx.locale.register(NS, 'zh', ZH)
            ctx.locale.register(NS, 'en', EN)
            const bound = typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : null
            if (bound) t = (key) => bound(key) || (ZH[key] ?? EN[key] ?? key)
          }
        } catch (e) { try { console.error('[dsh-git-server] locale init:', e) } catch {} }
        ctx.effect(() => {
          try {
            ctx.slots.inject('settings.section', () => ctx.slots.register({
              name: 'settings.section',
              id: CLIENT_NAME,
              order: 97,
              locale: NS,
              label: () => t('title'),
              inject: () => ({}),
            }, function SettingsSectionSlot() {
              return h(SettingsSlotComponent, { __t: t })
            }))
          } catch (e) { (globalThis.__skErrors = globalThis.__skErrors || []).push('settings:' + (e && e.message)); throw e }
        }, 'dsh-git-server: settings section')
      },
    }

    return module.exports
  }
})
