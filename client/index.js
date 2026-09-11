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
  nav: 'Git', title: '代码仓库',
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
}
const EN = {
  nav: 'Git', title: 'Repositories',
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
}

// ── styles（dsw token 原生） ───────────────────────────────────────────────

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById('dgs-styles')) return
  const holder = document.createElement('div')
  holder.id = 'dgs-styles'
  holder.style.display = 'none'
  holder.innerHTML = `<style>
.dgs-page{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px}
.dgs-head{display:flex;align-items:center;gap:12px;padding:12px 28px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}
.dgs-h1{font-size:16px;font-weight:700;margin:0}
.dgs-close{margin-left:auto;cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;padding:4px 8px;border-radius:8px}
.dgs-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dgs-body{box-sizing:border-box;flex:1;overflow-x:hidden;overflow-y:auto;padding:20px 28px 32px;max-width:1156px;width:100%;margin:0 auto}
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
.dgs-labeled{display:inline-flex;align-items:stretch;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
.dgs-labeled .dgs-btn{border:none;border-radius:0}
.dgs-labeled-count{display:inline-flex;align-items:center;padding:0 10px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
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
/* 卡片直属的输入控件不在 flex 行内，flex:1 失效——显式撑满 */
textarea.dgs-input,.dgs-card>.dgs-input{width:100%;box-sizing:border-box;flex:none}
.dgs-subtabs{display:flex;gap:6px;margin-bottom:14px}
.dgs-subtab{cursor:pointer;border:none;border-radius:999px;padding:4px 14px;font-size:12.5px;font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dgs-subtab.active{background:var(--dsw-alias-state-business-primary);color:#fff}
.dgs-stats{display:flex;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden;margin-bottom:8px}
.dgs-stats-item{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 0;cursor:pointer;color:var(--dsw-alias-label-secondary);border-right:1px solid var(--dsw-alias-border-l2)}
.dgs-stats-item:last-child{border-right:none}
.dgs-stats-item:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dgs-stats-num{font-weight:700;color:var(--dsw-alias-label-primary)}
.dgs-pill{cursor:pointer;border:1px solid var(--dsw-alias-state-success-primary)55;background:transparent;color:var(--dsw-alias-state-success-primary);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:500}
.dgs-pill.active{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}
.dgs-pill.closed{border-color:var(--dsw-alias-state-error-primary)55;color:var(--dsw-alias-state-error-primary)}
.dgs-pill.closed.active{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dgs-issue-num{flex:none;width:34px;height:34px;border-radius:6px;background:var(--dsw-alias-state-success-primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.dgs-issue-num.closed{background:var(--dsw-alias-label-tertiary)}
.dgs-issue-title{font-weight:500;color:var(--dsw-alias-state-business-primary)}
.dgs-tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:14px}
.dgs-tab{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;padding:8px 14px;border-radius:8px 8px 0 0;border-bottom:2px solid transparent}
.dgs-tab.active{color:var(--dsw-alias-state-business-primary);border-bottom-color:var(--dsw-alias-state-business-primary)}
.dgs-table{width:100%;border-collapse:collapse}
.dgs-table td{padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px}
.dgs-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}
.dgs-file{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.7;background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;overflow:auto;max-height:60vh}
.dgs-diff-line{display:flex;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:20px;padding:0 8px}
.dgs-diff-line.hunk{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);margin:2px 0}
.dgs-diff-line.add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}
.dgs-diff-line.del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.dgs-diff-no{flex:none;width:44px;text-align:right;padding-right:10px;color:var(--dsw-alias-label-tertiary);user-select:none}
.dgs-diff-stat{font-size:12px;font-weight:600;color:var(--dsw-alias-state-success-primary)}
.dgs-diff-stat.del{color:var(--dsw-alias-state-error-primary);margin-left:8px}
.dgs-crumbs{display:flex;gap:6px;align-items:center;font-size:13px;margin-bottom:10px;flex-wrap:wrap}
.dgs-crumb{color:var(--dsw-alias-label-secondary);cursor:pointer}
.dgs-crumb:hover{color:var(--dsw-alias-state-business-primary)}
.dgs-crumb.cur{color:var(--dsw-alias-label-primary);cursor:default;font-weight:500}
.dgs-issue{border-bottom:1px solid var(--dsw-alias-border-l1);padding:10px 4px}
.dgs-issue-layout{display:flex;gap:18px;align-items:flex-start}
.dgs-issue-main{flex:1;min-width:0}
.dgs-issue-side{width:230px;flex:none}
.dgs-side-block{border-bottom:1px solid var(--dsw-alias-border-l2);padding:10px 0}
.dgs-side-title{font-weight:700;font-size:12.5px;margin-bottom:4px}
.dgs-settings-layout{display:flex;gap:20px;align-items:flex-start}
.dgs-settings-nav{width:180px;flex:none;border-right:1px solid var(--dsw-alias-border-l2);padding-right:12px}
.dgs-settings-nav .item{display:block;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--dsw-alias-label-secondary)}
.dgs-settings-nav .item.active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.dgs-settings-nav .item:hover{background:var(--dsw-alias-interactive-bg-hover)}
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
  const [prPreset, setPrPreset] = useState(null)
  const [ov, setOv] = useState(null)
  const [rev, setRev] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [star, setStar] = useState(null)
  const [watch, setWatch] = useState(null)
  const [forkBusy, setForkBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => {
      if (!d.defaultBranch) return
      setOv(d)
      setRev(d.defaultBranch)
    })
    fetch(API + '/status').then((r) => r.json()).then((st) => {
      if (st && st.running) setCloneUrl('git clone http://' + location.hostname + ':' + (st.port || 3400) + '/' + repo.owner + '/' + repo.name + '.git')
    }).catch(() => {})
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/star`).then((d) => d.count !== undefined && setStar(d))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/watch`).then((d) => d.count !== undefined && setWatch(d))
  }, [repo.owner, repo.name])
  const toggle = async (kind) => {
    const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/${kind}`)
    if (d.on !== undefined) (kind === 'star' ? setStar : setWatch)({ on: d.on, count: d.count })
  }
  const fork = async () => {
    setForkBusy(true); setMsg('')
    const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/fork`)
    setForkBusy(false)
    if (d.ok) nav('/r/' + d.owner + '/' + d.name)
    else setMsg(d.error || 'fork failed')
  }
  const branchSel = ov && ov.branches && ov.branches.length
    ? h('select', {
        className: 'dgs-input', style: { flex: 'none', width: 'auto', padding: '4px 8px' },
        value: rev, onChange: (e) => setRev(e.target.value),
      }, ov.branches.map((b) => h('option', { key: b, value: b }, b)))
    : null
  return h('div', null,
    h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
      h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
      h('span', { className: 'dgs-h1' }, repo.owner + '/' + repo.name),
      repo.private || (ov && ov.private) ? h('span', { className: 'dgs-badge pri' }, t('private')) : null,
      h('span', { style: { flex: 1 } }),
      star ? h('span', { className: 'dgs-labeled' },
        h('button', { className: 'dgs-btn ghost', onClick: () => toggle('star') }, star.on ? '★ Unstar' : '☆ Star'),
        h('span', { className: 'dgs-labeled-count' }, star.count)) : null,
      watch ? h('span', { className: 'dgs-labeled' },
        h('button', { className: 'dgs-btn ghost', onClick: () => toggle('watch') }, watch.on ? '👁 Unwatch' : '👁 Watch'),
        h('span', { className: 'dgs-labeled-count' }, watch.count)) : null,
      h('button', { className: 'dgs-btn ghost', disabled: forkBusy, onClick: fork }, '⑂ Fork'),
    ),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    h('div', { className: 'dgs-tabs' },
      ['files', 'issues', 'pulls', 'wiki', 'releases', 'settings'].map((k) =>
        h('button', { key: k, className: 'dgs-tab' + (tab === k ? ' active' : ''), onClick: () => setTab(k) }, t(k)))),
    (tab === 'commits' || tab === 'branches' || tab === 'tags') ? h('div', { className: 'dgs-tabs' },
      h('button', { className: 'dgs-tab', onClick: () => setTab('files') }, t('files')),
      h('button', { className: 'dgs-tab active' }, tab === 'commits' ? t('commits') : tab === 'branches' ? t('branches') : '标签'))
    : null,
    ov && tab === 'files' ? h('div', { style: { margin: '0 0 10px' } },
      ov.description ? h('div', { className: 'dgs-sub', style: { marginBottom: 8 } }, ov.description) : h('div', { className: 'dgs-sub', style: { marginBottom: 8, fontStyle: 'italic' } }, '暂无描述'),
      h('div', { className: 'dgs-stats' },
        h('a', { className: 'dgs-stats-item', onClick: () => setTab('commits') },
          h('span', { className: 'dgs-stats-num' }, '⎇ ' + (ov.numCommits || 0)), ' 提交历史'),
        h('a', { className: 'dgs-stats-item', onClick: () => setTab('branches') },
          h('span', { className: 'dgs-stats-num' }, '⑂ ' + (ov.numBranches || 0)), ' 代码分支'),
        h('a', { className: 'dgs-stats-item', onClick: () => setTab('releases') },
          h('span', { className: 'dgs-stats-num' }, '◎ ' + (ov.numReleases || 0)), ' 版本发布')),
      h('div', { className: 'dgs-row', style: { margin: '8px 0 0' } },
        branchSel,
        h('span', { style: { flex: 1 } }),
        cloneUrl ? h('span', { className: 'dgs-labeled' },
          h('span', { className: 'dgs-labeled-count', style: { borderLeft: 'none', borderRight: '1px solid var(--dsw-alias-border-l2)' } }, 'HTTP'),
          h('button', { className: 'dgs-btn ghost', style: { borderRadius: 0, padding: '4px 8px', fontFamily: 'ui-monospace,monospace', fontSize: 12, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, onClick: () => {
            try { navigator.clipboard.writeText(cloneUrl) } catch {}
            setCopied(true); setTimeout(() => setCopied(false), 1600)
          }, title: cloneUrl }, copied ? t('copied') : cloneUrl.replace('git clone ', '')),
          h('a', { className: 'dgs-btn ghost', style: { borderRadius: '0 8px 8px 0', borderLeft: 'none' }, href: `/dsh-git-server/api/dsh/repos/${repo.owner}/${repo.name}/archive/${encodeURIComponent(rev || 'master')}.zip`, download: `${repo.name}-${rev}.zip`, title: '下载' }, '⭳'))
        : null))
    : null,
    tab === 'files' && h(FileTree, { repo, rev: rev || 'master', t, overview: ov, onOverview: setOv }),
    tab === 'commits' && h(Commits, { repo, rev: rev || 'master', t }),
    tab === 'branches' && h(Branches, { repo, t, onNewPR: (head, base) => { setPrPreset({ head, base }); setTab('pulls') } }),
    tab === 'issues' && h(IssuesArea, { repo, t }),
    tab === 'pulls' && h(Pulls, { repo, t, preset: prPreset, onPresetDone: () => setPrPreset(null), onGoIssuesSub: (k) => { setTab('issues'); setTimeout(() => { const el = document.querySelectorAll('.dgs-subtab')[k === 'labels' ? 1 : 2]; el && el.click() }, 0) } }),
    tab === 'wiki' && h(WikiView, { repo, t }),
    tab === 'releases' && h(Releases, { repo, t }),
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
  const [newFile, setNewFile] = useState(null) // {mode:'create'|'upload'}
  const [nf, setNf] = useState({ path: '', content: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [editMsg, setEditMsg] = useState('')
  const [histMode, setHistMode] = useState(null)
  const load = useCallback((p) => {
    setFile(null); setEntries(null); setErr(''); setBlameOn(false); setEditing(false); setHistMode(null)
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/tree?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(p)}`)
      .then((d) => {
        const entries = (d.data && d.data.entries) || d.entries
        if (entries) setEntries(entries)
        else setErr((d && d.error) || t('loadFailed'))
      })
      .catch(() => setErr(t('loadFailed')))
    if (p === '' && overview === undefined) {
      api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => d.defaultBranch && onOverview(d))
    }
    if (p !== '') setReadme(null)
  }, [repo.owner, repo.name, rev])
  useEffect(() => { load(path) }, [load, path])
  const openEntry = (e) => {
    const p = e.path
    if (e.type === 'dir' || e.type === 'tree') { setPath(p); return }
    api('GET', `/repos/${repo.owner}/${repo.name}/raw?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(p)}`)
      .then(async (d) => {
        const isMd = /\.md$/i.test(e.name)
        let html = ''
        if (isMd && d.ok) {
          const r = await api('POST', '/dsh/markdown', { text: d.text })
          html = r.html || ''
        }
        setFile({ name: e.name, text: d.ok ? d.text : null, size: e.size, isMd, html })
      })
  }
  const crumbs = ['', ...path ? path.split('/') : []]
  const startCreate = (mode) => {
    setNewFile(mode); setMsg('')
    setNf({ path: '', content: '', message: '' })
  }
  const submitFile = async () => {
    setBusy(true); setMsg('')
    const full = (path ? path + '/' : '') + nf.path.trim()
    const body = { path: full, branch: rev, message: nf.message }
    if (newFile === 'upload') {
      if (!nf.content) { setBusy(false); setMsg('请选择文件'); return }
      body.contentBase64 = btoa(unescape(encodeURIComponent(nf.content)))
      body.overwrite = true
    } else {
      if (!nf.path.trim()) { setBusy(false); setMsg('文件名必填'); return }
      body.content = nf.content
    }
    const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/files`, body)
    setBusy(false)
    if (d && d.ok) { setNewFile(null); load(path) }
    else setMsg((d && d.error) || 'failed')
  }
  return h('div', null,
    h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
      h('div', { className: 'dgs-crumbs', style: { margin: 0 } },
        h('span', { className: 'dgs-crumb cur' }, rev),
        path.split('/').filter(Boolean).map((seg, i, arr) =>
          h('span', { key: i },
            h('span', { className: 'dgs-crumb', onClick: () => setPath(arr.slice(0, i + 1).join('/')) }, seg),
            i < arr.length - 1 ? h('span', { className: 'dgs-sub' }, '/') : null))),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn', onClick: () => startCreate('create') }, '新的文件'),
      h('button', { className: 'dgs-btn ghost', onClick: () => startCreate('upload') }, '上传文件')),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    newFile ? h('div', { className: 'dgs-card', style: { margin: '8px 0' } },
      h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
        h('span', { style: { fontWeight: 700 } }, newFile === 'create' ? '新建文件' : '上传文件'),
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'dgs-btn ghost', onClick: () => setNewFile(null) }, t('back'))),
      h('div', { className: 'dgs-row' },
        h('span', { className: 'dgs-sub' }, (path || '') + '/'),
        h('input', { className: 'dgs-input', placeholder: newFile === 'create' ? '文件名（如 docs/guide.md）' : '目标路径', value: nf.path, onChange: (e) => setNf({ ...nf, path: e.target.value }) })),
      newFile === 'create' ? h('textarea', { className: 'dgs-input', style: { marginTop: 8, minHeight: 160 }, placeholder: '文件内容', value: nf.content, onChange: (e) => setNf({ ...nf, content: e.target.value }) })
        : h('input', { type: 'file', style: { marginTop: 8 }, onChange: async (e) => {
            const f = e.target.files && e.target.files[0]
            if (!f) return
            if (!nf.path) setNf((x) => ({ ...x, path: f.name }))
            setNf((x) => ({ ...x, content: 'BIN:' + f.name }))
            const buf = await f.arrayBuffer()
            let bin = ''
            new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b) })
            setNf((x) => ({ ...x, content: btoa(bin) }))
          } }),
      h('div', { className: 'dgs-row', style: { marginTop: 8 } },
        h('input', { className: 'dgs-input', placeholder: '提交信息（可选）', value: nf.message, onChange: (e) => setNf({ ...nf, message: e.target.value }) })),
      h('div', { className: 'dgs-row', style: { marginTop: 8, justifyContent: 'flex-end' } },
        h('button', { className: 'dgs-btn', disabled: busy || !nf.path.trim(), onClick: submitFile }, '提交修改')))
      : null,
    err ? h('div', { className: 'dgs-err' }, err) : null,
    file ? h('div', null,
      h('div', { className: 'dgs-row', style: { margin: '8px 0 10px' } },
        h('button', { className: 'dgs-btn ghost', onClick: () => setFile(null) }, '⑂ ' + rev),
        h('span', { className: 'dgs-sub' }, repo.name + ' /'),
        h('span', { style: { fontWeight: 600 } }, file.name)),
      h('div', { className: 'dgs-card', style: { padding: 0, overflow: 'hidden' } },
        h('div', { className: 'dgs-row', style: { padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)' } },
          h('span', { style: { fontWeight: 600, fontSize: 12.5 } }, '📄 ' + file.name + ' ' + (file.size ? fmtSize(file.size) : '')),
          h('span', { style: { flex: 1 } }),
          file.text !== null ? h('a', { className: 'dgs-sub', style: { cursor: 'pointer', marginRight: 12 }, onClick: () => {
            try { navigator.clipboard.writeText(location.origin + '/r/' + repo.owner + '/' + repo.name + '/src/' + encodeURIComponent(rev) + '/' + encodeURIComponent(path)) } catch {}
            setMsg('✓ 已复制永久链接'); setTimeout(() => setMsg(''), 1500)
          } }, '永久链接') : null,
          file.text !== null ? h('a', { className: 'dgs-sub', style: { cursor: 'pointer', marginRight: 12 }, onClick: () => setHistMode(histMode === 'history' ? null : 'history') }, '文件历史') : null,
          file.text !== null ? h('a', { className: 'dgs-sub', style: { marginRight: 12 }, href: `/dsh-git-server/api/repos/${repo.owner}/${repo.name}/raw?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(path)}`, target: '_blank', rel: 'noreferrer' }, '原始文件') : null,
          file.text !== null ? h('button', { className: 'dgs-btn ghost', style: { padding: '2px 8px' }, onClick: () => { setEditing(true); setEditText(file.text || '') } }, '✏️') : null,
          file.text !== null ? h('button', { className: 'dgs-btn danger', style: { padding: '2px 8px' }, onClick: async () => {
            if (!confirm('删除文件 ' + file.name + ' ？')) return
            const d = await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/files`, { path, branch: rev })
            if (d && d.ok) { setFile(null); load(path) } else setMsg((d && d.error) || '删除失败')
          } }, '🗑️') : null,
          file.text !== null ? h('button', { className: 'dgs-btn ghost', style: { padding: '2px 8px' }, onClick: () => setBlameOn(!blameOn) }, 'Blame') : null),
        editing ? h('div', { style: { padding: 12 } },
          h('textarea', { className: 'dgs-input', style: { minHeight: '40vh', fontFamily: 'ui-monospace,monospace' }, value: editText, onChange: (e) => setEditText(e.target.value) }),
          h('div', { className: 'dgs-row', style: { marginTop: 8 } },
            h('input', { className: 'dgs-input', placeholder: '提交信息（可选）', value: editMsg, onChange: (e) => setEditMsg(e.target.value) }),
            h('span', { style: { flex: 1 } }),
            h('button', { className: 'dgs-btn ghost', onClick: () => setEditing(false) }, '取消'),
            h('button', { className: 'dgs-btn', disabled: busy, onClick: async () => {
              setBusy(true); setMsg('')
              const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/files`, { path, branch: rev, content: editText, message: editMsg, overwrite: true })
              setBusy(false)
              if (d && d.ok) { setEditing(false); load(path) } else setMsg((d && d.error) || '保存失败')
            } }, '提交修改')))
        : histMode === 'history' ? h(FileHistory, { repo, rev, path })
        : blameOn && file.text !== null
          ? h(BlameView, { repo, rev, path, text: file.text })
          : file.isMd
            ? h('div', { className: 'dgs-md', style: { padding: '14px 16px' }, dangerouslySetInnerHTML: { __html: file.html || '' } })
            : h('pre', { className: 'dgs-file', style: { border: 'none', borderRadius: 0 } }, file.text === null ? t('emptyFile') : file.text)))
    : entries === null ? h('div', { className: 'dgs-empty' }, t('loading'))
    : renderDir(),
  )

  function renderDir() {
    const head = entries.find((e) => e.last)
    const rows = entries.map((e) =>
      h('tr', { key: e.path, style: { cursor: 'pointer' }, onClick: () => openEntry(e) },
        h('td', { style: { width: 24 } }, h('span', { className: 'dgs-ico' }, e.type === 'dir' || e.type === 'tree' ? '📁' : '📄')),
        h('td', null, h('div', null, e.name),
          e.last ? h('div', { className: 'dgs-sub' }, (e.last.msg || '')) : null,
          e.last ? h('div', { className: 'dgs-sub', style: { marginTop: 1 } }, timeAgo(e.last.date)) : null),
        h('td', { className: 'dgs-sub', style: { textAlign: 'right', width: 70 } }, e.type === 'blob' ? fmtSize(e.size) : '')))
    const headRow = head ? h('div', { className: 'dgs-row', style: { padding: '8px 0 10px', borderBottom: '1px solid var(--dsw-alias-border-l2)', marginBottom: 4 } },
      h('span', { style: { width: 26, height: 26, borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--dsw-alias-label-secondary)' } }, (head.last.author || '?').slice(0, 1).toUpperCase()),
      h('span', { className: 'dgs-badge' }, head.last.sha),
      h('span', { style: { fontWeight: 500 } }, head.last.msg),
      h('span', { style: { flex: 1 } }),
      h('span', { className: 'dgs-sub' }, timeAgo(head.last.date))) : null
    const table = entries.length === 0
      ? h('div', { className: 'dgs-empty' }, t('emptyDir'))
      : h('div', null, headRow, h('table', { className: 'dgs-table' }, h('tbody', null, rows)))
    const readmeEl = (path === '' && overview && overview.readmeHtml)
      ? h('div', { className: 'dgs-card', style: { marginTop: 12 } },
          h('div', { style: { fontWeight: 700, marginBottom: 8 } }, t('readme')),
          h('div', { className: 'dgs-md', dangerouslySetInnerHTML: { __html: overview.readmeHtml } }))
      : null
    return h('div', null, table, readmeEl)
  }
}

function IssuesArea({ repo, t }) {
  const [sub, setSub] = useState('list')
  const [labelJump, setLabelJump] = useState(null)
  const [msJump, setMsJump] = useState(null)
  const subLink = (k, label) => h('a', { key: k, style: { cursor: 'pointer', marginRight: 18, fontSize: 13,
      color: sub === k ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)',
      fontWeight: sub === k ? 600 : 400 },
    onClick: () => setSub(k) }, label)
  const [createSignal, setCreateSignal] = useState(0)
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '0 0 12px' } },
      subLink('labels', '标签管理'),
      subLink('milestones', '里程碑'),
      h('span', { style: { flex: 1 } }),
      sub === 'list' ? h('button', { className: 'dgs-btn', onClick: () => setCreateSignal((n) => n + 1) }, t('issueNew')) : null),
    sub === 'list' && h(Issues, { repo, t, presetLabel: labelJump, presetMilestone: msJump,
      onPresetDone: () => { setLabelJump(null); setMsJump(null) }, createSignal }),
    sub === 'labels' && h(LabelsManage, { repo, t, onFilterLabel: (lid) => { setLabelJump(lid); setSub('list') } }),
    sub === 'milestones' && h(MilestonesManage, { repo, t, onOpenMilestone: (m) => { setMsJump(m.id); setSub('list') } }))
}

function Issues({ repo, t, presetLabel, presetMilestone, onPresetDone, createSignal }) {
  const [state, setState] = useState('open')
  const [flt, setFlt] = useState({ label: '', milestone: '', assignee: '' })
  useEffect(() => {
    if (presetLabel || presetMilestone) {
      setFlt((f) => ({ ...f, label: presetLabel ? String(presetLabel) : f.label, milestone: presetMilestone ? String(presetMilestone) : f.milestone }))
      onPresetDone && onPresetDone()
    }
  }, [presetLabel, presetMilestone])
  const [sort, setSort] = useState('latest')
  const [search, setSearch] = useState('')
  const [list, setList] = useState(null)
  const [meta, setMeta] = useState({ labels: [], milestones: [], collabs: [] })
  const [creating, setCreating] = useState(false)
  useEffect(() => { if (createSignal) setCreating(true) }, [createSignal])
  const [openIdx, setOpenIdx] = useState(null)
  const reload = useCallback(() => {
    setList(null)
    const q = new URLSearchParams({ state, sort })
    if (flt.label) q.set('label', flt.label)
    if (flt.milestone) q.set('milestone', flt.milestone)
    if (flt.assignee) q.set('assignee', flt.assignee)
    if (search.trim()) q.set('search', search.trim())
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/issues?` + q).then((d) => setList(Array.isArray(d) ? d : (d.issues || [])))
  }, [repo.owner, repo.name, state, flt, sort, search])
  useEffect(reload, [reload])
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setMeta((m) => ({ ...m, labels: Array.isArray(d) ? d : [] })))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setMeta((m) => ({ ...m, milestones: Array.isArray(d) ? d : [] })))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setMeta((m) => ({ ...m, collabs: Array.isArray(d) ? d : [] })))
  }, [repo.owner, repo.name])
  if (openIdx !== null) return h(IssueDetail, { repo, idx: openIdx, t, onBack: () => { setOpenIdx(null); reload() } })
  const fltSel = (key, items, blank) => h('select', {
    className: 'dgs-input', style: { maxWidth: 150, flex: 'none', width: 'auto', padding: '5px 8px' },
    value: flt[key], onChange: (e) => setFlt({ ...flt, [key]: e.target.value }),
  }, h('option', { value: '' }, blank),
    items.map((x) => h('option', { key: x.id || x.name, value: String(x.id || x.name) }, x.name)))
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
      h('button', { className: 'dgs-pill' + (state === 'open' ? ' active' : ''), onClick: () => setState('open') }, '⊘ ' + t('openState')),
      h('button', { className: 'dgs-pill' + (state === 'closed' ? ' active closed' : ''), onClick: () => setState('closed') }, '✓ ' + t('closedState'))),
    creating ? h(NewIssue, { repo, t, onDone: () => { setCreating(false); reload() } }) : null,
    h('div', { className: 'dgs-row', style: { margin: '0 0 12px' } },
      fltSel('label', meta.labels, '标签'),
      fltSel('milestone', meta.milestones, '里程碑'),
      fltSel('assignee', meta.collabs, '负责人'),
      h('select', { className: 'dgs-input', style: { maxWidth: 150, flex: 'none', width: 'auto', padding: '5px 8px' }, value: sort, onChange: (e) => setSort(e.target.value) },
        [['latest', '最新'], ['oldest', '最旧'], ['recentupdate', '最近更新'], ['leastupdate', '最久未更新'], ['mostcomment', '最多评论'], ['leastcomment', '最少评论']].map(([v, label]) =>
          h('option', { key: v, value: v }, '排序: ' + label))),
      h('input', { className: 'dgs-input', style: { maxWidth: 180, flex: 'none' }, placeholder: '搜索标题/内容', value: search, onChange: (e) => setSearch(e.target.value) }),
      (flt.label || flt.milestone || flt.assignee || search) ? h('button', { className: 'dgs-btn ghost', onClick: () => { setFlt({ label: '', milestone: '', assignee: '' }); setSearch('') } }, '清除') : null),
    list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
      : list.length === 0 ? h('div', { className: 'dgs-empty' }, t('noIssues'))
      : h('div', null, list.map((i) => issueRow(i)))
  )

  function issueRow(i) {
    const badge = h('span', { className: 'dgs-issue-num' + (i.state === 'open' ? '' : ' closed') }, '#' + i.number)
    const title = h('span', { className: 'dgs-issue-title' }, i.title)
    const labels = (i.labels || []).map((l) =>
      h('span', { key: l.id, className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33', borderColor: l.color || '#70c24a' } }, l.name))
    const meta = h('div', { className: 'dgs-row', style: { marginTop: 4, gap: 6 } },
      h('span', { className: 'dgs-sub' }, '由 ' + (i.user || '') + ' 于 ' + timeAgo(i.updatedAt) + ' 创建'),
      i.milestone ? h('span', { className: 'dgs-badge' }, '◆ ' + i.milestone.title) : null,
      i.assignee ? h('span', { className: 'dgs-badge' }, '@' + i.assignee) : null)
    return h('div', {
      key: i.number, className: 'dgs-issue', style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 },
      onClick: () => setOpenIdx(i.number),
    }, badge,
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { className: 'dgs-row', style: { gap: 6 } }, title, labels),
        meta),
      h('span', { className: 'dgs-sub', style: { flex: 'none' } }, '💬 ' + (i.comments || 0)))
  }
}

