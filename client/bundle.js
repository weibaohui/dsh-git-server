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
     * @weibaohui/dsh-git-server — Browser half（原生 dsh 插件 UI，无 iframe/桥接）。
     *
     * 两个面：
     *  1. sidebar.footer.action「Git」→ 全屏管理页（仓库列表/建仓/删除 +
     *     仓库浏览：文件树/文件内容/提交/分支/工单[列表/新建/评论/开关]）。
     *  2. settings.section「Git 服务器」→ 服务配置（启停/端口/数据目录/兜底密码）。
     *
     * 数据通道：宿主同源路由 /dsh-git-server/api/*（dsh 登录门禁保护，
     * 宿主按 dsh 会话解析操作者并以其身份代理 kernel API）。
     * 主题：直接用 --dsw-alias-* token（dsh 原生，亮暗自动跟随）。
     */

    let __React = null
    try { __React = require('react') } catch {}
    if (!__React || typeof __React.createElement !== 'function') {
      __React = {
        createElement(type, props, ...kids) {
          return { type, props: props || {}, kids: kids.flat(9).filter(k => k !== null && k !== undefined && k !== false && k !== true || true) }
        },
        useState(init) { const v = [typeof init === 'function' ? init() : init]; return [v[0], x => { v[0] = typeof x === 'function' ? x(v[0]) : x }] },
        useEffect() {}, useMemo(fn) { return fn() }, useCallback(fn) { return fn }, useRef(v = null) { return { current: v } },
      }
    }
    const { createElement: h, useState, useEffect, useCallback } = __React

    // ── locale ────────────────────────────────────────────────────────────────

    const NS = 'dshGitServer'
    const ZH = {
      nav: 'Git', title: 'Git 服务器',
      myRepos: '我的仓库', newRepo: '新建仓库', repoName: '仓库名', private: '私有',
      create: '创建', delete: '删除', deleteConfirm: '确定删除仓库', open: '打开',
      clone: '克隆地址', copy: '复制', copied: '已复制',
      files: '文件', commits: '提交', branches: '分支', issues: '工单',
      emptyRepo: '还没有仓库，先建一个', back: '‹ 返回',
      issueNew: '新工单', issueTitle: '标题', issueBody: '描述', submit: '提交',
      comment: '评论', commentPlaceholder: '说点什么…', close: '关闭工单', reopen: '重新打开',
      noIssues: '暂无工单', openState: '开启', closedState: '已关闭',
      loading: '加载中…', loadFailed: '加载失败', retry: '重试',
      emptyDir: '空目录', emptyFile: '（二进制或空文件）',
      advanced: '高级页面 ↗', advancedHint: 'PR / wiki / 发版 / 组织等进阶功能在内核网页端（同一账号登录）',
      hint: 'dsh 内嵌 Git 服务 · 账号即 dsh 账号 · git clone 用 dsh 用户名密码',
    }
    const EN = {
      nav: 'Git', title: 'Git Server',
      myRepos: 'My repositories', newRepo: 'New repository', repoName: 'Repository name', private: 'Private',
      create: 'Create', delete: 'Delete', deleteConfirm: 'Delete repository', open: 'Open',
      clone: 'Clone URL', copy: 'Copy', copied: 'Copied',
      files: 'Files', commits: 'Commits', branches: 'Branches', issues: 'Issues',
      emptyRepo: 'No repositories yet — create one', back: '‹ Back',
      issueNew: 'New issue', issueTitle: 'Title', issueBody: 'Description', submit: 'Submit',
      comment: 'Comment', commentPlaceholder: 'Say something…', close: 'Close issue', reopen: 'Reopen',
      noIssues: 'No issues', openState: 'Open', closedState: 'Closed',
      loading: 'Loading…', loadFailed: 'Failed to load', retry: 'Retry',
      emptyDir: 'Empty directory', emptyFile: '(binary or empty)',
      advanced: 'Advanced ↗', advancedHint: 'PRs / wiki / releases / orgs live on the kernel web UI (same account)',
      hint: 'Git service inside dsh · your dsh account is your git credential',
    }

    // ── styles（dsw token 原生） ───────────────────────────────────────────────

    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById('dgs-styles')) return
      const holder = document.createElement('div')
      holder.id = 'dgs-styles'
      holder.style.display = 'none'
      holder.innerHTML = `<style>
    .dgs-page{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px}
    .dgs-head{display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
    .dgs-mark{width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,var(--dsw-alias-state-business-primary),#679efe);flex:none}
    .dgs-h1{font-size:16px;font-weight:700;margin:0}
    .dgs-hint{font-size:12px;color:var(--dsw-alias-label-tertiary)}
    .dgs-close{margin-left:auto;cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;padding:4px 8px;border-radius:8px}
    .dgs-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
    .dgs-body{flex:1;overflow:auto;padding:18px;max-width:1100px;width:100%;margin:0 auto}
    .dgs-card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;margin-bottom:10px}
    .dgs-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .dgs-repo{cursor:pointer;transition:border-color .12s}
    .dgs-repo:hover{border-color:var(--dsw-alias-state-business-primary)}
    .dgs-name{font-weight:600;font-size:15px;color:var(--dsw-alias-label-primary);text-decoration:none}
    .dgs-name:hover{text-decoration:underline}
    .dgs-badge{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
    .dgs-badge.pri{color:#f59e0b;border-color:#f59e0b55}
    .dgs-badge.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)44}
    .dgs-badge.closed{color:var(--dsw-alias-label-tertiary)}
    .dgs-sub{font-size:12px;color:var(--dsw-alias-label-tertiary)}
    .dgs-btn{cursor:pointer;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:500;background:var(--dsw-alias-state-business-primary);color:#fff}
    .dgs-btn:hover{filter:brightness(1.1)}
    .dgs-btn:disabled{opacity:.5;cursor:default}
    .dgs-btn.ghost{background:transparent;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}
    .dgs-btn.ghost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);filter:none}
    .dgs-btn.danger{background:transparent;color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary)55}
    .dgs-input{flex:1;min-width:160px;padding:7px 11px;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none}
    .dgs-input:focus{border-color:var(--dsw-alias-state-business-primary)}
    textarea.dgs-input{min-height:72px;resize:vertical}
    .dgs-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:14px}
    .dgs-tab{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;padding:8px 14px;border-radius:8px 8px 0 0;border-bottom:2px solid transparent}
    .dgs-tab.active{color:var(--dsw-alias-state-business-primary);border-bottom-color:var(--dsw-alias-state-business-primary)}
    .dgs-table{width:100%;border-collapse:collapse}
    .dgs-table td{padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px}
    .dgs-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}
    .dgs-file{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.7;background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;overflow:auto;max-height:60vh}
    .dgs-crumbs{display:flex;gap:6px;align-items:center;font-size:13px;margin-bottom:10px;flex-wrap:wrap}
    .dgs-crumb{color:var(--dsw-alias-label-secondary);cursor:pointer}
    .dgs-crumb:hover{color:var(--dsw-alias-state-business-primary)}
    .dgs-crumb.cur{color:var(--dsw-alias-label-primary);cursor:default;font-weight:500}
    .dgs-issue{border-bottom:1px solid var(--dsw-alias-border-l1);padding:10px 4px}
    .dgs-comment{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;margin:8px 0}
    .dgs-empty{color:var(--dsw-alias-label-tertiary);text-align:center;padding:40px 0;font-size:13px}
    .dgs-err{color:var(--dsw-alias-state-error-primary);font-size:13px}
    .dgs-ico{margin-right:8px;opacity:.75}
    .dgs-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--dsw-alias-toast-bg);color:#fff;border-radius:8px;padding:8px 16px;font-size:12px;z-index:2147483600}
    .dgs-settings{max-width:720px;display:flex;flex-direction:column;gap:12px;padding:12px 16px 24px;color:var(--dsw-alias-label-primary)}
    .dgs-settings .dgs-card{margin-bottom:0}
    .dgs-settings label{font-size:13px;color:var(--dsw-alias-label-secondary);min-width:120px}
    </style>`
      document.head.appendChild(holder)
    }

    // ── data helpers ──────────────────────────────────────────────────────────

    const API = '/dsh-git-server/api'
    async function api(method, path, body) {
      const res = await fetch(API + path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      try { return await res.json() } catch { return { ok: false, error: 'http ' + res.status } }
    }

    // ── 全屏管理页 ────────────────────────────────────────────────────────────

    function RepoBrowser({ repo, t, onBack }) {
      const [tab, setTab] = useState('files')
      const ref = repo.defaultBranch || 'master'
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 12 } },
          h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
          h('span', { className: 'dgs-h1' }, repo.owner + '/' + repo.name),
          repo.private ? h('span', { className: 'dgs-badge pri' }, t('private')) : null,
          h('span', { className: 'dgs-sub' }, `${t('clone')}: http clone 用 dsh 账号`),
        ),
        h('div', { className: 'dgs-tabs' },
          ['files', 'commits', 'branches', 'issues'].map((k) =>
            h('button', { key: k, className: 'dgs-tab' + (tab === k ? ' active' : ''), onClick: () => setTab(k) }, t(k)))),
        tab === 'files' && h(FileTree, { repo, ref, t }),
        tab === 'commits' && h(Commits, { repo, ref, t }),
        tab === 'branches' && h(Branches, { repo, t }),
        tab === 'issues' && h(Issues, { repo, t }),
      )
    }

    function FileTree({ repo, ref, t }) {
      const [path, setPath] = useState('')
      const [entries, setEntries] = useState(null)
      const [file, setFile] = useState(null)
      const [err, setErr] = useState('')
      const load = useCallback((p) => {
        setFile(null); setEntries(null); setErr('')
        api('GET', `/repos/${repo.owner}/${repo.name}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(p)}`)
          .then((d) => d.ok ? setEntries(d.entries || []) : setErr(d.error || t('loadFailed')))
      }, [repo.owner, repo.name, ref])
      useEffect(() => { load(path) }, [load, path])
      const openEntry = (e) => {
        const p = e.path
        if (e.type === 'dir' || e.type === 'tree') setPath(p)
        else api('GET', `/repos/${repo.owner}/${repo.name}/raw?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(p)}`)
          .then((d) => setFile({ name: e.name, text: d.ok ? d.text : null }))
      }
      const crumbs = ['', ...path ? path.split('/') : []]
      return h('div', null,
        h('div', { className: 'dgs-crumbs' },
          h('span', { className: 'dgs-crumb cur' }, ref),
          path.split('/').filter(Boolean).map((seg, i, arr) =>
            h('span', { key: i },
              h('span', { className: 'dgs-crumb', onClick: () => setPath(arr.slice(0, i + 1).join('/')) }, seg),
              i < arr.length - 1 ? h('span', { className: 'dgs-sub' }, '/') : null))),
        err ? h('div', { className: 'dgs-err' }, err) : null,
        file ? h('div', null,
          h('div', { className: 'dgs-row', style: { margin: '8px 0' } },
            h('button', { className: 'dgs-btn ghost', onClick: () => setFile(null) }, t('back')),
            h('span', { className: 'dgs-sub' }, file.name)),
          h('pre', { className: 'dgs-file' }, file.text === null ? t('emptyFile') : file.text))
          : entries === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : entries.length === 0 ? h('div', { className: 'dgs-empty' }, t('emptyDir'))
          : h('table', { className: 'dgs-table' },
              h('tbody', null, entries.map((e) =>
                h('tr', { key: e.path, style: { cursor: 'pointer' }, onClick: () => openEntry(e) },
                  h('td', { style: { width: 24 } }, h('span', { className: 'dgs-ico' }, e.type === 'dir' || e.type === 'tree' ? '📁' : '📄')),
                  h('td', null, e.name),
                  h('td', { className: 'dgs-sub', style: { textAlign: 'right' } }, e.type === 'blob' ? fmtSize(e.size) : ''))))),
      )
    }

    function Commits({ repo, ref, t }) {
      const [list, setList] = useState(null)
      useEffect(() => {
        api('GET', `/repos/${repo.owner}/${repo.name}/commits?ref=${encodeURIComponent(ref)}`)
          .then((d) => setList(d.commits || []))
      }, [repo.owner, repo.name, ref])
      if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return list.length === 0 ? h('div', { className: 'dgs-empty' }, t('emptyDir'))
        : h('table', { className: 'dgs-table' },
            h('tbody', null, list.map((c, i) =>
              h('tr', { key: i },
                h('td', null, h('div', { style: { fontWeight: 500 } }, (c.message || '').split('\n')[0]),
                  h('div', { className: 'dgs-sub' }, `${c.author} · ${fmtDate(c.date)}`)),
                h('td', { className: 'dgs-sub', style: { textAlign: 'right' } }, c.sha)))))
    }

    function Branches({ repo, t }) {
      const [list, setList] = useState(null)
      useEffect(() => {
        api('GET', `/repos/${repo.owner}/${repo.name}/branches`).then((d) => setList(d.branches || []))
      }, [repo.owner, repo.name])
      if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return h('table', { className: 'dgs-table' },
        h('tbody', null, list.map((b) =>
          h('tr', { key: b.name },
            h('td', { style: { fontWeight: 500 } }, b.name),
            h('td', { className: 'dgs-sub', style: { textAlign: 'right' } }, (b.sha || '').slice(0, 10))))))
    }

    function Issues({ repo, t }) {
      const [state, setState] = useState('open')
      const [list, setList] = useState(null)
      const [creating, setCreating] = useState(false)
      const [openIdx, setOpenIdx] = useState(null)
      const reload = useCallback(() => {
        setList(null)
        api('GET', `/repos/${repo.owner}/${repo.name}/issues?state=${state}`).then((d) => setList(d.issues || []))
      }, [repo.owner, repo.name, state])
      useEffect(reload, [reload])
      if (openIdx !== null) return h(IssueDetail, { repo, idx: openIdx, t, onBack: () => { setOpenIdx(null); reload() } })
      return h('div', null,
        h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
          h('button', { className: 'dgs-btn ghost', onClick: () => setState('open') }, t('openState')),
          h('button', { className: 'dgs-btn ghost', onClick: () => setState('closed') }, t('closedState')),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dgs-btn', onClick: () => setCreating(!creating) }, t('issueNew'))),
        creating ? h(NewIssue, { repo, t, onDone: () => { setCreating(false); reload() } }) : null,
        list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : list.length === 0 ? h('div', { className: 'dgs-empty' }, t('noIssues'))
          : h('div', null, list.map((i) => issueRow(i)))
      )

      function issueRow(i) {
        const badge = h('span', { className: 'dgs-badge' + (state === 'open' ? ' ok' : ' closed') }, '#' + i.number)
        const title = h('span', { style: { fontWeight: 500 } }, i.title)
        const meta = h('div', { className: 'dgs-sub' },
          (i.user || '') + ' · ' + fmtDate(i.updatedAt) + ' · ' + (i.comments || 0) + ' ' + t('comment'))
        return h('div', {
          key: i.number, className: 'dgs-issue', style: { cursor: 'pointer' },
          onClick: () => setOpenIdx(i.number),
        }, h('div', { className: 'dgs-row' }, badge, title), meta)
      }
    }

    function NewIssue({ repo, t, onDone }) {
      const [title, setTitle] = useState('')
      const [body, setBody] = useState('')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      return h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
        h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
          h('input', { className: 'dgs-input', placeholder: t('issueTitle'), value: title, onChange: (e) => setTitle(e.target.value) })),
        h('textarea', { className: 'dgs-input', placeholder: t('issueBody'), value: body, onChange: (e) => setBody(e.target.value) }),
        err ? h('div', { className: 'dgs-err' }, err) : null,
        h('div', { className: 'dgs-row', style: { marginTop: 8 } },
          h('button', { className: 'dgs-btn', disabled: busy || !title.trim(),
            onClick: async () => {
              setBusy(true); setErr('')
              const d = await api('POST', `/repos/${repo.owner}/${repo.name}/issues`, { title, body })
              setBusy(false)
              d.ok ? onDone() : setErr(d.error || 'failed')
            } }, t('submit'))))
    }

    function IssueDetail({ repo, idx, t, onBack }) {
      const [comments, setComments] = useState(null)
      const [text, setText] = useState('')
      const [busy, setBusy] = useState(false)
      const reload = useCallback(() => {
        setComments(null)
        api('GET', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`).then((d) => setComments(d.comments || []))
      }, [repo.owner, repo.name, idx])
      useEffect(reload, [reload])
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 10 } },
          h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
          h('span', { style: { fontWeight: 600 } }, '#' + idx),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dgs-btn danger', disabled: busy,
            onClick: async () => {
              setBusy(true)
              await api('PATCH', `/repos/${repo.owner}/${repo.name}/issues/${idx}`, { state: 'closed' })
              setBusy(false); onBack()
            } }, t('close'))),
        comments === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : comments.length === 0 ? h('div', { className: 'dgs-empty' }, t('noIssues'))
          : comments.map((c) =>
              h('div', { key: c.id, className: 'dgs-comment' },
                h('div', { className: 'dgs-sub', style: { marginBottom: 4 } }, `${c.user || ''} · ${fmtDate(c.created)}`),
                h('div', { style: { whiteSpace: 'pre-wrap' } }, c.body))),
        h('div', { className: 'dgs-card', style: { margin: '12px 0' } },
          h('textarea', { className: 'dgs-input', placeholder: t('commentPlaceholder'), value: text, onChange: (e) => setText(e.target.value) }),
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('button', { className: 'dgs-btn', disabled: busy || !text.trim(),
              onClick: async () => {
                setBusy(true)
                await api('POST', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`, { body: text })
                setText(''); setBusy(false); reload()
              } }, t('comment')))))
    }

    // ── 主页（仓库列表 + 建仓） ────────────────────────────────────────────────

    function GitPage({ onClose, t, kernelUrl }) {
      const [me, setMe] = useState(null)
      const [err, setErr] = useState('')
      const [name, setName] = useState('')
      const [isPrivate, setIsPrivate] = useState(false)
      const [busy, setBusy] = useState(false)
      const [openRepo, setOpenRepo] = useState(null)
      const [toast, setToast] = useState('')
      const reload = useCallback(() => {
        setMe(null); setErr('')
        api('GET', '/me').then((d) => d.ok ? setMe(d) : setErr(d.error || 'failed'))
      }, [])
      useEffect(reload, [reload])
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      const notify = (m) => { setToast(m); setTimeout(() => setToast(''), 1600) }
      const body = err ? h('div', { className: 'dgs-card dgs-err' }, err,
          h('button', { className: 'dgs-btn ghost', style: { marginLeft: 12 }, onClick: reload }, t('retry')))
        : openRepo ? h(RepoBrowser, { repo: openRepo, t, onBack: () => setOpenRepo(null) })
        : me === null ? h('div', { className: 'dgs-empty' }, t('loading'))
        : h('div', null,
            h('div', { className: 'dgs-card' },
              h('div', { className: 'dgs-row' },
                h('span', { style: { fontWeight: 700 } }, t('newRepo')),
                h('input', { className: 'dgs-input', placeholder: t('repoName'), value: name,
                  onChange: (e) => setName(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter' && name.trim()) create() } }),
                h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 4, alignItems: 'center' } },
                  h('input', { type: 'checkbox', checked: isPrivate, onChange: (e) => setIsPrivate(e.target.checked) }), t('private')),
                h('button', { className: 'dgs-btn', disabled: busy || !name.trim(), onClick: create }, t('create')))),
            h('div', { style: { height: 10 } }),
            h('div', { style: { fontWeight: 700, margin: '4px 0 10px' } }, `${t('myRepos')}（${me.repos.length}）`),
            me.repos.length === 0 ? h('div', { className: 'dgs-empty' }, t('emptyRepo'))
              : h('div', null, me.repos.map((r) => repoCardEl(r))))

      function repoCardEl(r) {
        const title = h('a', { className: 'dgs-name', onClick: (e) => { e.stopPropagation(); setOpenRepo(r) } },
          r.fullName || (r.owner + '/' + r.name))
        const badge = r.private ? h('span', { className: 'dgs-badge pri' }, t('private')) : null
        const stats = h('span', { className: 'dgs-sub' }, '★ ' + r.stars + ' · ' + t('issues') + ' ' + r.issues)
        const del = h('button', { className: 'dgs-btn danger', onClick: (e) => {
          e.stopPropagation()
          if (!confirm(t('deleteConfirm') + ' ' + r.name + ' ?')) return
          api('DELETE', '/repos/' + r.owner + '/' + r.name).then((d) => { d.ok ? reload() : notify(d.error || 'failed') })
        } }, t('delete'))
        const desc = r.description ? h('div', { className: 'dgs-sub' }, r.description) : null
        return h('div', { key: r.id, className: 'dgs-card dgs-repo', onClick: () => setOpenRepo(r) },
          h('div', { className: 'dgs-row' }, title, badge, h('span', { style: { flex: 1 } }), stats, del), desc)
      }

      return h('div', { className: 'dgs-page' },
        h('div', { className: 'dgs-head' },
          h('div', { className: 'dgs-mark' }),
          h('div', null,
            h('div', { className: 'dgs-h1' }, t('title')),
            h('div', { className: 'dgs-hint' }, t('hint'))),
          kernelUrl ? h('a', { className: 'dgs-sub', style: { marginLeft: 16 }, href: kernelUrl, target: '_blank', rel: 'noreferrer', title: t('advancedHint') }, t('advanced')) : null,
          h('button', { className: 'dgs-close', onClick: onClose, title: 'Esc' }, '✕')),
        h('div', { className: 'dgs-body' }, body),
        toast ? h('div', { className: 'dgs-toast' }, toast) : null)

      async function create() {
        setBusy(true)
        const d = await api('POST', '/repos', { name, private: isPrivate, autoInit: true })
        setBusy(false)
        if (d.ok) { setName(''); notify('✓ ' + name); reload() } else notify(d.error || 'failed')
      }
    }

    // ── 设置节（服务配置，无 iframe） ──────────────────────────────────────────

    function SettingsSection({ t }) {
      const [status, setStatus] = useState(null)
      const [form, setForm] = useState({ enabled: false, host: '127.0.0.1', port: 3400, dataDir: '' })
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      useEffect(() => {
        fetch(API + '/status').then((r) => r.json()).then((d) => {
          setStatus(d)
          setForm({ enabled: !!d.enabled, host: d.host || '127.0.0.1', port: d.port || 3400, dataDir: d.dataDir || '' })
        }).catch(() => {})
      }, [])
      const save = async () => {
        setBusy(true); setMsg('…')
        try {
          const res = await fetch(API + '/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
          const d = await res.json()
          setStatus(d); setMsg('')
        } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
      }
      const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })
      return h('div', { className: 'dgs-settings' },
        h('div', { className: 'dgs-card' },
          h('div', { className: 'dgs-h1' }, t('title')),
          h('div', { className: 'dgs-hint', style: { margin: '4px 0 10px' } }, t('hint')),
          h('div', { className: 'dgs-row' },
            h('label', null, '启用'),
            h('input', { type: 'checkbox', checked: form.enabled, onChange: (e) => setForm({ ...form, enabled: e.target.checked }) })),
          h('div', { className: 'dgs-row' },
            h('label', null, '监听地址'), h('input', { className: 'dgs-input', ...field('host') })),
          h('div', { className: 'dgs-row' },
            h('label', null, '端口'), h('input', { className: 'dgs-input', type: 'number', ...field('port') })),
          h('div', { className: 'dgs-row' },
            h('label', null, '数据目录'), h('input', { className: 'dgs-input', placeholder: '~/.dsh/dsh-git-server/data', ...field('dataDir') })),
          status && status.umAvailable !== 'ok' ? h('div', { className: 'dgs-err' }, 'user-management 服务不可用（回退兜底账号）') : null,
          msg ? h('div', { className: 'dgs-sub' }, msg) : null,
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('button', { className: 'dgs-btn', disabled: busy, onClick: save }, '保存'))))
    }

    // ── utils ─────────────────────────────────────────────────────────────────

    function fmtSize(n) {
      if (n == null) return ''
      if (n < 1024) return n + ' B'
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1048576).toFixed(1) + ' MB'
    }
    function fmtDate(s) {
      if (!s) return ''
      try { return new Date(s).toLocaleString() } catch { return s }
    }

    // ── plugin plane ──────────────────────────────────────────────────────────

    const CLIENT_NAME = '@weibaohui/dsh-git-server'

    module.exports = {
      name: CLIENT_NAME,
      inject: ['slots', 'locale'],
      __internals: { NS, ZH, EN, GitPage, SettingsSection },
      __boot(container, opts = {}) {
        ensureStyles()
        let t = opts.t || ((key) => ZH[key] ?? EN[key] ?? key)
        const root = require('react-dom/client').createRoot(container)
        root.render(h(GitPage, { onClose: () => {}, t }))
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
            ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
              { name: 'sidebar.footer.action', id: CLIENT_NAME, order: 98 },
              function GitEntry() {
                const [open, setOpen] = useState(false)
                const [status, setStatus] = useState(null)
                useEffect(() => { fetch(API + '/status').then((r) => r.json()).then(setStatus).catch(() => {}) }, [])
                return h('div', { style: { display: 'contents' } },
                  h('button', { className: 'dgs-btn ghost', style: { width: '100%', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' },
                    onClick: () => setOpen(true) },
                    h('span', { className: 'dgs-mark', style: { width: 14, height: 14 } }), t('nav'),
                    status && status.running ? h('span', { style: { width: 7, height: 7, borderRadius: 9, background: 'var(--dsw-alias-state-success-primary)', display: 'inline-block' } }) : null),
                  open && h(GitPage, {
                    onClose: () => setOpen(false),
                    t,
                    kernelUrl: status && status.running ? (location.protocol + '//' + location.hostname + ':' + (status.port || 3400)) : null,
                  }))
              }))
          } catch (e) { (globalThis.__skErrors = globalThis.__skErrors || []).push('sidebar:' + (e && e.message)); throw e }
        }, 'dsh-git-server: sidebar entry')

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
              useEffect(ensureStyles, [])
              return h(SettingsSection, { t })
            }))
          } catch (e) { (globalThis.__skErrors = globalThis.__skErrors || []).push('settings:' + (e && e.message)); throw e }
        }, 'dsh-git-server: settings section')
      },
    }

    return module.exports
  }
})
