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
      tags: '标签', pulls: 'PR', wiki: 'Wiki', releases: '发版',
      readme: 'README', noPulls: '暂无 PR', merged: '已合并', merge: '合并',
      mergeConfirm: '确认合并此 PR？', headToBase: '→', newWiki: '新页面',
      edit: '编辑', save: '保存', wikiTitle: '页面名',
      newRelease: '发新版本', tag: 'Tag', relTitle: '标题', relNote: '说明', target: '目标分支/提交',
      noReleases: '暂无发版', noWiki: '暂无页面——创建第一个', deletePage: '删除页面',
      prMerged: '已合并', prOpen: '开启中', prClosed: '已关闭',
      labels: '标签管理', milestones: '里程碑', settings: '设置',
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
      tags: 'Tags', pulls: 'PRs', wiki: 'Wiki', releases: 'Releases',
      readme: 'README', noPulls: 'No pull requests', merged: 'Merged', merge: 'Merge',
      mergeConfirm: 'Merge this PR?', headToBase: '→', newWiki: 'New page',
      edit: 'Edit', save: 'Save', wikiTitle: 'Page name',
      newRelease: 'New release', tag: 'Tag', relTitle: 'Title', relNote: 'Notes', target: 'Target',
      noReleases: 'No releases', noWiki: 'No pages yet — create one', deletePage: 'Delete page',
      prMerged: 'Merged', prOpen: 'Open', prClosed: 'Closed',
      labels: 'Labels', milestones: 'Milestones', settings: 'Settings',
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
    .dgs-md{font-size:13.5px;line-height:1.75}
    .dgs-md h1,.dgs-md h2,.dgs-md h3{margin:14px 0 8px;color:var(--dsw-alias-label-primary)}
    .dgs-md p{margin:8px 0}
    .dgs-md pre{background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;overflow:auto;font-size:12.5px}
    .dgs-md code{background:var(--dsw-alias-markdown-inline-code);border-radius:4px;padding:1px 5px;font-size:12.5px}
    .dgs-md pre code{background:transparent;padding:0}
    .dgs-md a{color:var(--dsw-alias-state-business-primary)}
    .dgs-md img{max-width:100%}
    .dgs-md blockquote{border-left:3px solid var(--dsw-alias-border-l2);margin:8px 0;padding:2px 12px;color:var(--dsw-alias-label-secondary)}
    .dgs-md table{border-collapse:collapse}
    .dgs-md td,.dgs-md th{border:1px solid var(--dsw-alias-border-l2);padding:4px 10px}
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

    // ── hash 路由 ──────────────────────────────────────────────────────────────

    function useHashRoute() {
      const [route, setRoute] = useState(() => location.hash.slice(1) || '/')
      useEffect(() => {
        const on = () => setRoute(location.hash.slice(1) || '/')
        window.addEventListener('hashchange', on)
        return () => window.removeEventListener('hashchange', on)
      }, [])
      return route
    }
    const nav = (hash) => { location.hash = hash }

    // ── 全屏管理页 ────────────────────────────────────────────────────────────

    function RepoBrowser({ repo, t, onBack }) {
      const [tab, setTab] = useState('files')
      const [ov, setOv] = useState(null)
      const [rev, setRev] = useState('')
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => {
          if (!d.defaultBranch) return
          setOv(d)
          setRev(d.defaultBranch)
        })
      }, [repo.owner, repo.name])
      const branchSel = ov && ov.branches && ov.branches.length
        ? h('select', {
            className: 'dgs-input', style: { flex: 'none', width: 'auto', padding: '4px 8px' },
            value: rev, onChange: (e) => setRev(e.target.value),
          }, ov.branches.map((b) => h('option', { key: b, value: b }, b)))
        : null
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 12 } },
          h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
          h('span', { className: 'dgs-h1' }, repo.owner + '/' + repo.name),
          repo.private ? h('span', { className: 'dgs-badge pri' }, t('private')) : null,
          branchSel,
        ),
        h('div', { className: 'dgs-tabs' },
          ['files', 'commits', 'branches', 'tags', 'issues', 'pulls', 'wiki', 'releases', 'labels', 'milestones', 'settings'].map((k) =>
            h('button', { key: k, className: 'dgs-tab' + (tab === k ? ' active' : ''), onClick: () => setTab(k) }, t(k)))),
        tab === 'files' && h(FileTree, { repo, rev: rev || 'master', t, overview: ov, onOverview: setOv }),
        tab === 'commits' && h(Commits, { repo, rev: rev || 'master', t }),
        tab === 'branches' && h(Branches, { repo, t }),
        tab === 'tags' && h(Tags, { repo, ov, t }),
        tab === 'issues' && h(Issues, { repo, t }),
        tab === 'pulls' && h(Pulls, { repo, t }),
        tab === 'wiki' && h(WikiView, { repo, t }),
        tab === 'releases' && h(Releases, { repo, t }),
        tab === 'labels' && h(LabelsManage, { repo, t }),
        tab === 'milestones' && h(MilestonesManage, { repo, t }),
        tab === 'settings' && h(RepoSettings, { repo, t }),
      )
    }

    function FileTree({ repo, rev, t, overview, onOverview }) {
      const [path, setPath] = useState('')
      const [entries, setEntries] = useState(null)
      const [file, setFile] = useState(null)
      const [err, setErr] = useState('')
      const [readme, setReadme] = useState(null)
      const [blameOn, setBlameOn] = useState(false)
      const load = useCallback((p) => {
        setFile(null); setEntries(null); setErr(''); setBlameOn(false)
        api('GET', `/repos/${repo.owner}/${repo.name}/tree?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(p)}`)
          .then((d) => d.ok ? setEntries(d.entries || []) : setErr(d.error || t('loadFailed')))
        if (p === '' && overview === undefined) {
          api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => d.defaultBranch && onOverview(d))
        }
        if (p !== '') setReadme(null)
      }, [repo.owner, repo.name, rev])
      useEffect(() => { load(path) }, [load, path])
      const openEntry = (e) => {
        const p = e.path
        if (e.type === 'dir' || e.type === 'tree') setPath(p)
        else api('GET', `/repos/${repo.owner}/${repo.name}/raw?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(p)}`)
          .then((d) => setFile({ name: e.name, text: d.ok ? d.text : null }))
      }
      const crumbs = ['', ...path ? path.split('/') : []]
      return h('div', null,
        h('div', { className: 'dgs-crumbs' },
          h('span', { className: 'dgs-crumb cur' }, rev),
          path.split('/').filter(Boolean).map((seg, i, arr) =>
            h('span', { key: i },
              h('span', { className: 'dgs-crumb', onClick: () => setPath(arr.slice(0, i + 1).join('/')) }, seg),
              i < arr.length - 1 ? h('span', { className: 'dgs-sub' }, '/') : null))),
        err ? h('div', { className: 'dgs-err' }, err) : null,
        file ? h('div', null,
          h('div', { className: 'dgs-row', style: { margin: '8px 0' } },
            h('button', { className: 'dgs-btn ghost', onClick: () => setFile(null) }, t('back')),
            h('span', { className: 'dgs-sub' }, file.name),
            h('span', { style: { flex: 1 } }),
            file.text !== null ? h('button', { className: 'dgs-btn ghost', onClick: () => setBlameOn(!blameOn) }, 'Blame') : null),
          blameOn && file.text !== null
            ? h(BlameView, { repo, rev, path, text: file.text })
            : h('pre', { className: 'dgs-file' }, file.text === null ? t('emptyFile') : file.text))
        : entries === null ? h('div', { className: 'dgs-empty' }, t('loading'))
        : renderDir(),
      )

      function renderDir() {
        const rows = entries.map((e) =>
          h('tr', { key: e.path, style: { cursor: 'pointer' }, onClick: () => openEntry(e) },
            h('td', { style: { width: 24 } }, h('span', { className: 'dgs-ico' }, e.type === 'dir' || e.type === 'tree' ? '📁' : '📄')),
            h('td', null, e.name),
            h('td', { className: 'dgs-sub', style: { textAlign: 'right' } }, e.type === 'blob' ? fmtSize(e.size) : '')))
        const table = entries.length === 0
          ? h('div', { className: 'dgs-empty' }, t('emptyDir'))
          : h('table', { className: 'dgs-table' }, h('tbody', null, rows))
        const readmeEl = (path === '' && overview && overview.readmeHtml)
          ? h('div', { className: 'dgs-card', style: { marginTop: 12 } },
              h('div', { style: { fontWeight: 700, marginBottom: 8 } }, t('readme')),
              h('div', { className: 'dgs-md', dangerouslySetInnerHTML: { __html: overview.readmeHtml } }))
          : null
        return h('div', null, table, readmeEl)
      }
    }

    function Commits({ repo, rev, t }) {
      const [list, setList] = useState(null)
      const [sel, setSel] = useState(null)
      useEffect(() => {
        api('GET', `/repos/${repo.owner}/${repo.name}/commits?ref=${encodeURIComponent(rev)}`)
          .then((d) => setList(d.commits || []))
      }, [repo.owner, repo.name, rev])
      if (sel) return h(CommitDetail, { repo, sha: sel, t, onBack: () => setSel(null) })
      if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return list.length === 0 ? h('div', { className: 'dgs-empty' }, t('emptyDir'))
        : h('table', { className: 'dgs-table' },
            h('tbody', null, list.map((c, i) =>
              h('tr', { key: i, style: { cursor: 'pointer' }, onClick: () => setSel(c.sha) },
                h('td', null, h('div', { style: { fontWeight: 500 } }, (c.message || '').split('\n')[0]),
                  h('div', { className: 'dgs-sub' }, `${c.author} · ${fmtDate(c.date)}`)),
                h('td', { className: 'dgs-sub', style: { textAlign: 'right' } }, (c.sha || '').slice(0, 10))))))
    }

    function CommitDetail({ repo, sha, t, onBack }) {
      const [d, setD] = useState(null)
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/commits/${sha}`).then((x) => x && x.sha ? setD(x) : setD(x || {}))
      }, [repo.owner, repo.name, sha])
      if (!d || !d.sha) return h('div', { className: 'dgs-empty' }, t('loading'))
      const when = d.committer && d.committer.when
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 10 } },
          h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
          h('span', { style: { fontWeight: 600 } }, (d.message || '').split('\n')[0]),
          h('span', { className: 'dgs-sub' }, (d.sha || '').slice(0, 10))),
        h('div', { className: 'dgs-sub', style: { marginBottom: 8 } },
          `${(d.author && d.author.name) || ''} · ${fmtDate(when)}`),
        h('pre', { className: 'dgs-file' }, d.files || '—'))
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
      const [issue, setIssue] = useState(null)
      const [comments, setComments] = useState(null)
      const [text, setText] = useState('')
      const [busy, setBusy] = useState(false)
      const [editing, setEditing] = useState(false)
      const [draft, setDraft] = useState({ title: '', body: '' })
      const [allLabels, setAllLabels] = useState([])
      const [allMs, setAllMs] = useState([])
      const [collabs, setCollabs] = useState([])
      const [msg, setMsg] = useState('')
      const reload = useCallback(() => {
        setComments(null)
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/issues/${idx}`).then((d) => setIssue(d && d.number ? d : null))
        api('GET', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`).then((d) => setComments(d.comments || []))
      }, [repo.owner, repo.name, idx])
      useEffect(reload, [reload])
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setAllLabels(Array.isArray(d) ? d : []))
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setAllMs(Array.isArray(d) ? d : []))
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setCollabs(Array.isArray(d) ? d : []))
      }, [repo.owner, repo.name])
      if (!issue) return h('div', { className: 'dgs-empty' }, t('loading'))
      const patch = async (fields) => {
        setBusy(true); setMsg('')
        const d = await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/issues/${idx}`, fields)
        setBusy(false)
        if (d && d.ok) { setEditing(false); reload() } else setMsg((d && d.error) || 'failed')
      }
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 10 } },
          h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
          h('span', { style: { fontWeight: 600 } }, '#' + idx + ' ' + issue.title),
          h('span', { className: 'dgs-badge' + (issue.state === 'open' ? ' ok' : ' closed') }, issue.state === 'open' ? t('openState') : t('closedState')),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dgs-btn ghost', onClick: () => { setDraft({ title: issue.title, body: issue.body }); setEditing(!editing) } }, t('edit')),
          h('button', { className: 'dgs-btn danger', disabled: busy,
            onClick: async () => {
              setBusy(true)
              await api('PATCH', `/repos/${repo.owner}/${repo.name}/issues/${idx}`, { state: issue.state === 'open' ? 'closed' : 'open' })
              setBusy(false); reload()
            } }, issue.state === 'open' ? t('close') : t('reopen'))),
        msg ? h('div', { className: 'dgs-err' }, msg) : null,
        editing ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
          h('input', { className: 'dgs-input', value: draft.title, onChange: (e) => setDraft({ ...draft, title: e.target.value }) }),
          h('textarea', { className: 'dgs-input', style: { marginTop: 8 }, value: draft.body, onChange: (e) => setDraft({ ...draft, body: e.target.value }) }),
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('button', { className: 'dgs-btn', disabled: busy || !draft.title.trim(), onClick: () => patch({ title: draft.title, body: draft.body }) }, t('save'))))
          : h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
              issue.body ? h('div', { style: { whiteSpace: 'pre-wrap' } }, issue.body) : h('div', { className: 'dgs-sub' }, '—'),
              h('div', { className: 'dgs-row', style: { marginTop: 10, flexWrap: 'wrap' } },
                (issue.labels || []).map((l) => h('span', { key: l.id, className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33' } }, l.name)),
                issue.milestone ? h('span', { className: 'dgs-badge' }, '◆ ' + issue.milestone.title) : null,
                issue.assignee ? h('span', { className: 'dgs-badge' }, '@' + issue.assignee) : null)),
        h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
          h('div', { className: 'dgs-sub', style: { marginBottom: 8 } }, '标签 · 里程碑 · 负责人'),
          h('div', { className: 'dgs-row', style: { flexWrap: 'wrap' } },
            allLabels.map((l) => h('label', { key: l.id, className: 'dgs-sub', style: { display: 'flex', gap: 4, alignItems: 'center', marginRight: 10 } },
              h('input', { type: 'checkbox', checked: (issue.labels || []).some((x) => x.id === l.id),
                onChange: (e) => {
                  const cur = new Set((issue.labels || []).map((x) => x.id))
                  if (e.target.checked) cur.add(l.id); else cur.delete(l.id)
                  patch({ labels: [...cur] })
                } }), l.name))),
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('select', { className: 'dgs-input', style: { maxWidth: 180 }, value: issue.milestone ? issue.milestone.id : '',
              onChange: (e) => patch({ milestone: Number(e.target.value) || 0 }) },
              h('option', { value: '' }, '里程碑 —'),
              allMs.map((m) => h('option', { key: m.id, value: m.id }, m.title + (m.closed ? ' ✓' : '')))),
            h('select', { className: 'dgs-input', style: { maxWidth: 180 }, value: issue.assignee || '',
              onChange: (e) => patch({ assignee: e.target.value }) },
              h('option', { value: '' }, '负责人 —'),
              collabs.map((u) => h('option', { key: u.name, value: u.name }, u.name))))),
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

    // ── 标签 ───────────────────────────────────────────────────────────────────

    function Tags({ repo, ov, t }) {
      if (!ov) return h('div', { className: 'dgs-empty' }, t('loading'))
      return ov.tags.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
        : h('table', { className: 'dgs-table' },
            h('tbody', null, ov.tags.map((name) =>
              h('tr', { key: name },
                h('td', { style: { fontWeight: 500 } }, name),
                h('td', { className: 'dgs-sub', style: { textAlign: 'right' } }, t('tags'))))))
    }

    // ── Blame ──────────────────────────────────────────────────────────────────

    function BlameView({ repo, rev, path, text }) {
      const [lines, setLines] = useState(null)
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/blame?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(path)}`)
          .then((d) => setLines(d.lines || []))
      }, [repo.owner, repo.name, rev, path])
      if (lines === null) return h('div', { className: 'dgs-empty' }, '…')
      const codeLines = (text || '').split('\n')
      return h('table', { className: 'dgs-table' },
        h('tbody', null, codeLines.map((code, i) => {
          const bl = lines.find((l) => l.line === i + 1) || {}
          return h('tr', { key: i },
            h('td', { className: 'dgs-sub', style: { textAlign: 'right', width: 34 } }, String(i + 1)),
            h('td', { className: 'dgs-sub', style: { width: 170, whiteSpace: 'nowrap' } },
              bl.author ? `${bl.author} · ${(bl.sha || '').slice(0, 7)}` : ''),
            h('td', null, h('span', { style: { whiteSpace: 'pre-wrap', fontSize: 12.5 } }, code)))
        })))
    }

    // ── 标签管理 ───────────────────────────────────────────────────────────────

    function LabelsManage({ repo, t }) {
      const [list, setList] = useState(null)
      const [form, setForm] = useState({ name: '', color: '#70c24a' })
      const [msg, setMsg] = useState('')
      const reload = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setList(Array.isArray(d) ? d : []))
      useEffect(() => { reload() }, [repo.owner, repo.name])
      return h('div', null,
        h('div', { className: 'dgs-card', style: { marginBottom: 12 } },
          h('div', { className: 'dgs-row' },
            h('input', { className: 'dgs-input', style: { maxWidth: 160 }, placeholder: '标签名', value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) }),
            h('input', { type: 'color', value: form.color, onChange: (e) => setForm({ ...form, color: e.target.value }), style: { width: 36, height: 30, padding: 0, border: 'none', background: 'none' } }),
            h('button', { className: 'dgs-btn', disabled: !form.name.trim(),
              onClick: async () => {
                const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/labels`, form)
                if (d && d.ok !== false && !d.error) { setForm({ name: '', color: '#70c24a' }); reload() } else setMsg((d && d.error) || 'failed')
              } }, '+ 添加')),
          msg ? h('div', { className: 'dgs-err' }, msg) : null),
        list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : list.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
          : list.map((l) => h('div', { key: l.id, className: 'dgs-issue' },
              h('span', { className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33', borderColor: l.color || '#70c24a' } }, l.name),
              h('button', { className: 'dgs-btn danger', onClick: async () => {
                await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/labels/${l.id}`); reload()
              } }, t('delete')))))
    }

    // ── 里程碑管理 ─────────────────────────────────────────────────────────────

    function MilestonesManage({ repo, t }) {
      const [list, setList] = useState(null)
      const [title, setTitle] = useState('')
      const [msg, setMsg] = useState('')
      const reload = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setList(Array.isArray(d) ? d : []))
      useEffect(() => { reload() }, [repo.owner, repo.name])
      return h('div', null,
        h('div', { className: 'dgs-card', style: { marginBottom: 12 } },
          h('div', { className: 'dgs-row' },
            h('input', { className: 'dgs-input', style: { maxWidth: 200 }, placeholder: '里程碑名', value: title, onChange: (e) => setTitle(e.target.value) }),
            h('button', { className: 'dgs-btn', disabled: !title.trim(),
              onClick: async () => {
                const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/milestones`, { title })
                if (d && d.ok !== false && !d.error) { setTitle(''); reload() } else setMsg((d && d.error) || 'failed')
              } }, '+ 添加')),
          msg ? h('div', { className: 'dgs-err' }, msg) : null),
        list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : list.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
          : list.map((m) => h('div', { key: m.id, className: 'dgs-issue' },
              h('div', { className: 'dgs-row' },
                h('span', { style: { fontWeight: 500 } }, '◆ ' + m.title),
                m.closed ? h('span', { className: 'dgs-badge closed' }, t('closedState')) : null,
                h('span', { style: { flex: 1 } }),
                h('span', { className: 'dgs-sub' }, `${m.open} ↑ / ${m.closedIssues} ✓`),
                h('button', { className: 'dgs-btn ghost', onClick: async () => {
                  await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/milestones/${m.id}`, { closed: !m.closed }); reload()
                } }, m.closed ? t('reopen') : t('close')),
                h('button', { className: 'dgs-btn danger', onClick: async () => {
                  await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/milestones/${m.id}`); reload()
                } }, t('delete'))))))
    }

    // ── 仓库设置（基础信息 + 协作者） ──────────────────────────────────────────

    function RepoSettings({ repo, t }) {
      const [info, setInfo] = useState(null)
      const [form, setForm] = useState({ description: '', private: false })
      const [collabs, setCollabs] = useState([])
      const [addName, setAddName] = useState('')
      const [msg, setMsg] = useState('')
      const [busy, setBusy] = useState(false)
      const loadCollabs = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setCollabs(Array.isArray(d) ? d : []))
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}`).then((d) => {
          if (d && d.name) { setInfo(d); setForm({ description: d.description || '', private: !!d.private }) }
          else setMsg((d && d.error) || t('loadFailed'))
        })
        loadCollabs()
      }, [repo.owner, repo.name])
      return h('div', null,
        msg ? h('div', { className: 'dgs-err' }, msg) : null,
        info === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : h('div', null,
              h('div', { className: 'dgs-card', style: { marginBottom: 12 } },
                h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '基础信息'),
                h('div', { className: 'dgs-row' },
                  h('span', { className: 'dgs-sub', style: { minWidth: 50 } }, '描述'),
                  h('input', { className: 'dgs-input', value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }) })),
                h('div', { className: 'dgs-row' },
                  h('span', { className: 'dgs-sub', style: { minWidth: 50 } }, '可见性'),
                  h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 4, alignItems: 'center' } },
                    h('input', { type: 'checkbox', checked: form.private, onChange: (e) => setForm({ ...form, private: e.target.checked }) }), t('private'))),
                h('div', { className: 'dgs-row', style: { marginTop: 8 } },
                  h('button', { className: 'dgs-btn', disabled: busy,
                    onClick: async () => {
                      setBusy(true); setMsg('')
                      const d = await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}`, form)
                      setBusy(false)
                      d && d.ok ? setMsg('✓ 已保存') : setMsg((d && d.error) || 'failed')
                    } }, t('save')))),
              h('div', { className: 'dgs-card' },
                h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '协作者'),
                h('div', { className: 'dgs-row' },
                  h('input', { className: 'dgs-input', style: { maxWidth: 200 }, placeholder: '用户名', value: addName, onChange: (e) => setAddName(e.target.value) }),
                  h('button', { className: 'dgs-btn', disabled: !addName.trim(),
                    onClick: async () => {
                      const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/collaborators/${encodeURIComponent(addName.trim())}`)
                      if (d && d.ok !== false && !d.error) { setAddName(''); setMsg(''); loadCollabs() } else setMsg((d && d.error) || 'failed')
                    } }, '+ 添加')),
                collabs.length === 0 ? h('div', { className: 'dgs-sub', style: { marginTop: 8 } }, '—') : null,
                collabs.map((u) => h('div', { key: u.name, className: 'dgs-row', style: { marginTop: 6 } },
                  h('a', { className: 'dgs-name', href: '#/u/' + u.name }, u.name),
                  h('span', { style: { flex: 1 } }),
                  h('button', { className: 'dgs-btn danger', onClick: async () => {
                    await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/collaborators/${encodeURIComponent(u.name)}`)
                    loadCollabs()
                  } }, t('delete')))))))
    }

    // ── PR（列表 + 详情 + 合并 + 评论复用 issue 通道） ────────────────────────

    function Pulls({ repo, t }) {
      const [list, setList] = useState(null)
      const [openIdx, setOpenIdx] = useState(null)
      const [creating, setCreating] = useState(false)
      const [branches, setBranches] = useState([])
      const [form, setForm] = useState({ title: '', head: '', base: '', body: '' })
      const [msg, setMsg] = useState('')
      const [busy, setBusy] = useState(false)
      const [preview, setPreview] = useState(null)
      const reload = useCallback(() => {
        setList(null)
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/pulls`).then((d) => setList(Array.isArray(d) ? d : (d.data || d.pulls || [])))
      }, [repo.owner, repo.name])
      useEffect(() => {
        if (!creating || !form.head || !form.base || form.head === form.base) { setPreview(null); return }
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/compare?base=${encodeURIComponent(form.base)}&head=${encodeURIComponent(form.head)}`)
          .then((d) => setPreview(d && d.commits ? d : null))
      }, [creating, form.head, form.base, repo.owner, repo.name])
      useEffect(reload, [reload])
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => {
          setBranches(d.branches || [])
          setForm((f) => ({ ...f, base: d.defaultBranch || 'master' }))
        })
      }, [repo.owner, repo.name])
      if (openIdx !== null) return h(PullDetail, { repo, idx: openIdx, t, onBack: () => { setOpenIdx(null); reload() } })
      if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return h('div', null,
        h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
          h('button', { className: 'dgs-btn', onClick: () => setCreating(!creating) }, '+ ' + t('pulls'))),
        msg ? h('div', { className: 'dgs-err' }, msg) : null,
        creating ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
          h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
            h('input', { className: 'dgs-input', placeholder: t('issueTitle'), value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) }),
            h('select', { className: 'dgs-input', style: { maxWidth: 140 }, value: form.head, onChange: (e) => setForm({ ...form, head: e.target.value }) },
              h('option', { value: '' }, t('pulls') + ' ←'),
              branches.map((b) => h('option', { key: b, value: b }, b))),
            h('span', { className: 'dgs-sub' }, t('headToBase')),
            h('select', { className: 'dgs-input', style: { maxWidth: 140 }, value: form.base, onChange: (e) => setForm({ ...form, base: e.target.value }) },
              branches.map((b) => h('option', { key: b, value: b }, b)))),
          h('textarea', { className: 'dgs-input', placeholder: t('issueBody'), value: form.body, onChange: (e) => setForm({ ...form, body: e.target.value }) }),
          preview ? h('div', { className: 'dgs-card', style: { margin: '8px 0', padding: 10 } },
            h('div', { className: 'dgs-sub', style: { marginBottom: 6 } }, `${preview.commits.length} commits`),
            h('pre', { className: 'dgs-file' }, preview.diffStat || '—')) : null,
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('button', { className: 'dgs-btn', disabled: busy || !form.title.trim() || !form.head,
              onClick: async () => {
                setBusy(true); setMsg('')
                const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/pulls`, form)
                setBusy(false)
                if (d.ok) { setCreating(false); reload() } else setMsg(d.error || 'failed')
              } }, t('submit')))) : null,
        list.length === 0 && !creating ? h('div', { className: 'dgs-empty' }, t('noPulls')) : null,
        list.map((p) =>
            h('div', { key: p.index, className: 'dgs-issue', style: { cursor: 'pointer' }, onClick: () => setOpenIdx(p.index) },
              h('div', { className: 'dgs-row' },
                h('span', { className: 'dgs-badge' + (p.state === 'merged' ? '' : p.state === 'open' ? ' ok' : ' closed') },
                  p.state === 'merged' ? t('prMerged') : p.state === 'open' ? t('prOpen') : t('prClosed')),
                h('span', { style: { fontWeight: 500 } }, p.title),
                h('span', { style: { flex: 1 } }),
                h('span', { className: 'dgs-sub' }, `${p.head} ${t('headToBase')} ${p.base}`)),
              h('div', { className: 'dgs-sub' }, `#${p.index} · ${p.author || ''} · ${fmtDate(p.updatedAt * 1000 || p.updatedAt)}`))))
    }

    function PullDetail({ repo, idx, t, onBack }) {
      const [pr, setPr] = useState(null)
      const [comments, setComments] = useState(null)
      const [text, setText] = useState('')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      useEffect(() => {
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/pulls`).then((d) => {
          const all = Array.isArray(d) ? d : (d.data || d.pulls || [])
          setPr(all.find((x) => x.index === idx) || null)
        })
        api('GET', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`).then((d) => setComments(d.comments || []))
      }, [repo.owner, repo.name, idx])
      if (pr === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 10 } },
          h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
          h('span', { style: { fontWeight: 600 } }, `#${idx} ${pr.title}`),
          h('span', { className: 'dgs-sub' }, `${pr.head} ${t('headToBase')} ${pr.base}`),
          h('span', { style: { flex: 1 } }),
          pr.state === 'open' ? h('button', { className: 'dgs-btn', disabled: busy,
            onClick: async () => {
              if (!confirm(t('mergeConfirm'))) return
              setBusy(true); setMsg('')
              const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/pulls/${idx}/merge`)
              setBusy(false)
              d.ok !== false && !d.error ? onBack() : setMsg(d.error || 'merge failed')
            } }, '⇆ ' + t('merge')) : h('span', { className: 'dgs-badge' }, t('prMerged'))),
        msg ? h('div', { className: 'dgs-err' }, msg) : null,
        (comments || []).map((c) =>
          h('div', { key: c.id, className: 'dgs-comment' },
            h('div', { className: 'dgs-sub', style: { marginBottom: 4 } }, `${c.user || ''} · ${fmtDate(c.created)}`),
            h('div', { style: { whiteSpace: 'pre-wrap' } }, c.body))),
        h('div', { className: 'dgs-card' },
          h('textarea', { className: 'dgs-input', placeholder: t('commentPlaceholder'), value: text, onChange: (e) => setText(e.target.value) }),
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('button', { className: 'dgs-btn', disabled: busy || !text.trim(),
              onClick: async () => {
                setBusy(true)
                await api('POST', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`, { body: text })
                setText(''); setBusy(false)
                api('GET', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`).then((d) => setComments(d.comments || []))
              } }, t('comment')))))
    }

    // ── Wiki（列表 + 查看[渲染] + 编辑/新建） ──────────────────────────────────

    function WikiView({ repo, t }) {
      const [pages, setPages] = useState(null)
      const [page, setPage] = useState(null) // {name, html, content}
      const [editing, setEditing] = useState(false)
      const [draft, setDraft] = useState('')
      const [newName, setNewName] = useState('')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      const reload = useCallback(() => {
        setPages(null)
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/wiki`).then((d) => setPages(d.pages || []))
      }, [repo.owner, repo.name])
      useEffect(reload, [reload])
      const openPage = (name) => {
        setEditing(false); setMsg('')
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(name)}`)
          .then((d) => d.html !== undefined ? setPage(d) : setPage({ name, missing: true, content: '', html: '' }))
      }
      return h('div', { className: 'dgs-row', style: { alignItems: 'flex-start' } },
        h('div', { style: { width: 180, flex: 'none' } },
          h('div', { style: { fontWeight: 700, margin: '4px 0 8px' } }, t('wiki')),
          pages === null ? h('div', { className: 'dgs-sub' }, t('loading'))
            : pages.length === 0 ? h('div', { className: 'dgs-sub' }, t('noWiki'))
            : h('div', null, pages.map((p) =>
                h('div', { key: p.name, className: 'dgs-crumb', style: { padding: '3px 0' }, onClick: () => openPage(p.name) }, p.name))),
          h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l2)', margin: '10px 0' } }),
          h('input', { className: 'dgs-input', style: { width: '100%', marginBottom: 6 }, placeholder: t('wikiTitle'), value: newName, onChange: (e) => setNewName(e.target.value) }),
          h('button', { className: 'dgs-btn ghost', disabled: !newName.trim(),
            onClick: () => { setPage({ name: newName.trim(), content: '', html: '' }); setDraft(''); setEditing(true); setNewName('') } }, '+ ' + t('newWiki'))),
        h('div', { style: { flex: 1, minWidth: 0, paddingLeft: 16 } },
          msg ? h('div', { className: 'dgs-err' }, msg) : null,
          page === null ? h('div', { className: 'dgs-empty' }, pages && pages.length ? '← ' + t('wiki') : t('noWiki'))
          : editing ? h('div', null,
              h('div', { className: 'dgs-row', style: { margin: '4px 0 8px' } },
                h('span', { style: { fontWeight: 600 } }, page.name + '.md'),
                h('span', { style: { flex: 1 } }),
                h('button', { className: 'dgs-btn ghost', onClick: () => page.html ? setEditing(false) : setPage(null) }, t('back')),
                h('button', { className: 'dgs-btn', disabled: busy,
                  onClick: async () => {
                    setBusy(true); setMsg('')
                    const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(page.name)}`, { content: draft })
                    setBusy(false)
                    if (d.ok) { setEditing(false); reload(); openPage(page.name) } else setMsg(d.error || 'save failed')
                  } }, t('save'))),
              h('textarea', { className: 'dgs-input', style: { minHeight: '50vh' }, value: draft, onChange: (e) => setDraft(e.target.value) }))
          : page.missing ? h('div', { className: 'dgs-empty' }, '404')
          : h('div', null,
              h('div', { className: 'dgs-row', style: { margin: '4px 0 8px' } },
                h('span', { style: { fontWeight: 600 } }, page.name),
                h('span', { style: { flex: 1 } }),
                h('button', { className: 'dgs-btn ghost', onClick: () => { setDraft(page.content || ''); setEditing(true) } }, t('edit'))),
              h('div', { className: 'dgs-card' },
                h('div', { className: 'dgs-md', dangerouslySetInnerHTML: { __html: page.html } })))))
    }

    // ── 发版（列表 + 创建） ────────────────────────────────────────────────────

    function Releases({ repo, t }) {
      const [list, setList] = useState(null)
      const [creating, setCreating] = useState(false)
      const [form, setForm] = useState({ tag: '', title: '', note: '', target: '' })
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      const reload = useCallback(() => {
        setList(null)
        api('GET', `/dsh/repos/${repo.owner}/${repo.name}/releases`).then((d) => setList(Array.isArray(d) ? d : (d.data || [])))
      }, [repo.owner, repo.name])
      useEffect(reload, [reload])
      return h('div', null,
        h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
          h('span', { style: { fontWeight: 700 } }, t('releases')),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dgs-btn', onClick: () => setCreating(!creating) }, '+ ' + t('newRelease'))),
        msg ? h('div', { className: 'dgs-err' }, msg) : null,
        creating ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
          h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
            h('input', { className: 'dgs-input', style: { maxWidth: 160 }, placeholder: 'v0.1.0', value: form.tag, onChange: (e) => setForm({ ...form, tag: e.target.value }) }),
            h('input', { className: 'dgs-input', placeholder: t('relTitle'), value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) }),
            h('input', { className: 'dgs-input', style: { maxWidth: 160 }, placeholder: t('target'), value: form.target, onChange: (e) => setForm({ ...form, target: e.target.value }) })),
          h('textarea', { className: 'dgs-input', placeholder: t('relNote'), value: form.note, onChange: (e) => setForm({ ...form, note: e.target.value }) }),
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('button', { className: 'dgs-btn', disabled: busy || !form.tag.trim(),
              onClick: async () => {
                setBusy(true); setMsg('')
                const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/releases`, form)
                setBusy(false)
                if (d.ok) { setCreating(false); setForm({ tag: '', title: '', note: '', target: '' }); reload() }
                else setMsg(d.error || 'failed')
              } }, t('submit')))) : null,
        list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : list.length === 0 ? h('div', { className: 'dgs-empty' }, t('noReleases'))
          : list.map((r) =>
              h('div', { key: r.id, className: 'dgs-card' },
                h('div', { className: 'dgs-row' },
                  h('span', { className: 'dgs-badge ok' }, r.tag),
                  h('span', { style: { fontWeight: 600 } }, r.title),
                  h('span', { style: { flex: 1 } }),
                  h('span', { className: 'dgs-sub' }, `${r.author || ''} · ${fmtDate((r.createdAt || 0) * 1000)}`)),
                r.noteHtml ? h('div', { className: 'dgs-md', style: { marginTop: 8 }, dangerouslySetInnerHTML: { __html: r.noteHtml } }) : null)))
    }

    // ── 探索 ───────────────────────────────────────────────────────────────────

    function Explore({ t }) {
      const [q, setQ] = useState('')
      const [tab, setTab] = useState('repos')
      const [repos, setRepos] = useState(null)
      const [users, setUsers] = useState(null)
      const load = useCallback(() => {
        api('GET', '/dsh/explore/repos?q=' + encodeURIComponent(q)).then((d) => setRepos(d.data || d || []))
        api('GET', '/dsh/explore/users?q=' + encodeURIComponent(q)).then((d) => setUsers(d.data || d || []))
      }, [q])
      useEffect(() => { const tm = setTimeout(load, 300); return () => clearTimeout(tm) }, [q])
      return h('div', null,
        h('input', { className: 'dgs-input', style: { width: '100%', marginBottom: 12 }, placeholder: '搜索仓库 / 用户', value: q, onChange: (e) => setQ(e.target.value) }),
        h('div', { className: 'dgs-tabs' },
          ['repos', 'users'].map((k) =>
            h('button', { key: k, className: 'dgs-tab' + (tab === k ? ' active' : ''), onClick: () => setTab(k) }, k === 'repos' ? '仓库' : '用户'))),
        tab === 'repos' && (repos === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : repos.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
          : repos.map((r) =>
              h('div', { key: r.owner + '/' + r.name, className: 'dgs-card' },
                h('div', { className: 'dgs-row' },
                  h('a', { className: 'dgs-name', href: '#/r/' + r.owner + '/' + r.name }, r.owner + '/' + r.name),
                  h('span', { style: { flex: 1 } }),
                  h('span', { className: 'dgs-sub' }, '★ ' + r.stars)),
                r.description ? h('div', { className: 'dgs-sub' }, r.description) : null))),
        tab === 'users' && (users === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : users.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
          : users.map((u) =>
              h('div', { key: u.name, className: 'dgs-card' },
                h('a', { className: 'dgs-name', href: '#/u/' + u.name }, u.name),
                u.full_name ? h('span', { className: 'dgs-sub', style: { marginLeft: 8 } }, u.full_name) : null))))
    }

    // ── 组织 ───────────────────────────────────────────────────────────────────

    function Orgs({ t }) {
      const [list, setList] = useState(null)
      const [name, setName] = useState('')
      const [msg, setMsg] = useState('')
      const reload = () => api('GET', '/dsh/orgs').then((d) => setList(d.data || d || []))
      useEffect(() => { reload() }, [])
      return h('div', null,
        h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
          h('span', { style: { fontWeight: 700 } }, '我的组织'),
          h('input', { className: 'dgs-input', style: { maxWidth: 200 }, placeholder: '新组织名', value: name, onChange: (e) => setName(e.target.value) }),
          h('button', { className: 'dgs-btn', disabled: !name.trim(),
            onClick: async () => {
              const d = await api('POST', '/dsh/orgs', { name })
              d.ok ? (setMsg(''), reload()) : setMsg(d.error || 'failed')
            } }, '创建')),
        msg ? h('div', { className: 'dgs-err' }, msg) : null,
        list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : list.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
          : list.map((o) =>
              h('div', { key: o.name || o, className: 'dgs-card' },
                h('a', { className: 'dgs-name', href: '#/org/' + (o.name || o) }, o.name || o))))
    }

    function OrgView({ name, t, kernelUrl }) {
      const [org, setOrg] = useState(null)
      useEffect(() => {
        api('GET', '/dsh/orgs/' + encodeURIComponent(name)).then((d) => setOrg(d.data || d))
      }, [name])
      if (org === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 12 } },
          h('span', { className: 'dgs-h1' }, name),
          org.fullName ? h('span', { className: 'dgs-sub' }, org.fullName) : null),
        h('div', { className: 'dgs-card' },
          h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '成员'),
          (org.members || []).map((m) =>
            h('div', { key: m.name, className: 'dgs-row' },
              h('a', { className: 'dgs-name', href: '#/u/' + m.name }, m.name),
              m.owner ? h('span', { className: 'dgs-badge' }, 'owner') : null))),
        h('div', { className: 'dgs-card' },
          h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '仓库'),
          (org.repos || []).length === 0 ? h('div', { className: 'dgs-sub' }, '—')
            : org.repos.map((r) =>
                h('div', { key: r.name }, h('a', { className: 'dgs-name', href: '#/r/' + name + '/' + r.name }, r.name)))),
        kernelUrl ? h('a', { className: 'dgs-sub', href: kernelUrl + '/org/' + name, target: '_blank', rel: 'noreferrer' }, '进阶管理 ↗') : null)
    }

    // ── 用户 profile ───────────────────────────────────────────────────────────

    function UserProfile({ name, t }) {
      const [profile, setProfile] = useState(null)
      useEffect(() => {
        api('GET', '/dsh/users/' + encodeURIComponent(name)).then((d) => setProfile(d.data || d))
      }, [name])
      if (profile === null) return h('div', { className: 'dgs-empty' }, t('loading'))
      return h('div', null,
        h('div', { className: 'dgs-row', style: { marginBottom: 12 } },
          h('span', { className: 'dgs-h1' }, name),
          profile.isAdmin ? h('span', { className: 'dgs-badge ok' }, 'admin') : null,
          h('span', { style: { flex: 1 } }),
          h('span', { className: 'dgs-sub' }, `${profile.followers.length} 粉丝 · ${profile.following.length} 关注`)),
        h('div', { style: { fontWeight: 700, margin: '4px 0 10px' } }, '仓库'),
        profile.repos.length === 0 ? h('div', { className: 'dgs-empty' }, '—') : null,
        profile.repos.map((r) =>
          h('div', { key: r.name, className: 'dgs-card dgs-repo', onClick: () => nav('/r/' + r.owner + '/' + r.name), style: { cursor: 'pointer' } },
            h('div', { className: 'dgs-row' },
              h('span', { className: 'dgs-name' }, r.owner + '/' + r.name),
              h('span', { style: { flex: 1 } }),
              h('span', { className: 'dgs-sub' }, '★ ' + r.stars)),
            r.description ? h('div', { className: 'dgs-sub' }, r.description) : null)),
        h('div', { style: { fontWeight: 700, margin: '12px 0 10px' } }, '动态'),
        profile.activity.length === 0 ? h('div', { className: 'dgs-empty' }, '—') : null,
        profile.activity.map((a, i) =>
          h('div', { key: i, className: 'dgs-card', style: { padding: '8px 14px' } },
            h('span', { className: 'dgs-sub' }, `${a.repo} · ${fmtDate(a.date * 1000)}`))))
    }

    // ── 管理面板 ───────────────────────────────────────────────────────────────

    function Admin({ t }) {
      const [tab, setTab] = useState('summary')
      const [data, setData] = useState(null)
      useEffect(() => {
        if (tab === 'summary') api('GET', '/dsh/admin/summary').then((d) => setData(d))
        if (tab === 'users') api('GET', '/dsh/admin/users').then((d) => setData(d))
        if (tab === 'repos') api('GET', '/dsh/admin/repos').then((d) => setData(d))
      }, [tab])
      return h('div', null,
        h('div', { className: 'dgs-tabs' },
          [['summary', '概况'], ['users', '用户'], ['repos', '仓库']].map(([k, label]) =>
            h('button', { key: k, className: 'dgs-tab' + (tab === k ? ' active' : ''), onClick: () => setTab(k) }, label))),
        data === null ? h('div', { className: 'dgs-empty' }, t('loading')) : null,
        tab === 'summary' && data ? h('div', { className: 'dgs-card' },
          Object.entries(data).map(([k, v]) => h('div', { key: k, className: 'dgs-row' },
            h('span', { style: { flex: 1 } }, k), h('span', { className: 'dgs-sub' }, String(v))))) : null,
        tab === 'users' && Array.isArray(data) ? h('div', { className: 'dgs-card' },
          data.map((u) => h('div', { key: u.name, className: 'dgs-row' },
            h('a', { className: 'dgs-name', href: '#/u/' + u.name }, u.name),
            u.isAdmin ? h('span', { className: 'dgs-badge ok' }, 'admin') : null,
            h('span', { style: { flex: 1 } }),
            h('span', { className: 'dgs-sub' }, u.email || '')))) : null,
        tab === 'repos' && Array.isArray(data) ? h('div', { className: 'dgs-card' },
          data.map((r) => h('div', { key: r.name, className: 'dgs-row' },
            h('a', { className: 'dgs-name', href: '#/r/' + r.name }, r.name),
            r.private ? h('span', { className: 'dgs-badge pri' }, t('private')) : null,
            h('span', { style: { flex: 1 } }),
            h('span', { className: 'dgs-sub' }, '★ ' + r.stars)))) : null)
    }

    // ── 主页（仓库列表 + 建仓） ────────────────────────────────────────────────

    function GitPage({ onClose, t, kernelUrl }) {
      useEffect(ensureStyles, [])
      const route = useHashRoute()
      const [me, setMe] = useState(null)
      const [err, setErr] = useState('')
      const [name, setName] = useState('')
      const [isPrivate, setIsPrivate] = useState(false)
      const [busy, setBusy] = useState(false)
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
      const seg = route.split('/').filter(Boolean)
      const view = seg[0] || 'repos'
      const repoRoute = view === 'r' && seg[1] && seg[2] ? { owner: seg[1], name: seg[2] } : null
      const body = err ? h('div', { className: 'dgs-card dgs-err' }, err,
          h('button', { className: 'dgs-btn ghost', style: { marginLeft: 12 }, onClick: reload }, t('retry')))
        : repoRoute ? h(RepoBrowser, { repo: repoRoute, t, onBack: () => nav('/repos') })
        : view === 'explore' ? h(Explore, { t })
        : view === 'orgs' ? h(Orgs, { t })
        : view === 'org' && seg[1] ? h(OrgView, { name: seg[1], t, kernelUrl })
        : view === 'u' && seg[1] ? h(UserProfile, { name: decodeURIComponent(seg[1]), t })
        : view === 'admin' ? h(Admin, { t })
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
        const title = h('a', { className: 'dgs-name', onClick: (e) => { e.stopPropagation(); nav('/r/' + r.owner + '/' + r.name) } },
          r.fullName || (r.owner + '/' + r.name))
        const badge = r.private ? h('span', { className: 'dgs-badge pri' }, t('private')) : null
        const stats = h('span', { className: 'dgs-sub' }, '★ ' + r.stars + ' · ' + t('issues') + ' ' + r.issues)
        const del = h('button', { className: 'dgs-btn danger', onClick: (e) => {
          e.stopPropagation()
          if (!confirm(t('deleteConfirm') + ' ' + r.name + ' ?')) return
          api('DELETE', '/repos/' + r.owner + '/' + r.name).then((d) => { d.ok ? reload() : notify(d.error || 'failed') })
        } }, t('delete'))
        const desc = r.description ? h('div', { className: 'dgs-sub' }, r.description) : null
        return h('div', { key: r.id, className: 'dgs-card dgs-repo', onClick: () => nav('/r/' + r.owner + '/' + r.name) },
          h('div', { className: 'dgs-row' }, title, badge, h('span', { style: { flex: 1 } }), stats, del), desc)
      }

      const navItems = [['repos', t('myRepos')], ['explore', '探索'], ['orgs', '组织'], ['admin', '管理']]
      return h('div', { className: 'dgs-page' },
        h('div', { className: 'dgs-head' },
          h('div', { className: 'dgs-mark' }),
          h('div', null,
            h('div', { className: 'dgs-h1' }, t('title')),
            h('div', { className: 'dgs-hint' }, t('hint'))),
          h('div', { className: 'dgs-row', style: { marginLeft: 8 } },
            navItems.map(([k, label]) =>
              h('button', { key: k, className: 'dgs-btn ghost',
                style: view === k ? { color: 'var(--dsw-alias-state-business-primary)', borderColor: 'var(--dsw-alias-state-business-primary)55' } : undefined,
                onClick: () => nav('/' + k) }, label))),
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

    // ── 侧栏导航条目（工艺库/知识库下方，dsh-kb 同款 DOM 注入）───────────────

    const GIT_ENTRY_ATTR = 'data-dsh-git-entry'

    let gitPageHost = null
    function closeGitPage() {
      if (!gitPageHost) return
      try { gitPageHost.root.unmount() } catch {}
      try { gitPageHost.el.remove() } catch {}
      gitPageHost = null
    }
    function openGitPage(t) {
      if (gitPageHost) { closeGitPage(); return }
      fetch(API + '/status').then((r) => r.json()).then((status) => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        const root = require('react-dom/client').createRoot(el)
        gitPageHost = { el, root }
        root.render(h(GitPage, {
          onClose: closeGitPage,
          t,
          kernelUrl: status && status.running ? (location.protocol + '//' + location.hostname + ':' + (status.port || 3400)) : null,
        }))
      }).catch(() => {})
    }

    function gitSidebarRoot() {
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopUpstreamSidebar, .dshDesktopSidebarSurface')
      if (column === null) return undefined
      const logoOwner = column.querySelector('[class*="logoRow"]') && column.querySelector('[class*="logoRow"]').parentElement
      return logoOwner || (column.firstElementChild || undefined)
    }

    function gitNewSessionButton(root) {
      const nested = root.querySelector('button[class*="newSession"]')
      if (nested) return nested
      for (const child of root.children) {
        if (child instanceof HTMLButtonElement && !child.matches('[' + GIT_ENTRY_ATTR + ']')) return child
      }
      return Array.from(root.querySelectorAll('button')).find((b) => !b.matches('[' + GIT_ENTRY_ATTR + ']') && /新会话|新建会话|new session/i.test(b.textContent || ''))
    }

    function placeGitEntry(root, entry) {
      const button = gitNewSessionButton(root)
      if (!button) return false
      if (entry.parentElement !== root) {
        const family = Array.from(root.children).filter((el) => el instanceof HTMLElement
          && el.matches('[data-dsh-prc-entry],[data-dsh-atb-entry],[data-dsh-taskboard-entry],[data-dsh-ssh-entry],[data-dsh-kb-entry],[' + GIT_ENTRY_ATTR + ']'))
        if (family.length > 0) {
          const last = family[family.length - 1]
          last.parentElement.insertBefore(entry, last.nextSibling)
        } else {
          const row = button.closest('[class*="logoRow"]')
          const base = (row && row.parentElement === root) ? row : button
          root.insertBefore(entry, base.nextSibling)
        }
      }
      return true
    }

    function mountGitSidebarEntry(t) {
      let style = document.getElementById('dsh-git-sidebar-style')
      if (!style) {
        style = document.createElement('style')
        style.id = 'dsh-git-sidebar-style'
        style.textContent = `
    .dsh-git-entry{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;margin:2px 0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,var(--dsw-text-primary,inherit));font:inherit;font-size:13px;cursor:pointer;text-align:left}
    .dsh-git-entry:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
    .dsh-git-entry .dsh-git-entry-icon{flex:none;line-height:1}
    .dsh-git-entry .dsh-git-entry-stats{margin-left:auto;display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary,var(--dsw-text-secondary,gray));font-variant-numeric:tabular-nums;white-space:nowrap}
    .dsh-git-entry .dsh-git-entry-dot{width:6px;height:6px;border-radius:6px;background:var(--dsw-alias-state-success-primary);display:inline-block}
    [data-sidebar-collapsed] .dsh-git-entry,[class*="_collapsed"] .dsh-git-entry{width:36px;height:36px;min-width:36px;margin:0 0 12px;padding:0;justify-content:center;gap:0;text-align:center}
    [data-sidebar-collapsed] .dsh-git-entry .dsh-git-entry-label,[data-sidebar-collapsed] .dsh-git-entry .dsh-git-entry-stats,[class*="_collapsed"] .dsh-git-entry .dsh-git-entry-label,[class*="_collapsed"] .dsh-git-entry .dsh-git-entry-stats{display:none}
    `
        document.head.appendChild(style)
      }
      const entry = document.createElement('button')
      entry.type = 'button'
      entry.setAttribute(GIT_ENTRY_ATTR, '')
      entry.className = 'dsh-git-entry'
      entry.title = '代码仓库 — 仓库 / 工单 / PR / Wiki / 发版'
      entry.innerHTML = '<span class="dsh-git-entry-icon">📦</span><span class="dsh-git-entry-label">代码仓库</span><span class="dsh-git-entry-stats"></span>'
      entry.addEventListener('click', () => openGitPage(t))
      const stats = entry.querySelector('.dsh-git-entry-stats')
      const refreshStats = () => {
        fetch(API + '/me').then((r) => r.json()).then((d) => {
          if (stats && d && Array.isArray(d.repos)) stats.textContent = String(d.repos.length)
        }).catch(() => {})
      }
      refreshStats()
      const poll = setInterval(refreshStats, 30000)
      let root
      let placed = false
      const rootObserver = new MutationObserver(() => {
        if (!root || !root.isConnected) { placed = false; tryPlace(); return }
        if (!root.contains(entry)) placed = placeGitEntry(root, entry)
      })
      const tryPlace = () => {
        if (root && !root.isConnected) { rootObserver.disconnect(); root = undefined; placed = false }
        if (placed) { if (document.body.contains(entry)) return; rootObserver.disconnect(); root = undefined; placed = false }
        root = root || gitSidebarRoot()
        if (!root) return
        placed = placeGitEntry(root, entry)
        if (placed) rootObserver.observe(root, { childList: true })
      }
      const waitObserver = new MutationObserver(() => tryPlace())
      waitObserver.observe(document.body, { childList: true, subtree: true })
      const retry = setInterval(tryPlace, 2000)
      tryPlace()
      return () => {
        clearInterval(retry)
        clearInterval(poll)
        waitObserver.disconnect()
        rootObserver.disconnect()
        try { entry.remove() } catch {}
        closeGitPage()
      }
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

        ctx.effect(() => mountGitSidebarEntry(t), 'dsh-git-server: sidebar entry')

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