function NewIssue({ repo, t, onDone }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [labels, setLabels] = useState([])
  const [ms, setMs] = useState([])
  const [collabs, setCollabs] = useState([])
  const [sel, setSel] = useState({ labels: new Set(), milestone: '', assignee: '' })
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setLabels(Array.isArray(d) ? d : []))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setMs(Array.isArray(d) ? d : []))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setCollabs(Array.isArray(d) ? d : []))
  }, [repo.owner, repo.name])
  const submit = async () => {
    setBusy(true); setErr('')
    const d = await api('POST', `/repos/${repo.owner}/${repo.name}/issues`, {
      title, body,
      labels: [...sel.labels].map(Number),
      milestone: sel.milestone ? Number(sel.milestone) : undefined,
      assignee: sel.assignee || undefined,
    })
    setBusy(false)
    d.ok ? onDone() : setErr(d.error || 'failed')
  }
  const toggleLabel = (id) => setSel((x) => {
    const next = new Set(x.labels)
    next.has(id) ? next.delete(id) : next.add(id)
    return { ...x, labels: next }
  })
  const side = h('div', null,
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '标签 ⚙'),
      labels.length === 0 ? h('div', { className: 'dgs-sub' }, '未选择标签') : null,
      labels.map((l) => h('label', { key: l.id, className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: sel.labels.has(l.id), onChange: () => toggleLabel(l.id) }),
        h('span', { className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33' } }, l.name)))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '里程碑 ⚙'),
      h('select', { className: 'dgs-input', style: { width: '100%' }, value: sel.milestone, onChange: (e) => setSel({ ...sel, milestone: e.target.value }) },
        h('option', { value: '' }, '未选择里程碑'),
        ms.map((m) => h('option', { key: m.id, value: m.id }, m.title + (m.closed ? ' ✓' : ''))))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '指派成员 ⚙'),
      h('select', { className: 'dgs-input', style: { width: '100%' }, value: sel.assignee, onChange: (e) => setSel({ ...sel, assignee: e.target.value }) },
        h('option', { value: '' }, '未指派成员'),
        collabs.map((u) => h('option', { key: u.name, value: u.name }, u.name)))))
  return h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
    h('div', { className: 'dgs-issue-layout' },
      h('div', { className: 'dgs-issue-main' },
        h('input', { className: 'dgs-input', placeholder: '标题', value: title, onChange: (e) => setTitle(e.target.value) }),
        h('div', { className: 'dgs-row', style: { margin: '8px 0 4px' } },
          h('button', { className: 'dgs-subtab' + (!preview ? ' active' : ''), onClick: () => setPreview(false) }, '内容编辑'),
          h('button', { className: 'dgs-subtab' + (preview ? ' active' : ''), onClick: () => {
            setPreview(true)
            api('POST', '/dsh/markdown', { text: body }).then((d) => setPreviewHtml(d.html || ''))
          } }, '效果预览')),
        preview ? h('div', { className: 'dgs-md', style: { minHeight: 160, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 12 } },
          body ? h('div', { dangerouslySetInnerHTML: { __html: previewHtml } }) : h('span', { className: 'dgs-sub' }, '暂无内容'))
          : h('textarea', { className: 'dgs-input', style: { minHeight: 160 }, placeholder: '内容', value: body, onChange: (e) => setBody(e.target.value) }),
        err ? h('div', { className: 'dgs-err' }, err) : null,
        h('div', { className: 'dgs-row', style: { marginTop: 10, justifyContent: 'flex-end' } },
          h('button', { className: 'dgs-btn', disabled: busy || !title.trim(), onClick: submit }, '创建工单'))),
      h('div', { className: 'dgs-issue-side' }, side)))
}

function IssueDetail({ repo, idx, t, onBack }) {
  const [issue, setIssue] = useState(null)
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editC, setEditC] = useState(null)
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
  const main = h('div', null,
    editing ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
      h('input', { className: 'dgs-input', value: draft.title, onChange: (e) => setDraft({ ...draft, title: e.target.value }) }),
      h('textarea', { className: 'dgs-input', style: { marginTop: 8 }, value: draft.body, onChange: (e) => setDraft({ ...draft, body: e.target.value }) }),
      h('div', { className: 'dgs-row', style: { marginTop: 8 } },
        h('button', { className: 'dgs-btn', disabled: busy || !draft.title.trim(), onClick: () => patch({ title: draft.title, body: draft.body }) }, t('save'))))
      : h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
          issue.body ? h('div', { style: { whiteSpace: 'pre-wrap' } }, issue.body) : h('div', { className: 'dgs-sub' }, '暂无内容'),
          h('div', { className: 'dgs-row', style: { marginTop: 10, flexWrap: 'wrap' } },
            (issue.labels || []).map((l) => h('span', { key: l.id, className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33' } }, l.name)),
            issue.milestone ? h('span', { className: 'dgs-badge' }, '◆ ' + issue.milestone.title) : null,
            issue.assignee ? h('span', { className: 'dgs-badge' }, '@' + issue.assignee) : null)),
    comments === null ? h('div', { className: 'dgs-empty' }, t('loading'))
      : comments.length === 0 ? h('div', { className: 'dgs-empty' }, t('noIssues'))
      : comments.map((c) =>
          h('div', { key: c.id, className: 'dgs-comment' },
            h('div', { className: 'dgs-row', style: { marginBottom: 4 } },
              h('span', { className: 'dgs-sub' }, `${c.user || ''} · ${fmtDate(c.created)}`),
              h('span', { style: { flex: 1 } }),
              c.id ? h('button', { className: 'dgs-btn ghost', style: { padding: '1px 8px' }, onClick: () => { setEditC({ id: c.id, text: c.body }) } }, '编辑') : null,
              c.id ? h('button', { className: 'dgs-btn danger', style: { padding: '1px 8px' }, onClick: async () => {
                if (!confirm('删除此评论？')) return
                await api('DELETE', `/repos/${repo.owner}/${repo.name}/issues/comments/${c.id}`)
                reload()
              } }, '删') : null),
            editC && editC.id === c.id ? h('div', null,
              h('textarea', { className: 'dgs-input', value: editC.text, onChange: (e) => setEditC({ ...editC, text: e.target.value }) }),
              h('div', { className: 'dgs-row', style: { marginTop: 4 } },
                h('button', { className: 'dgs-btn', onClick: async () => {
                  await api('PATCH', `/repos/${repo.owner}/${repo.name}/issues/comments/${c.id}`, { body: editC.text })
                  setEditC(null); reload()
                } }, t('save'))))
              : h('div', { style: { whiteSpace: 'pre-wrap' } }, c.body))),
    h('div', { className: 'dgs-card', style: { margin: '12px 0' } },
      h('textarea', { className: 'dgs-input', placeholder: t('commentPlaceholder'), value: text, onChange: (e) => setText(e.target.value) }),
      h('div', { className: 'dgs-row', style: { marginTop: 8 } },
        h('button', { className: 'dgs-btn', disabled: busy || !text.trim(),
          onClick: async () => {
            setBusy(true)
            await api('POST', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`, { body: text })
            setText(''); setBusy(false); reload()
          } }, t('comment')))))
  const side = h('div', null,
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '标签 ⚙'),
      allLabels.length === 0 ? h('div', { className: 'dgs-sub' }, '未选择标签') : null,
      allLabels.map((l) => h('label', { key: l.id, className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: (issue.labels || []).some((x) => x.id === l.id),
          onChange: (e) => {
            const cur = new Set((issue.labels || []).map((x) => x.id))
            if (e.target.checked) cur.add(l.id); else cur.delete(l.id)
            patch({ labels: [...cur] })
          } }),
        h('span', { className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33' } }, l.name)))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '里程碑 ⚙'),
      h('select', { className: 'dgs-input', style: { width: '100%' }, value: issue.milestone ? issue.milestone.id : '',
        onChange: (e) => patch({ milestone: Number(e.target.value) || 0 }) },
        h('option', { value: '' }, '未选择里程碑'),
        allMs.map((m) => h('option', { key: m.id, value: m.id }, m.title + (m.closed ? ' ✓' : ''))))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '指派成员 ⚙'),
      h('select', { className: 'dgs-input', style: { width: '100%' }, value: issue.assignee || '',
        onChange: (e) => patch({ assignee: e.target.value }) },
        h('option', { value: '' }, '未指派成员'),
        collabs.map((u) => h('option', { key: u.name, value: u.name }, u.name)))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, (issue.participants || 1) + ' 名参与者'),
      h('div', { className: 'dgs-sub' }, issue.author || '')))
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
    h('div', { className: 'dgs-issue-layout' },
      h('div', { className: 'dgs-issue-main' }, main),
      h('div', { className: 'dgs-issue-side' }, side)))
}

function Commits({ repo, rev, t }) {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)
  const [page, setPage] = useState(1)
  const [full, setFull] = useState(false)
  const [q, setQ] = useState('')
  useEffect(() => { setPage(1); setQ('') }, [rev])
  useEffect(() => {
    setList(null)
    api('GET', `/repos/${repo.owner}/${repo.name}/commits?ref=${encodeURIComponent(rev)}&page=${page}&pageSize=30`)
      .then((d) => {
        const l = d.commits || []
        setList(l)
        setFull(l.length < 30)
      })
  }, [repo.owner, repo.name, rev, page])
  if (sel) return h(CommitDetail, { repo, sha: sel, t, onBack: () => setSel(null) })
  if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
  if (list.length === 0) return h('div', { className: 'dgs-empty' }, t('emptyDir'))
  const shown = q.trim() ? list.filter((c) => (c.message || '').toLowerCase().includes(q.trim().toLowerCase()) || (c.author || '').toLowerCase().includes(q.trim().toLowerCase())) : list
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '0 0 10px' } },
      h('input', { className: 'dgs-input', style: { maxWidth: 260, flex: 'none' }, placeholder: '搜索提交历史', value: q, onChange: (e) => setQ(e.target.value) })),
    shown.length === 0 ? h('div', { className: 'dgs-empty' }, '—') : null,
    h('table', { className: 'dgs-table' },
      h('tbody', null, shown.map((c, i) =>
        h('tr', { key: i, style: { cursor: 'pointer' }, onClick: () => setSel(c.sha) },
          h('td', null, h('div', { style: { fontWeight: 500 } }, (c.message || '').split('\n')[0]),
            h('div', { className: 'dgs-sub' }, c.author)),
          h('td', { className: 'dgs-sub', style: { textAlign: 'right', whiteSpace: 'nowrap' } }, (c.sha || '').slice(0, 10)),
          h('td', { className: 'dgs-sub', style: { textAlign: 'right', whiteSpace: 'nowrap', width: 100 } }, timeAgo(c.date)))))),
    h('div', { className: 'dgs-row', style: { marginTop: 10, justifyContent: 'center' } },
      h('button', { className: 'dgs-btn ghost', disabled: page <= 1, onClick: () => setPage(page - 1) }, '‹ 较新'),
      h('span', { className: 'dgs-sub' }, '第 ' + page + ' 页'),
      h('button', { className: 'dgs-btn ghost', disabled: full, onClick: () => setPage(page + 1) }, '较旧 ›')))
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
    h(DiffView, { patch: d.files || '' }))
}

// unified diff → 结构化渲染（文件分块 / 行号 / +绿 -红 / hunk 灰 / 每文件增删统计）
function DiffView({ patch }) {
  const files = []
  let cur = null
  let oldNo = 0; let newNo = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      cur = { name: line.replace(/^diff --git a\/(\S+) b\/.*/, '$1'), header: [], stats: { add: 0, del: 0 }, lines: [] }
      files.push(cur); oldNo = 0; newNo = 0
      continue
    }
    if (!cur) continue
    if (line.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (m) { oldNo = Number(m[1]); newNo = Number(m[2]) }
      cur.lines.push({ kind: 'hunk', text: line }); continue
    }
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') ||
        line.startsWith('new file mode') || line.startsWith('deleted file mode') ||
        line.startsWith('old mode') || line.startsWith('new mode') || line.startsWith('similarity ') ||
        line.startsWith('rename from') || line.startsWith('rename to')) { cur.header.push(line); continue }
    if (line.startsWith('+')) { cur.stats.add++; cur.lines.push({ kind: 'add', old: '', new: newNo++, text: line.slice(1) }); continue }
    if (line.startsWith('-')) { cur.stats.del++; cur.lines.push({ kind: 'del', old: oldNo++, new: '', text: line.slice(1) }); continue }
    if (line.startsWith(' ')) { cur.lines.push({ kind: 'ctx', old: oldNo++, new: newNo++, text: line.slice(1) }); continue }
    if (line === '') { cur.lines.push({ kind: 'ctx', old: oldNo++, new: newNo++, text: '' }); continue }
    cur.lines.push({ kind: 'ctx', text: line })
  }
  if (files.length === 0) return h('div', { className: 'dgs-empty' }, '—')
  return h('div', null, files.map((f, i) =>
    h('div', { key: i, className: 'dgs-card', style: { padding: 0, overflow: 'hidden', marginBottom: 12 } },
      h('div', { className: 'dgs-row', style: { padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)' } },
        h('span', { style: { fontWeight: 600, fontSize: 12.5 } }, f.name),
        h('span', { style: { flex: 1 } }),
        h('span', { className: 'dgs-diff-stat' }, '+' + f.stats.add),
        h('span', { className: 'dgs-diff-stat del' }, '-' + f.stats.del)),
      h('div', { style: { overflowX: 'auto' } }, f.lines.map((l, j) => {
        if (l.kind === 'hunk') return h('div', { key: j, className: 'dgs-diff-line hunk' }, l.text)
        return h('div', { key: j, className: 'dgs-diff-line ' + l.kind },
          h('span', { className: 'dgs-diff-no' }, l.old || ''),
          h('span', { className: 'dgs-diff-no' }, l.new || ''),
          h('span', { className: 'dgs-diff-code', style: { whiteSpace: 'pre' } }, l.text))
      })))))
}
function Branches({ repo, t, onNewPR }) {
  const [view, setView] = useState('overview')
  const [list, setList] = useState(null)
  const [tags, setTags] = useState(null)
  const [rels, setRels] = useState([])
  const [def, setDef] = useState('')
  const reload = () => api('GET', `/repos/${repo.owner}/${repo.name}/branches`).then((d) => setList(d.branches || []))
  useEffect(() => {
    reload()
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => setDef(d.defaultBranch || ''))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/tags`).then((d) => setTags(Array.isArray(d) ? d : []))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/releases`).then((d) => setRels(Array.isArray(d) ? d : (d.data || [])))
  }, [repo.owner, repo.name])
  if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
  const tabBtn = (k, label) => h('button', { className: 'dgs-subtab' + (view === k ? ' active' : ''), onClick: () => setView(k) }, label)
  const active = list.filter((b) => b.name !== def)
  return h('div', null,
    h('div', { className: 'dgs-subtabs' }, tabBtn('overview', '概况'), tabBtn('all', '所有分支')),
    view === 'overview' ? h('div', null,
      h('div', { className: 'dgs-card', style: { marginBottom: 12 } },
        h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '默认分支'),
        h('div', { className: 'dgs-row' },
          h('span', { className: 'dgs-badge' }, def || 'master'),
          h('span', { className: 'dgs-sub', style: { flex: 1 } }, ''),
          h('button', { className: 'dgs-btn ghost', onClick: () => setView('all') }, '更改默认分支'))),
      h('div', { className: 'dgs-card' },
        h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '活跃分支'),
        active.length === 0 ? h('div', { className: 'dgs-sub' }, '—')
          : active.map((b) => h('div', { key: b.name, className: 'dgs-row', style: { padding: '4px 0' } },
              h('a', { className: 'dgs-name', style: { cursor: 'pointer' }, onClick: () => onNewPR && onNewPR(b.name, def) }, b.name),
              h('span', { className: 'dgs-sub', style: { flex: 1 } }, ''),
              h('span', { className: 'dgs-sub' }, (b.sha || '').slice(0, 10))))))
    : h('div', null,
        h('table', { className: 'dgs-table' },
          h('tbody', null, list.map((b) =>
            h('tr', { key: b.name },
              h('td', { style: { fontWeight: 500 } },
                b.name,
                b.name === def ? h('span', { className: 'dgs-badge ok', style: { marginLeft: 8 } }, '默认') : null),
              h('td', { className: 'dgs-sub', style: { textAlign: 'right' } },
                (b.sha || '').slice(0, 10),
                b.name !== def ? h('button', { className: 'dgs-btn ghost', style: { marginLeft: 8, padding: '2px 8px' }, onClick: () => onNewPR && onNewPR(b.name, def) }, '+ PR') : null,
                b.name !== def ? h('button', { className: 'dgs-btn danger', style: { marginLeft: 4, padding: '2px 8px' }, onClick: async () => {
                  if (!confirm('删除分支 ' + b.name + ' ？')) return
                  await api('DELETE', `/repos/${repo.owner}/${repo.name}/branches/${encodeURIComponent(b.name)}`)
                  reload()
                } }, '删') : null))))),
        h('div', { style: { fontWeight: 700, margin: '18px 0 8px' } }, '标签'),
        tags === null ? h('div', { className: 'dgs-empty' }, t('loading'))
          : tags.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
          : h('table', { className: 'dgs-table' },
              h('tbody', null, tags.map((tg) => {
                const released = rels.some((r) => r.tag === tg.name)
                return h('tr', { key: tg.name },
                  h('td', { style: { fontWeight: 500 } },
                    '◎ ' + tg.name,
                    released ? h('span', { className: 'dgs-badge ok', style: { marginLeft: 8 } }, '已发版') : null),
                  h('td', { className: 'dgs-sub' }, tg.msg || ''),
                  h('td', { className: 'dgs-sub', style: { textAlign: 'right', whiteSpace: 'nowrap' } },
                    (tg.sha || '') + ' · ' + timeAgo(tg.date)))
              }))))
  )
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

// ── 文件历史 ───────────────────────────────────────────────────────────────

function FileHistory({ repo, rev, path }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/file-history?ref=${encodeURIComponent(rev)}&path=${encodeURIComponent(path)}`)
      .then((d) => setList(d.commits || []))
  }, [repo.owner, repo.name, rev, path])
  if (list === null) return h('div', { className: 'dgs-empty' }, '…')
  return h('table', { className: 'dgs-table' },
    h('tbody', null, list.length === 0
      ? h('tr', null, h('td', { className: 'dgs-sub' }, '—'))
      : list.map((cm) =>
          h('tr', { key: cm.sha },
            h('td', { className: 'dgs-sub', style: { width: 70 } }, cm.sha),
            h('td', null, cm.msg || ''),
            h('td', { className: 'dgs-sub', style: { textAlign: 'right', whiteSpace: 'nowrap' } },
              (cm.author || '') + ' · ' + timeAgo(cm.date))))))
}

// ── 标签管理 ───────────────────────────────────────────────────────────────

function LabelsManage({ repo, t, onFilterLabel }) {
  const [list, setList] = useState(null)
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', color: '#70c24a' })
  const [msg, setMsg] = useState('')
  const reload = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setList(Array.isArray(d) ? d : []))
  useEffect(() => { reload() }, [repo.owner, repo.name])
  const save = async () => {
    const d = editId
      ? await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/labels/${editId}`, form)
      : await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/labels`, form)
    if (d && d.ok !== false && !d.error) {
      setForm({ name: '', color: '#70c24a' }); setCreating(false); setEditId(null); reload()
    } else setMsg((d && d.error) || 'failed')
  }
  const startCreate = () => { setCreating(!creating); setEditId(null); setForm({ name: '', color: '#70c24a' }) }
  const startEdit = (l) => { setEditId(l.id); setCreating(false); setForm({ name: l.name, color: l.color || '#70c24a' }) }
  const header = h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
    h('span', { style: { fontWeight: 700 } }, list ? list.length + ' 个标签' : ''),
    h('span', { style: { flex: 1 } }),
    h('button', { className: 'dgs-btn ghost', onClick: async () => {
      const templates = [
        { name: 'bug', color: '#e25444' }, { name: 'duplicate', color: '#b7b7b7' },
        { name: 'enhancement', color: '#70c24a' }, { name: 'help wanted', color: '#c8c8ff' },
        { name: 'invalid', color: '#fef2c0' }, { name: 'question', color: '#d876e3' },
        { name: 'wontfix', color: '#ffffff' },
      ]
      for (const tpl of templates) {
        await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/labels`, tpl)
      }
      reload()
    } }, '加载标签模板'),
    h('button', { className: 'dgs-btn', onClick: startCreate }, '创建标签'))
  const formCard = (creating || editId !== null)
    ? h('div', { className: 'dgs-card', style: { marginBottom: 12 } },
        h('div', { className: 'dgs-row' },
          h('input', { className: 'dgs-input', style: { maxWidth: 160 }, placeholder: '标签名称', value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) }),
          h('input', { type: 'color', value: form.color, onChange: (e) => setForm({ ...form, color: e.target.value }), style: { width: 36, height: 30, padding: 0, border: 'none', background: 'none' } }),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dgs-btn', disabled: !form.name.trim(), onClick: save }, editId !== null ? '保存' : '创建标签')))
    : null
  const rows = (list || []).map((l) =>
    h('div', { key: l.id, className: 'dgs-issue' },
      h('div', { className: 'dgs-row' },
        h('span', { className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33', borderColor: l.color || '#70c24a' } }, l.name),
        h('span', { style: { flex: 1 } }),
        h('a', { className: 'dgs-sub', style: { cursor: 'pointer' }, onClick: () => onFilterLabel && onFilterLabel(l.id) }, (l.openIssues || 0) + ' 个开启的工单'),
        h('button', { className: 'dgs-btn ghost', onClick: () => startEdit(l) }, '编辑'),
        h('button', { className: 'dgs-btn danger', onClick: async () => {
          await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/labels/${l.id}`); reload()
        } }, t('delete')))))
  return h('div', null,
    header,
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    formCard,
    list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
      : list.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
      : rows)
}

// ── 里程碑管理 ─────────────────────────────────────────────────────────────

function MilestonesManage({ repo, t, onOpenMilestone }) {
  const [list, setList] = useState(null)
  const [showClosed, setShowClosed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ title: '', due: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [openMs, setOpenMs] = useState(null)
  const [msIssues, setMsIssues] = useState(null)
  const reload = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setList(Array.isArray(d) ? d : []))
  useEffect(() => { reload() }, [repo.owner, repo.name])
  const toggleMs = (m) => {
    if (onOpenMilestone) onOpenMilestone(m)
    else if (openMs === m.id) { setOpenMs(null); setMsIssues(null) }
    else {
      setOpenMs(m.id); setMsIssues(null)
      api('GET', `/dsh/repos/${repo.owner}/${repo.name}/issues?milestone=${m.id}&state=all`).then((d) => setMsIssues(Array.isArray(d) ? d : []))
    }
  }
  const startCreate = () => {
    setCreating(!creating); setEditId(null)
    setForm({ title: '', due: '', description: '' })
  }
  const startEdit = (m) => {
    setEditId(m.id); setCreating(false)
    setForm({ title: m.title, due: m.due ? new Date(m.due * 1000).toISOString().slice(0, 10) : '', description: m.description || '' })
  }
  const saveForm = async () => {
    setBusy(true); setMsg('')
    const body = { title: form.title.trim(), description: form.description }
    if (form.due) body.due = form.due
    const d = editId
      ? await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/milestones/${editId}`, body)
      : await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/milestones`, body)
    setBusy(false)
    if (d && d.ok !== false && !d.error) {
      setCreating(false); setEditId(null); setForm({ title: '', due: '', description: '' }); reload()
    } else setMsg((d && d.error) || 'failed')
  }
  const shown = (list || []).filter((m) => showClosed ? m.closed : !m.closed)
  const openCount = (list || []).filter((m) => !m.closed).length
  const closedCount = (list || []).filter((m) => m.closed).length
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
      h('button', { className: 'dgs-btn ghost', onClick: () => setShowClosed(false) }, '开放里程碑 (' + openCount + ')'),
      h('button', { className: 'dgs-btn ghost', onClick: () => setShowClosed(true) }, '已关闭里程碑 (' + closedCount + ')'),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn', onClick: startCreate }, '+ 创建里程碑')),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    (creating || editId !== null) ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
      h('div', { className: 'dgs-row' },
        h('span', { style: { fontWeight: 700 } }, editId !== null ? '编辑里程碑' : '创建里程碑'),
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'dgs-btn ghost', onClick: () => { setCreating(false); setEditId(null) } }, t('back'))),
      h('div', { style: { margin: '8px 0 0' } },
        h('input', { className: 'dgs-input', placeholder: '里程碑标题', value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) }),
        h('div', { className: 'dgs-row', style: { marginTop: 8 } },
          h('span', { className: 'dgs-sub', style: { minWidth: 60 } }, '截止日期'),
          h('input', { type: 'date', className: 'dgs-input', style: { maxWidth: 180, flex: 'none' }, value: form.due, onChange: (e) => setForm({ ...form, due: e.target.value }) })),
        h('textarea', { className: 'dgs-input', style: { marginTop: 8, minHeight: 60 }, placeholder: '描述', value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }) }),
        h('div', { className: 'dgs-row', style: { marginTop: 8 } },
          h('button', { className: 'dgs-btn', disabled: busy || !form.title.trim(), onClick: saveForm }, editId !== null ? t('save') : t('submit')))))
      : null,
    list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
      : shown.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
      : shown.map((m) => {
        const total = (m.open || 0) + (m.closedIssues || 0)
        const pct = total ? Math.round((m.closedIssues || 0) * 100 / total) : 0
        const overdue = m.due && !m.closed && m.due * 1000 < Date.now()
        return h('div', { key: m.id, className: 'dgs-issue' },
          h('div', { className: 'dgs-row', style: { alignItems: 'flex-start' } },
            h('div', { style: { flex: 2, minWidth: 0 } },
              h('span', { style: { fontWeight: 600, cursor: 'pointer' }, onClick: () => toggleMs(m) }, '◆ ' + m.title),
              m.description ? h('div', { className: 'dgs-sub', style: { marginTop: 2 } }, m.description) : null,
              m.due ? h('div', { className: 'dgs-sub', style: { marginTop: 2, color: overdue ? 'var(--dsw-alias-state-error-primary)' : undefined } },
                '截止 ' + fmtDate(m.due * 1000) + (overdue ? ' · 已逾期' : '')) : null),
            h('div', { style: { flex: 1, minWidth: 170 } },
              h('div', { style: { height: 8, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 8, overflow: 'hidden', marginBottom: 4 } },
                h('div', { style: { width: pct + '%', height: '100%', background: 'var(--dsw-alias-state-business-primary)' } })),
              h('div', { className: 'dgs-sub' }, pct + '% 完成 · ' + (m.closedIssues || 0) + ' 已关闭 · ' + (m.open || 0) + ' 开放')),
            h('div', { className: 'dgs-row', style: { flex: 'none' } },
              h('button', { className: 'dgs-btn ghost', onClick: () => startEdit(m) }, t('edit')),
              h('button', { className: 'dgs-btn ghost', onClick: async () => {
                await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/milestones/${m.id}`, { closed: !m.closed }); reload()
              } }, m.closed ? '重新打开' : '关闭里程碑'),
              h('button', { className: 'dgs-btn danger', onClick: async () => {
                if (!confirm('删除里程碑 ' + m.title + ' ？')) return
                await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/milestones/${m.id}`)
                if (openMs === m.id) { setOpenMs(null); setMsIssues(null) }
                reload()
              } }, t('delete')))),
          openMs === m.id ? h('div', { style: { margin: '6px 0 2px 24px' } },
            msIssues === null ? h('span', { className: 'dgs-sub' }, t('loading'))
              : msIssues.length === 0 ? h('span', { className: 'dgs-sub' }, t('noIssues'))
              : msIssues.map((i) => h('div', { key: i.number, className: 'dgs-row', style: { padding: '2px 0' } },
                  h('span', { className: 'dgs-badge' + (i.state === 'open' ? ' ok' : ' closed') }, '#' + i.number),
                  h('span', { style: { cursor: 'pointer' }, onClick: () => nav('/r/' + repo.owner + '/' + repo.name) }, i.title)))) : null)
      }))
}

// ── 仓库设置（基础信息 + 协作者） ──────────────────────────────────────────

function RepoSettings({ repo, t }) {
  const [sub, setSub] = useState('basic')
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ description: '', private: false, website: '' })
  const [collabs, setCollabs] = useState([])
  const [addName, setAddName] = useState('')
  const [hooks, setHooks] = useState(null)
  const [hookUrl, setHookUrl] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const loadCollabs = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setCollabs(Array.isArray(d) ? d : []))
  const loadHooks = () => api('GET', `/dsh/repos/${repo.owner}/${repo.name}/hooks`).then((d) => setHooks(Array.isArray(d) ? d : []))
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}`).then((d) => {
      if (d && d.name) { setInfo(d); setForm({ description: d.description || '', private: !!d.private, website: d.website || '' }) }
      else setMsg((d && d.error) || t('loadFailed'))
    })
    loadCollabs()
    loadHooks()
  }, [repo.owner, repo.name])
  if (info === null && !msg) return h('div', { className: 'dgs-empty' }, t('loading'))
  const navItem = (k, label) => h('span', { key: k, className: 'item' + (sub === k ? ' active' : ''), onClick: () => setSub(k) }, label)
  const basic = h('div', { className: 'dgs-card', style: { marginBottom: 12 } },
    h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '基本设置'),
    h('div', { className: 'dgs-row' },
      h('span', { className: 'dgs-sub', style: { minWidth: 70 } }, '仓库描述'),
      h('input', { className: 'dgs-input', value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }) })),
    h('div', { className: 'dgs-sub', style: { margin: '2px 0 0 78px', fontSize: 11 } }, '最多 512 个字符，剩余 ' + (512 - (form.description || '').length)),
    h('div', { className: 'dgs-row' },
      h('span', { className: 'dgs-sub', style: { minWidth: 70 } }, '官方网站'),
      h('input', { className: 'dgs-input', placeholder: 'https://…', value: form.website, onChange: (e) => setForm({ ...form, website: e.target.value }) })),
    h('div', { className: 'dgs-row' },
      h('span', { className: 'dgs-sub', style: { minWidth: 70 } }, '可见性'),
      h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 4, alignItems: 'center' } },
        h('input', { type: 'checkbox', checked: form.private, onChange: (e) => setForm({ ...form, private: e.target.checked }) }), '该仓库为私有的')),
    h('div', { className: 'dgs-row', style: { marginTop: 8 } },
      h('button', { className: 'dgs-btn', disabled: busy,
        onClick: async () => {
          setBusy(true); setMsg('')
          const d = await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}`, form)
          setBusy(false)
          d && d.ok ? setMsg('✓ 已保存') : setMsg((d && d.error) || 'failed')
        } }, '更新设置')))
  const collab = h('div', { className: 'dgs-card' },
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
      } }, t('delete')))))
  const hooksCard = h('div', { className: 'dgs-card' },
    h('div', { style: { fontWeight: 700, marginBottom: 8 } }, 'Webhook'),
    h('div', { className: 'dgs-row' },
      h('input', { className: 'dgs-input', placeholder: 'https://…', value: hookUrl, onChange: (e) => setHookUrl(e.target.value) }),
      h('button', { className: 'dgs-btn', disabled: !hookUrl.trim(), onClick: async () => {
        const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/hooks`, { url: hookUrl.trim() })
        if (d && !d.error) { setHookUrl(''); loadHooks() } else setMsg((d && d.error) || 'failed')
      } }, '+ 添加')),
    (hooks || []).map((hk) => h('div', { key: hk.id, className: 'dgs-row', style: { marginTop: 6 } },
      h('span', { className: 'dgs-badge' + (hk.is_active ? ' ok' : ' closed') }, hk.is_active ? '启用' : '停用'),
      h('span', { className: 'dgs-sub', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, hk.url),
      h('button', { className: 'dgs-btn ghost', onClick: async () => {
        await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/hooks/${hk.id}`, { active: !hk.is_active }); loadHooks()
      } }, hk.is_active ? '停用' : '启用'),
      h('button', { className: 'dgs-btn danger', onClick: async () => {
        await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/hooks/${hk.id}`); loadHooks()
      } }, t('delete')))),
    hooks !== null && hooks.length === 0 ? h('div', { className: 'dgs-sub', style: { marginTop: 6 } }, '—') : null)
  const danger = h('div', { className: 'dgs-card', style: { marginTop: 12, borderColor: 'var(--dsw-alias-state-error-primary)55' } },
    h('div', { style: { fontWeight: 700, marginBottom: 8, color: 'var(--dsw-alias-state-error-primary)' } }, '危险区域'),
    h('div', { className: 'dgs-row' },
      h('span', { className: 'dgs-sub', style: { flex: 1 } }, '转移仓库所有权（组织/用户）'),
      h('button', { className: 'dgs-btn ghost', onClick: async () => {
        const org = prompt('转移到组织名（留空 = 当前用户）', '')
        if (org === null) return
        const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/transfer`, { org: org || undefined })
        setMsg(d && d.ok ? '已转移' : (d && d.error) || '转移失败')
      } }, '转移仓库')),
    h('div', { className: 'dgs-row' },
      h('span', { className: 'dgs-sub', style: { flex: 1 } }, '清除 Wiki 数据（删除所有 Wiki 页面）'),
      h('button', { className: 'dgs-btn danger', onClick: async () => {
        if (!confirm('确定清除该仓库的全部 Wiki 页面？')) return
        const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/wiki-wipe`)
        setMsg(d && d.ok ? '已清除' : (d && d.error) || '清除失败')
      } }, '清除 Wiki 数据')),
    h('div', { className: 'dgs-row' },
      h('span', { className: 'dgs-sub', style: { flex: 1 } }, '删除此仓库（含所有工单/PR/Wiki）'),
      h('button', { className: 'dgs-btn danger', onClick: async () => {
        if (!confirm('确定删除仓库 ' + repo.name + ' ？此操作不可恢复')) return
        const d = await api('DELETE', '/repos/' + repo.owner + '/' + repo.name)
        if (d && d.ok) nav('/repos')
        else setMsg((d && d.error) || '删除失败')
      } }, t('delete') + ' ' + repo.name)))
  return h('div', null,
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    h('div', { className: 'dgs-settings-layout' },
      h('div', { className: 'dgs-settings-nav' },
        navItem('basic', '基本设置'),
        navItem('collab', '管理协作者'),
        navItem('hooks', '管理 Web 钩子'),
        navItem('danger', '危险区域')),
      h('div', { style: { flex: 1, minWidth: 0 } },
        sub === 'basic' ? basic : sub === 'collab' ? collab : sub === 'hooks' ? hooksCard : danger)))
}

// ── PR（列表 + 详情 + 合并 + 评论复用 issue 通道） ────────────────────────

function Pulls({ repo, t, preset, onPresetDone, onGoIssuesSub }) {
  const [list, setList] = useState(null)
  const [openIdx, setOpenIdx] = useState(null)
  const [creating, setCreating] = useState(false)
  const [state, setState] = useState('open')
  const [flt, setFlt] = useState({ label: '', milestone: '', assignee: '' })
  const [sort, setSort] = useState('latest')
  const [meta, setMeta] = useState({ labels: [], milestones: [], collabs: [] })
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ title: '', head: '', base: '', body: '' })
  const [sel, setSel] = useState({ labels: new Set(), milestone: '', assignee: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const reload = useCallback(() => {
    setList(null)
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/pulls`).then((d) => setList(Array.isArray(d) ? d : (d.data || d.pulls || [])))
  }, [repo.owner, repo.name])
  useEffect(reload, [reload])
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((d) => {
      setBranches(d.branches || [])
      setForm((f) => ({ ...f, base: d.defaultBranch || 'master' }))
    })
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setMeta((m) => ({ ...m, labels: Array.isArray(d) ? d : [] })))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setMeta((m) => ({ ...m, milestones: Array.isArray(d) ? d : [] })))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setMeta((m) => ({ ...m, collabs: Array.isArray(d) ? d : [] })))
  }, [repo.owner, repo.name])
  useEffect(() => {
    if (!creating || !form.head || !form.base || form.head === form.base) { setPreview(null); return }
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/compare?base=${encodeURIComponent(form.base)}&head=${encodeURIComponent(form.head)}`)
      .then((d) => setPreview(d && d.commits ? d : null))
  }, [creating, form.head, form.base, repo.owner, repo.name])
  useEffect(() => {
    if (preset) {
      setCreating(true)
      setForm((f) => ({ ...f, head: preset.head, base: preset.base || f.base }))
      onPresetDone && onPresetDone()
    }
  }, [preset])
  if (openIdx !== null) return h(PullDetail, { repo, idx: openIdx, t, onBack: () => { setOpenIdx(null); reload() } })
  if (list === null) return h('div', { className: 'dgs-empty' }, t('loading'))
  const openCount = list.filter((x) => x.state === 'open').length
  const closedCount = list.filter((x) => x.state !== 'open').length
  let shown = list.filter((x) => state === 'open' ? x.state === 'open' : x.state !== 'open')
  if (flt.label) shown = shown.filter((x) => (x.labels || []).some((l) => String(l.id) === String(flt.label)))
  if (flt.milestone) shown = shown.filter((x) => x.milestone && String(x.milestone.id) === String(flt.milestone))
  if (flt.assignee) shown = shown.filter((x) => x.assignee === flt.assignee)
  shown = [...shown].sort((a, b) => {
    const at = (a.updatedAt || 0) * 1000; const bt = (b.updatedAt || 0) * 1000
    return sort === 'latest' ? bt - at : sort === 'oldest' ? at - bt : (b.comments || 0) - (a.comments || 0)
  })
  const fltSel = (key, items, blank) => h('select', {
    key: key, className: 'dgs-input', style: { maxWidth: 130, flex: 'none', width: 'auto', padding: '5px 8px', marginLeft: 8 },
    value: flt[key], onChange: (e) => setFlt({ ...flt, [key]: e.target.value }),
  }, h('option', { value: '' }, blank),
    items.map((x) => h('option', { key: x.id || x.name, value: String(x.id || x.name) }, x.name)))
  const row = (x) => h('div', { key: x.index, className: 'dgs-issue', style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }, onClick: () => setOpenIdx(x.index) },
    h('span', { className: 'dgs-issue-num' + (x.state !== 'open' ? ' closed' : '') }, '#' + x.index),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { className: 'dgs-row', style: { gap: 6 } },
        h('span', { className: 'dgs-issue-title' }, x.title),
        (x.labels || []).map((l) => h('span', { key: l.id, className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33', borderColor: l.color || '#70c24a' } }, l.name)),
        x.milestone ? h('span', { className: 'dgs-badge' }, '◆ ' + x.milestone.title) : null,
        x.state === 'merged' ? h('span', { className: 'dgs-badge' }, '已合并') : null),
      h('div', { className: 'dgs-sub', style: { marginTop: 2 } },
        '由 ' + (x.author || '') + ' 于 ' + timeAgo((x.updatedAt || 0) * 1000 || x.updatedAt) + ' 发起 · ' + x.head + ' → ' + x.base)),
    h('span', { className: 'dgs-sub', style: { flex: 'none' } }, (x.comments != null ? '💬 ' + x.comments : '')))
  const toggleLabel = (id) => setSel((x) => {
    const next = new Set(x.labels)
    next.has(id) ? next.delete(id) : next.add(id)
    return { ...x, labels: next }
  })
  const createSide = h('div', null,
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '标签 ⚙'),
      meta.labels.length === 0 ? h('div', { className: 'dgs-sub' }, '未选择标签') : null,
      meta.labels.map((l) => h('label', { key: l.id, className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: sel.labels.has(l.id), onChange: () => toggleLabel(l.id) }),
        h('span', { className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33' } }, l.name)))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '里程碑 ⚙'),
      h('select', { className: 'dgs-input', style: { width: '100%' }, value: sel.milestone, onChange: (e) => setSel({ ...sel, milestone: e.target.value }) },
        h('option', { value: '' }, '未选择里程碑'),
        meta.milestones.map((m) => h('option', { key: m.id, value: m.id }, m.title + (m.closed ? ' ✓' : ''))))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '指派成员 ⚙'),
      h('select', { className: 'dgs-input', style: { width: '100%' }, value: sel.assignee, onChange: (e) => setSel({ ...sel, assignee: e.target.value }) },
        h('option', { value: '' }, '未指派成员'),
        meta.collabs.map((u) => h('option', { key: u.name, value: u.name }, u.name)))))
  const createForm = h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
    h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
      h('span', { style: { fontWeight: 700 } }, '对比文件变化'),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn ghost', onClick: () => setCreating(false) }, t('back'))),
    h('div', { className: 'dgs-sub', style: { marginBottom: 8 } }, '对比两个分支间的文件变化并发起一个合并请求。'),
    h('div', { className: 'dgs-issue-layout' },
      h('div', { className: 'dgs-issue-main' },
        h('div', { className: 'dgs-row', style: { marginBottom: 8 } },
          h('select', { className: 'dgs-input', style: { maxWidth: 170, flex: 'none', width: 'auto' }, value: form.base, onChange: (e) => setForm({ ...form, base: e.target.value }) },
            branches.map((b) => h('option', { key: b, value: b }, '基准分支: ' + b))),
          h('span', { className: 'dgs-sub' }, '…'),
          h('select', { className: 'dgs-input', style: { maxWidth: 170, flex: 'none', width: 'auto' }, value: form.head, onChange: (e) => setForm({ ...form, head: e.target.value }) },
            h('option', { value: '' }, '对比分支…'),
            branches.map((b) => h('option', { key: b, value: b }, '对比分支: ' + b)))),
        h('input', { className: 'dgs-input', placeholder: '标题', value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) }),
        h('div', { className: 'dgs-row', style: { margin: '8px 0 4px' } },
          h('button', { className: 'dgs-subtab' + (!previewMode ? ' active' : ''), onClick: () => setPreviewMode(false) }, '内容编辑'),
          h('button', { className: 'dgs-subtab' + (previewMode ? ' active' : ''), onClick: () => {
            setPreviewMode(true)
            api('POST', '/dsh/markdown', { text: form.body }).then((d) => setPreviewHtml(d.html || ''))
          } }, '效果预览')),
        previewMode ? h('div', { className: 'dgs-md', style: { minHeight: 120, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 12 } },
          form.body ? h('div', { dangerouslySetInnerHTML: { __html: previewHtml } }) : h('span', { className: 'dgs-sub' }, '暂无内容'))
          : h('textarea', { className: 'dgs-input', style: { minHeight: 120 }, placeholder: '内容', value: form.body, onChange: (e) => setForm({ ...form, body: e.target.value }) }),
        preview ? h('div', { className: 'dgs-card', style: { margin: '8px 0', padding: 10 } },
          h('div', { className: 'dgs-sub', style: { marginBottom: 6 } }, `${preview.commits.length} commits`),
          h('pre', { className: 'dgs-file' }, preview.diffStat || '—')) : null,
        h('div', { className: 'dgs-row', style: { marginTop: 10, justifyContent: 'flex-end' } },
          h('button', { className: 'dgs-btn', disabled: busy || !form.title.trim() || !form.head,
            onClick: async () => {
              setBusy(true); setMsg('')
              const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/pulls`, {
                ...form,
                labels: [...sel.labels].map(Number),
                milestone: sel.milestone ? Number(sel.milestone) : undefined,
                assignee: sel.assignee || undefined,
              })
              setBusy(false)
              if (d.ok) { setCreating(false); setForm({ title: '', head: '', base: form.base, body: '' }); setSel({ labels: new Set(), milestone: '', assignee: '' }); reload() }
              else setMsg(d.error || 'failed')
            } }, '创建合并请求'))),
      h('div', { className: 'dgs-issue-side' }, createSide)))
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '0 0 12px' } },
      h('a', { style: { cursor: 'pointer', marginRight: 18, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }, onClick: () => { if (onGoIssuesSub) onGoIssuesSub('labels') } }, '标签管理'),
      h('a', { style: { cursor: 'pointer', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }, onClick: () => { if (onGoIssuesSub) onGoIssuesSub('milestones') } }, '里程碑'),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn', onClick: () => setCreating(!creating) }, '创建合并请求')),
    h('div', { className: 'dgs-row', style: { margin: '0 0 12px' } },
      h('button', { className: 'dgs-pill' + (state === 'open' ? ' active' : ''), onClick: () => setState('open') }, '⊘ ' + openCount + ' 个开启中'),
      h('button', { className: 'dgs-pill closed' + (state === 'closed' ? ' active' : ''), onClick: () => setState('closed') }, '✓ ' + closedCount + ' 个已关闭'),
      h('span', { style: { flex: 1 } }),
      fltSel('label', meta.labels, '标签筛选'),
      fltSel('milestone', meta.milestones, '里程碑筛选'),
      fltSel('assignee', meta.collabs, '指派人筛选'),
      h('select', { key: 'sort', className: 'dgs-input', style: { maxWidth: 130, flex: 'none', width: 'auto', padding: '5px 8px', marginLeft: 8 }, value: sort, onChange: (e) => setSort(e.target.value) },
        [['latest', '最新'], ['oldest', '最旧'], ['mostcomment', '最多评论']].map(([v, label]) => h('option', { key: v, value: v }, '排序: ' + label)))),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    creating ? createForm : null,
    shown.length === 0 && !creating ? h('div', { className: 'dgs-empty' }, t('noPulls')) : null,
    shown.map(row))
}

function PullDetail({ repo, idx, t, onBack }) {
  const [pr, setPr] = useState(null)
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [mergeStyle, setMergeStyle] = useState('merge')
  const [tab, setTab] = useState('conv')
  const [cmp, setCmp] = useState(null)
  const [selCommit, setSelCommit] = useState(null)
  const [issue, setIssue] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const [allLabels, setAllLabels] = useState([])
  const [allMs, setAllMs] = useState([])
  const [collabs, setCollabs] = useState([])
  const [mergeMsg, setMergeMsg] = useState('')
  useEffect(() => {
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/pulls`).then((d) => {
      const all = Array.isArray(d) ? d : (d.data || d.pulls || [])
      const found = all.find((x) => x.index === idx) || null
      setPr(found)
      if (found) api('GET', `/dsh/repos/${repo.owner}/${repo.name}/compare?base=${encodeURIComponent(found.base)}&head=${encodeURIComponent(found.head)}`).then((c) => c && c.commits && setCmp(c))
    })
    api('GET', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`).then((d) => setComments(d.comments || []))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/issues/${idx}`).then((d) => setIssue(d && d.number ? d : null))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/labels`).then((d) => setAllLabels(Array.isArray(d) ? d : []))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/milestones`).then((d) => setAllMs(Array.isArray(d) ? d : []))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/collaborators`).then((d) => setCollabs(Array.isArray(d) ? d : []))
  }, [repo.owner, repo.name, idx])
  const patchIssue = async (fields) => {
    setBusy(true)
    await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/issues/${idx}`, fields)
    setBusy(false)
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/issues/${idx}`).then((d) => setIssue(d && d.number ? d : null))
  }

  if (pr === null) return h('div', { className: 'dgs-empty' }, t('loading'))
  const headRef = (pr.headUser || repo.owner) + '/' + pr.head
  const baseRef = repo.owner + '/' + pr.base
  const side = h('div', null,
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '标签 ⚙'),
      !issue ? h('div', { className: 'dgs-sub' }, '…') : allLabels.length === 0 ? h('div', { className: 'dgs-sub' }, '未选择标签') : null,
      issue && allLabels.map((l) => h('label', { key: l.id, className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: (issue.labels || []).some((x) => x.id === l.id),
          onChange: (e) => {
            const cur = new Set((issue.labels || []).map((x) => x.id))
            if (e.target.checked) cur.add(l.id); else cur.delete(l.id)
            patchIssue({ labels: [...cur] })
          } }),
        h('span', { className: 'dgs-badge', style: { background: (l.color || '#70c24a') + '33' } }, l.name)))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '里程碑 ⚙'),
      !issue ? h('div', { className: 'dgs-sub' }, '…')
        : h('select', { className: 'dgs-input', style: { width: '100%' }, value: issue.milestone ? issue.milestone.id : '',
            onChange: (e) => patchIssue({ milestone: Number(e.target.value) || 0 }) },
            h('option', { value: '' }, '未选择里程碑'),
            allMs.map((m) => h('option', { key: m.id, value: m.id }, m.title + (m.closed ? ' ✓' : ''))))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, '指派成员 ⚙'),
      !issue ? h('div', { className: 'dgs-sub' }, '…')
        : h('select', { className: 'dgs-input', style: { width: '100%' }, value: issue.assignee || '',
            onChange: (e) => patchIssue({ assignee: e.target.value }) },
            h('option', { value: '' }, '未指派成员'),
            collabs.map((u) => h('option', { key: u.name, value: u.name }, u.name)))),
    h('div', { className: 'dgs-side-block' },
      h('div', { className: 'dgs-side-title' }, (issue && issue.participants || 1) + ' 名参与者'),
      h('div', { className: 'dgs-sub' }, pr.author || '')))
  const mergeBox = pr.state === 'open' ? h('div', { className: 'dgs-card', style: { margin: '10px 0', borderColor: 'var(--dsw-alias-state-success-primary)55' } },
    h('div', { className: 'dgs-row', style: { gap: 8 } },
      h('span', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 16 } }, '⑂'),
      h('span', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 13 } }, '该合并请求可以进行自动合并操作。')),
    h('div', { style: { margin: '10px 0' } },
      h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' } },
        h('input', { type: 'radio', name: 'mergeStyle', checked: mergeStyle === 'merge', onChange: () => setMergeStyle('merge') }), '创建一个新的合并提交'),
      h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' } },
        h('input', { type: 'radio', name: 'mergeStyle', checked: mergeStyle === 'squash', onChange: () => setMergeStyle('squash') }), '压缩提交并合并'),
      h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' } },
        h('input', { type: 'radio', name: 'mergeStyle', checked: mergeStyle === 'rebase', onChange: () => setMergeStyle('rebase') }), '变基并合并')),
    h('div', { className: 'dgs-sub', style: { margin: '6px 0' } }, '提交说明:'),
    h('textarea', { className: 'dgs-input', style: { minHeight: 60 }, value: mergeMsg, onChange: (e) => setMergeMsg(e.target.value) }),
    h('div', { className: 'dgs-row', style: { marginTop: 10 } },
      h('button', { className: 'dgs-btn', disabled: busy,
        onClick: async () => {
          if (!confirm(t('mergeConfirm'))) return
          setBusy(true); setMsg('')
          const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/pulls/${idx}/merge`, { style: mergeStyle, message: mergeMsg })
          setBusy(false)
          d.ok !== false && !d.error ? onBack() : setMsg(d.error || 'merge failed')
        } }, '⇆ 合并请求'),
      h('button', { className: 'dgs-btn danger', disabled: busy,
        onClick: async () => {
          if (!confirm('不合并直接关闭此 PR？')) return
          setBusy(true)
          await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/pulls/${idx}/close`)
          setBusy(false); onBack()
        } }, '关闭')))
    : h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
        h('span', { className: 'dgs-badge' }, pr.state === 'merged' ? '已合并' : '已关闭'))
  const conv = h('div', null,
    (comments || []).map((c) =>
      h('div', { key: c.id, className: 'dgs-comment' },
        h('div', { className: 'dgs-sub', style: { marginBottom: 4 } }, `${c.user || ''} 评论于 ${fmtDate(c.created)}`),
        h('div', { style: { whiteSpace: 'pre-wrap' } }, c.body || '这个人很懒，什么都没留下。'))),
    h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
      h('textarea', { className: 'dgs-input', placeholder: t('commentPlaceholder'), value: text, onChange: (e) => setText(e.target.value) }),
      h('div', { className: 'dgs-row', style: { marginTop: 8 } },
        h('button', { className: 'dgs-btn', disabled: busy || !text.trim(),
          onClick: async () => {
            setBusy(true)
            await api('POST', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`, { body: text })
            setText(''); setBusy(false)
            api('GET', `/repos/${repo.owner}/${repo.name}/issues/${idx}/comments`).then((d) => setComments(d.comments || []))
          } }, t('comment')))))
  const commitsTab = selCommit
    ? h(CommitDetail, { repo, sha: selCommit, t, onBack: () => setSelCommit(null) })
    : cmp === null ? h('div', { className: 'dgs-empty' }, t('loading'))
    : cmp.commits.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
    : h('table', { className: 'dgs-table' },
        h('tbody', null, cmp.commits.map((c) =>
          h('tr', { key: c.sha, style: { cursor: 'pointer' }, onClick: () => setSelCommit(c.sha) },
            h('td', null, h('div', { style: { fontWeight: 500 } }, (c.message || '').split('\n')[0]),
              h('div', { className: 'dgs-sub' }, c.author)),
            h('td', { className: 'dgs-sub', style: { textAlign: 'right' } },
              h('a', { style: { color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer' } }, (c.sha || '').slice(0, 10)))))))
  const filesTab = cmp === null ? h('div', { className: 'dgs-empty' }, t('loading'))
    : cmp.diff ? h(DiffView, { patch: cmp.diff })
    : h('div', { className: 'dgs-empty' }, '无差异')
  const tabBtn = (k, label, count) => h('button', { key: k, className: 'dgs-subtab' + (tab === k ? ' active' : ''), onClick: () => setTab(k) },
    label + (count !== undefined && count !== null ? ' ' + count : ''))
  return h('div', null,
    h('div', { className: 'dgs-row', style: { marginBottom: 6 } },
      h('button', { className: 'dgs-btn ghost', onClick: onBack }, t('back')),
      h('span', { className: 'dgs-h1', style: { fontSize: 17 } }, '#' + idx + ' ' + pr.title),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn ghost', onClick: () => {
        if (!issue) return
        setDraft({ title: issue.title, body: issue.body })
        setEditing(!editing)
      } }, '编辑')),
    h('div', { className: 'dgs-row', style: { marginBottom: 10 } },
      h('span', { className: 'dgs-issue-num' }, pr.state === 'open' ? '开启中' : pr.state === 'merged' ? '已合并' : '已关闭'),
      h('span', { className: 'dgs-sub' },
        (pr.author || '') + ' 请求将 ' + (cmp ? cmp.commits.length : 'N') + ' 次代码提交从 ' + headRef + ' 合并至 ' + baseRef)),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    editing && issue ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
      h('input', { className: 'dgs-input', value: draft.title, onChange: (e) => setDraft({ ...draft, title: e.target.value }) }),
      h('textarea', { className: 'dgs-input', style: { marginTop: 8, minHeight: 100 }, value: draft.body, onChange: (e) => setDraft({ ...draft, body: e.target.value }) }),
      h('div', { className: 'dgs-row', style: { marginTop: 8, justifyContent: 'flex-end' } },
        h('button', { className: 'dgs-btn ghost', onClick: () => setEditing(false) }, '取消'),
        h('button', { className: 'dgs-btn', disabled: busy || !draft.title.trim(),
          onClick: async () => { await patchIssue({ title: draft.title, body: draft.body }); setEditing(false) } }, '保存'))) : null,
    h('div', { className: 'dgs-subtabs', style: { margin: '8px 0 12px' } },
      tabBtn('conv', '对话内容', (comments || []).length),
      tabBtn('commits', '代码提交', cmp ? cmp.commits.length : ''),
      tabBtn('files', '文件变动', cmp && cmp.diff ? '1' : '0')),
    h('div', { className: 'dgs-issue-layout' },
      h('div', { className: 'dgs-issue-main' },
        tab === 'conv' ? h('div', null, conv, mergeBox) : tab === 'commits' ? commitsTab : filesTab),
      h('div', { className: 'dgs-issue-side' }, side)))
}

function WikiView({ repo, t }) {
  const [pages, setPages] = useState(null)
  const [page, setPage] = useState(null) // {name, html, content}
  const [hist, setHist] = useState(null)
  const [histMeta, setHistMeta] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const reload = useCallback(() => {
    setPages(null)
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/wiki`).then((d) => setPages(d.pages || []))
  }, [repo.owner, repo.name])
  useEffect(reload, [reload])
  const openPage = (name) => {
    setEditing(false); setCreating(false); setMsg(''); setHist(null); setHistMeta(null)
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(name)}`)
      .then((d) => d.html !== undefined ? setPage(d) : setPage({ name, missing: true, content: '', html: '' }))
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(name)}/commits`)
      .then((d) => { if (Array.isArray(d) && d.length) setHistMeta({ author: d[0].author, date: d[0].date }) })
  }
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
      h('span', { style: { fontWeight: 700 } }, t('wiki')),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn', onClick: () => {
        if (creating) { setCreating(false); return }
        setCreating(true); setEditing(false); setPage(null); setForm({ title: '', content: '' })
      } }, '+ ' + t('newWiki'))),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    creating ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
        h('input', { className: 'dgs-input', placeholder: t('wikiTitle'), value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) }),
        h('textarea', { className: 'dgs-input', style: { marginTop: 8, minHeight: '40vh' }, placeholder: '内容（Markdown）', value: form.content, onChange: (e) => setForm({ ...form, content: e.target.value }) }),
        h('div', { className: 'dgs-row', style: { marginTop: 8 } },
          h('button', { className: 'dgs-btn', disabled: busy || !form.title.trim(),
            onClick: async () => {
              setBusy(true); setMsg('')
              const name = form.title.trim()
              const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(name)}`, { content: form.content })
              setBusy(false)
              if (d.ok) { setCreating(false); reload(); openPage(name) } else setMsg(d.error || 'save failed')
            } }, t('submit'))))
      : h('div', { className: 'dgs-row', style: { alignItems: 'flex-start' } },
        h('div', { style: { width: 180, flex: 'none' } },
          h('div', { style: { fontWeight: 700, margin: '4px 0 8px' } }, t('wiki')),
          pages === null ? h('div', { className: 'dgs-sub' }, t('loading'))
            : pages.length === 0 ? h('div', { className: 'dgs-sub' }, t('noWiki'))
            : h('div', null, pages.map((p) =>
                h('div', { key: p.name, className: 'dgs-crumb', style: { padding: '3px 0' }, onClick: () => openPage(p.name) }, p.name)))),
        h('div', { style: { flex: 1, minWidth: 0, paddingLeft: 16 } },
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
                h('div', null,
                  h('span', { style: { fontWeight: 600 } }, page.name),
                  histMeta ? h('div', { className: 'dgs-sub', style: { marginTop: 2 } }, (histMeta.author || '') + ' 于 ' + timeAgo(histMeta.date) + ' 修改了此页面') : null),
                h('span', { style: { flex: 1 } }),
                h('button', { className: 'dgs-btn ghost', onClick: () => { setDraft(page.content || ''); setEditing(true) } }, t('edit')),
                h('button', { className: 'dgs-btn ghost', onClick: () => {
                  api('GET', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(page.name)}/commits`).then((d) => setHist(Array.isArray(d) ? d : []))
                } }, '历史'),
                h('button', { className: 'dgs-btn danger', onClick: async () => {
                  if (!confirm('删除页面 ' + page.name + ' ？')) return
                  await api('DELETE', `/dsh/repos/${repo.owner}/${repo.name}/wiki/${encodeURIComponent(page.name)}`)
                  setPage(null); reload()
                } }, t('delete'))),
              hist ? h('div', { className: 'dgs-card', style: { margin: '8px 0', padding: '8px 14px' } },
                hist.length === 0 ? h('span', { className: 'dgs-sub' }, '—')
                  : hist.map((cm, i) => h('div', { key: i, className: 'dgs-row', style: { padding: '2px 0' } },
                      h('span', { className: 'dgs-sub', style: { minWidth: 64 } }, (cm.sha || '').slice(0, 7)),
                      h('span', { style: { flex: 1 } }, cm.message || ''),
                      h('span', { className: 'dgs-sub' }, (cm.author || '') + ' · ' + fmtDate(cm.date))))) : null,
              h('div', { className: 'dgs-card' },
                h('div', { className: 'dgs-md', dangerouslySetInnerHTML: { __html: page.html } }))))))
}

// ── 发版（列表 + 创建） ────────────────────────────────────────────────────

function Releases({ repo, t }) {
  const [list, setList] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ tag: '', title: '', note: '', target: '' })
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [branches, setBranches] = useState([])
  const [plainTags, setPlainTags] = useState(null)
  const reload = useCallback(() => {
    setList(null)
    api('GET', `/dsh/repos/${repo.owner}/${repo.name}/releases`).then((d) => {
      setList(Array.isArray(d) ? d : (d.data || []))
      api('GET', `/dsh/repos/${repo.owner}/${repo.name}/overview`).then((ov) => {
        setBranches(ov.branches || [])
        const released = new Set((Array.isArray(d) ? d : (d.data || [])).map((r) => r.tag))
        setPlainTags((ov.tags || []).filter((tg) => !released.has(tg)))
      })
    })
  }, [repo.owner, repo.name])
  useEffect(reload, [reload])
  return h('div', null,
    h('div', { className: 'dgs-row', style: { margin: '8px 0 12px' } },
      h('span', { style: { fontWeight: 700 } }, t('releases')),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'dgs-btn', onClick: () => setCreating(!creating) }, '+ ' + t('newRelease'))),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
    creating ? h('div', { className: 'dgs-card', style: { margin: '10px 0' } },
      h('div', { className: 'dgs-row' },
        h('span', { style: { fontWeight: 700 } }, '发布新版本'),
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'dgs-btn ghost', onClick: () => setCreating(false) }, t('back'))),
      h('div', { className: 'dgs-row', style: { margin: '8px 0 0' } },
        h('input', { className: 'dgs-input', style: { maxWidth: 180 }, placeholder: '标签名（如 v0.1.0）', value: form.tag, onChange: (e) => setForm({ ...form, tag: e.target.value }) }),
        h('select', { className: 'dgs-input', style: { maxWidth: 180, flex: 'none', width: 'auto' }, value: form.target, onChange: (e) => setForm({ ...form, target: e.target.value }) },
          h('option', { value: '' }, '基于分支：默认分支'),
          branches.map((b) => h('option', { key: b, value: b }, b))),
        h('input', { className: 'dgs-input', placeholder: t('relTitle'), value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }) })),
      h('div', { className: 'dgs-sub', style: { margin: '6px 0 0' } }, '标签不存在时会基于所选分支自动创建 git 标签'),
      h('textarea', { className: 'dgs-input', placeholder: t('relNote'), value: form.note, onChange: (e) => setForm({ ...form, note: e.target.value }) }),
      h('div', { className: 'dgs-row', style: { marginTop: 8 } },
        h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 4, alignItems: 'center' } },
          h('input', { type: 'checkbox', checked: form.prerelease, onChange: (e) => setForm({ ...form, prerelease: e.target.checked }) }), '预发布版本'),
        h('label', { className: 'dgs-sub', style: { display: 'flex', gap: 4, alignItems: 'center' } },
          h('input', { type: 'checkbox', checked: form.draft, onChange: (e) => setForm({ ...form, draft: e.target.checked }) }), '存为草稿'),
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'dgs-btn', disabled: busy || !form.tag.trim(),
          onClick: async () => {
            setBusy(true); setMsg('')
            const d = await api('POST', `/dsh/repos/${repo.owner}/${repo.name}/releases`, form)
            setBusy(false)
            if (d.ok) { setCreating(false); setForm({ tag: '', title: '', note: '', target: '', prerelease: false, draft: false }); reload() }
            else setMsg(d.error || 'failed')
          } }, t('submit')))) : null,
    list === null ? h('div', { className: 'dgs-empty' }, t('loading'))
      : list.length === 0 ? h('div', { className: 'dgs-empty' }, t('noReleases'))
      : list.map((r) =>
          editId === r.id ? h('div', { key: r.id, className: 'dgs-card' },
            h('div', { className: 'dgs-row' },
              h('span', { className: 'dgs-badge ok' }, r.tag),
              h('span', { className: 'dgs-sub' }, '编辑发版'),
              h('span', { style: { flex: 1 } }),
              h('button', { className: 'dgs-btn ghost', onClick: () => setEditId(null) }, t('back'))),
            h('div', { style: { margin: '8px 0' } },
              h('input', { className: 'dgs-input', value: editForm.title, onChange: (e) => setEditForm({ ...editForm, title: e.target.value }) }),
              h('textarea', { className: 'dgs-input', style: { marginTop: 8 }, value: editForm.note, onChange: (e) => setEditForm({ ...editForm, note: e.target.value }) })),
            h('button', { className: 'dgs-btn', disabled: busy, onClick: async () => {
              setBusy(true)
              const d = await api('PATCH', `/dsh/repos/${repo.owner}/${repo.name}/releases/${r.id}`, editForm)
              setBusy(false)
              if (d && d.ok) { setEditId(null); reload() } else setMsg((d && d.error) || 'failed')
            } }, t('save')))
          : h('div', { key: r.id, className: 'dgs-card', style: { display: 'flex', gap: 16 } },
            h('div', { style: { flex: 'none', width: 110, paddingTop: 2 } },
              h('div', { style: { fontWeight: 600 } }, '◎ ' + r.tag),
              h('div', { className: 'dgs-sub', style: { marginTop: 4 } }, r.sha || '')),
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { className: 'dgs-row' },
                r.draft ? h('span', { className: 'dgs-badge' }, '草稿') : null,
                r.prerelease ? h('span', { className: 'dgs-badge pri' }, '预发布') : null,
                h('span', { style: { fontWeight: 600 } }, r.title),
                h('span', { style: { flex: 1 } }),
                h('a', { className: 'dgs-sub', style: { cursor: 'pointer' }, onClick: () => { setEditId(r.id); setEditForm({ title: r.title || '', note: r.noteRaw || '' }) } }, '(编辑)')),
              h('div', { className: 'dgs-sub', style: { marginTop: 4 } },
                (r.author || '') + ' · ' + timeAgo((r.createdAt || 0) * 1000) + ' 发布 · ' +
                (r.behind ? '在该版本发布之后已有 ' + r.behind + ' 次代码提交到 ' + (r.target || '默认') + ' 分支' : '暂无后续提交')),
              r.noteHtml ? h('div', { className: 'dgs-md', style: { marginTop: 8 }, dangerouslySetInnerHTML: { __html: r.noteHtml } }) : null,
              h('div', { style: { marginTop: 10 } },
                h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 } }, '下载附件'),
                h('div', { className: 'dgs-row', style: { gap: 8 } },
                  h('a', { className: 'dgs-sub', href: `/dsh-git-server/api/dsh/repos/${repo.owner}/${repo.name}/archive/${encodeURIComponent(r.tag)}.zip`, download: `${repo.name}-${r.tag}.zip` }, '源代码 (ZIP)'),
                  h('a', { className: 'dgs-sub', href: `/dsh-git-server/api/dsh/repos/${repo.owner}/${repo.name}/archive/${encodeURIComponent(r.tag)}.tar.gz`, download: `${repo.name}-${r.tag}.tar.gz` }, '源代码 (TAR.GZ)')))))),
    (plainTags && plainTags.length > 0) ? h('div', { style: { marginTop: 16 } },
      h('div', { style: { fontWeight: 700, margin: '4px 0 8px' } }, '未发版的标签'),
      plainTags.map((tg) => h('div', { key: tg, className: 'dgs-issue' },
        h('span', { className: 'dgs-badge' }, tg),
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'dgs-btn ghost', onClick: () => {
          setCreating(true); setEditId(null); setForm({ tag: tg, title: '', note: '', target: '' })
        } }, '+ 为此标签创建发版')))) : null)
}

// ── 探索 ───────────────────────────────────────────────────────────────────

function Explore({ t }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('repos')
  const [repos, setRepos] = useState(null)
  const [users, setUsers] = useState(null)
  const load = useCallback(() => {
    api('GET', '/dsh/explore/repos?q=' + encodeURIComponent(q)).then((d) => setRepos(Array.isArray(d) ? d : (d.data || [])))
    api('GET', '/dsh/explore/users?q=' + encodeURIComponent(q)).then((d) => setUsers(Array.isArray(d) ? d : (d.data || [])))
  }, [q])
  useEffect(() => { const tm = setTimeout(load, 300); return () => clearTimeout(tm) }, [q])
  const sideItem = (k, label) => h('span', {
    key: k, className: 'item' + (tab === k ? ' active' : ''), onClick: () => setTab(k),
    style: { display: 'block', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
      color: tab === k ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
      fontWeight: tab === k ? 600 : 400, background: tab === k ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent' },
  }, label)
  return h('div', { className: 'dgs-settings-layout' },
    h('div', { className: 'dgs-settings-nav' }, sideItem('repos', '仓库'), sideItem('users', '用户')),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { className: 'dgs-row', style: { marginBottom: 12 } },
        h('input', { className: 'dgs-input', placeholder: '搜索仓库 / 用户', value: q, onChange: (e) => setQ(e.target.value) }),
        h('button', { className: 'dgs-btn', onClick: load }, '搜索')),
      tab === 'repos' && (repos === null ? h('div', { className: 'dgs-empty' }, t('loading'))
        : repos.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
        : repos.map((r) =>
            h('div', { key: r.owner + '/' + r.name, className: 'dgs-card dgs-repo', onClick: () => nav('/r/' + r.owner + '/' + r.name), style: { cursor: 'pointer' } },
              h('div', { className: 'dgs-row' },
                h('span', { className: 'dgs-name' }, r.owner + '/' + r.name),
                h('span', { style: { flex: 1 } }),
                h('span', { className: 'dgs-sub' }, '★ ' + (r.stars || 0) + ' ⑂ ' + (r.forks || 0))),
              r.description ? h('div', { className: 'dgs-sub' }, r.description) : null,
              h('div', { className: 'dgs-sub' }, r.updated ? '最后更新于 ' + timeAgo(r.updated * 1000) : '')))),
      tab === 'users' && (users === null ? h('div', { className: 'dgs-empty' }, t('loading'))
        : users.length === 0 ? h('div', { className: 'dgs-empty' }, '—')
        : users.map((u) =>
            h('div', { key: u.name, className: 'dgs-card dgs-repo', onClick: () => nav('/u/' + u.name), style: { cursor: 'pointer' } },
              h('div', { className: 'dgs-row' },
                h('span', { className: 'dgs-name' }, u.name),
                u.full_name ? h('span', { className: 'dgs-sub', style: { marginLeft: 8 } }, u.full_name) : null),
              h('div', { className: 'dgs-sub' }, '关注者 - 关注中'))))))
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

function OrgView({ name, t }) {
  const [org, setOrg] = useState(null)
  const [form, setForm] = useState({ fullName: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const reload = useCallback(() => {
    api('GET', '/dsh/orgs/' + encodeURIComponent(name)).then((d) => {
      const o = d.data || d
      if (o && o.name) { setOrg(o); setForm({ fullName: o.fullName || '', description: o.description || '' }) }
      else setMsg((d && d.error) || t('loadFailed'))
    })
  }, [name])
  useEffect(() => { reload() }, [reload])
  if (org === null) return h('div', { className: 'dgs-empty' }, t('loading'))
  return h('div', null,
    h('div', { className: 'dgs-row', style: { marginBottom: 12 } },
      h('span', { className: 'dgs-h1' }, name),
      org.fullName ? h('span', { className: 'dgs-sub' }, org.fullName) : null),
    msg ? h('div', { className: 'dgs-err' }, msg) : null,
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
    h('div', { className: 'dgs-card' },
      h('div', { style: { fontWeight: 700, marginBottom: 8 } }, '组织设置'),
      h('div', { className: 'dgs-row' },
        h('span', { className: 'dgs-sub', style: { minWidth: 50 } }, '名称'),
        h('input', { className: 'dgs-input', value: form.fullName, onChange: (e) => setForm({ ...form, fullName: e.target.value }) })),
      h('div', { className: 'dgs-row' },
        h('span', { className: 'dgs-sub', style: { minWidth: 50 } }, '描述'),
        h('input', { className: 'dgs-input', value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }) })),
      h('div', { className: 'dgs-row', style: { marginTop: 8 } },
        h('button', { className: 'dgs-btn', disabled: busy,
          onClick: async () => {
            setBusy(true); setMsg('')
            const d = await api('PATCH', '/dsh/orgs/' + encodeURIComponent(name), form)
            setBusy(false)
            d && d.ok ? (setMsg('✓ 已保存'), reload()) : setMsg((d && d.error) || 'failed')
          } }, t('save')))))
}

// ── 用户 profile ───────────────────────────────────────────────────────────

function UserProfile({ name, t }) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    api('GET', '/dsh/users/' + encodeURIComponent(name)).then((d) => setProfile(d.data || d))
  }, [name])
  if (profile === null) return h('div', { className: 'dgs-empty' }, t('loading'))
  return h('div', { className: 'dgs-settings-layout' },
    h('div', { className: 'dgs-settings-nav', style: { width: 230 } },
      h('div', { style: { width: 64, height: 64, borderRadius: 10, background: 'var(--dsw-alias-bg-layer-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: 'var(--dsw-alias-label-secondary)', marginBottom: 10 } },
        (name || '?').slice(0, 1).toUpperCase()),
      h('div', { className: 'dgs-h1', style: { fontSize: 17 } }, name),
      profile.isAdmin ? h('span', { className: 'dgs-badge ok', style: { marginTop: 4 } }, 'admin') : null,
      h('div', { className: 'dgs-sub', style: { marginTop: 10 } }, profile.email ? '✉ ' + profile.email : ''),
      h('div', { className: 'dgs-sub', style: { marginTop: 4 } }, '🕐 加入于 ' + (profile.created ? new Date(profile.created * 1000).toLocaleDateString() : '')),
      h('div', { className: 'dgs-sub', style: { marginTop: 10 } },
        `${profile.followers.length} 关注者 - ${profile.following.length} 关注中`)),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { style: { fontWeight: 700, margin: '4px 0 10px' } }, '仓库'),
      profile.repos.length === 0 ? h('div', { className: 'dgs-empty' }, '—') : null,
      profile.repos.map((r) =>
        h('div', { key: r.name, className: 'dgs-card dgs-repo', onClick: () => nav('/r/' + r.owner + '/' + r.name), style: { cursor: 'pointer' } },
          h('div', { className: 'dgs-row' },
            h('span', { className: 'dgs-name' }, r.owner + '/' + r.name),
            h('span', { style: { flex: 1 } }),
            h('span', { className: 'dgs-sub' }, '★ ' + (r.stars || 0) + ' ⑂ ' + (r.forks || 0))),
          r.description ? h('div', { className: 'dgs-sub' }, r.description) : null,
          h('div', { className: 'dgs-sub' }, r.updated ? '最后更新于 ' + timeAgo(r.updated * 1000) : ''))),
      h('div', { style: { fontWeight: 700, margin: '14px 0 10px' } }, '动态'),
      profile.activity.length === 0 ? h('div', { className: 'dgs-empty' }, '—') : null,
      profile.activity.map((a, i) =>
        h('div', { key: i, className: 'dgs-card', style: { padding: '8px 14px' } },
          h('span', { className: 'dgs-sub' }, `${a.repo} · ${timeAgo(a.date * 1000)}`)))))
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

function GitPage({ onClose, t }) {
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
    : view === 'org' && seg[1] ? h(OrgView, { name: seg[1], t })
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
      h('span', { className: 'dgs-h1' }, t('title')),
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
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = require('react-dom/client').createRoot(el)
  gitPageHost = { el, root }
  root.render(h(GitPage, { onClose: closeGitPage, t }))
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
function timeAgo(ms) {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (sec < 60) return '刚刚'
  if (sec < 3600) return Math.floor(sec / 60) + ' 分钟之前'
  if (sec < 86400) return Math.floor(sec / 3600) + ' 小时之前'
  if (sec < 86400 * 30) return Math.floor(sec / 86400) + ' 天之前'
  if (sec < 86400 * 365) return Math.floor(sec / 86400 / 30) + ' 个月之前'
  return Math.floor(sec / 86400 / 365) + ' 年之前'
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
