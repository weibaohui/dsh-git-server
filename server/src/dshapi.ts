// dsh 原生界面的内核 JSON API（token 认证，按人权限）。
//
// 插件宿主把 /dsh-git-server/api/dsh/* 透传到这里（带用户个人令牌），
// 供 dsh 原生 UI 使用：仓库总览（README 渲染）、markdown 渲染、PR
// 列表/详情/合并、wiki 列表/读取/保存、发版列表/创建。
// 这是私有内核的内部接口——不再背负上游 gogs API 的兼容义务。
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Context } from './context.js';
import * as db from './db/db.js';
import * as git from './gitx/git.js';
import { conf } from './conf.js';
import { markdown, sanitizeHTML } from './markup.js';
import { authenticateUserByToken } from './context.js';
import * as svc from './gitx/service.js';

function requireAuth() { return { authenticateUserByToken }; }

export function registerDshRoutes(m: { get: (p: string, ...h: any[]) => void; post: (p: string, ...h: any[]) => void; patch: (p: string, ...h: any[]) => void; delete: (p: string, ...h: any[]) => void }): void {
  // ── token 认证 + 仓库解析（:o/:r） ─────────────────────────────
  const authRepo = (c: Context, needWrite = false): { repo: any; user: any } | null => {
    const header = String(c.req.headers.authorization ?? '');
    const m2 = /^token (.+)$/.exec(header);
    const token = m2 ? m2[1] : '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user) {
      c.JSON(401, { error: 'unauthorized' });
      return null;
    }
    const owner = db.getUserByUsername(c.Params(':o'));
    const repo = owner ? db.getRepoByOwnerAndName(owner, c.Params(':r')) : null;
    if (!repo) {
      c.JSON(404, { error: 'repo not found' });
      return null;
    }
    if (needWrite && db.accessMode(user.id, repo) < db.AccessMode.WRITE) {
      c.JSON(403, { error: 'forbidden' });
      return null;
    }
    return { repo, user };
  };

  // ── markdown 渲染 ─────────────────────────────────────────────
  m.post('/api/dsh/markdown', async (c: Context) => {
    const header = String(c.req.headers.authorization ?? '');
    const token = /^token (.+)$/.exec(header)?.[1] ?? '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user) { c.JSON(401, { error: 'unauthorized' }); return; }
    const body = await c.form();
    const html = markdown(String(body.text ?? ''), conf.subpath + '/', {});
    c.JSONSuccess({ html });
  });

  // ── 仓库总览：分支/标签/默认分支/README ────────────────────────
  m.get('/api/dsh/repos/:o/:r/overview', async (c: Context) => {
    const ar = authRepo(c);
    if (!ar) return;
    const { repo } = ar;
    const dir = repo.RepoPath();
    const branches = (await git.getBranches(dir)).map((b: any) => b.name);
    const tags = (await git.getTags(dir)).map((t: any) => t.name);
    const def = repo.default_branch || conf.defaultBranch;
    // README（默认分支根目录）
    let readmeHtml = '';
    try {
      const commit = await git.getCommit(dir, def);
      if (commit) {
        const tree = await git.lsTree(dir, commit.id, '');
        const entry = (tree?.entries ?? []).find((e: any) => e.type === 'blob' && /^readme(\.md|\.markdown)?$/i.test(e.name));
        if (entry) {
          const text = (await git.blobBytes(dir, entry.sha)).toString('utf8');
          readmeHtml = sanitizeHTML(markdown(text, conf.subpath + '/', repo.ComposeMetas()));
        }
      }
    } catch { /* no readme */ }
    c.JSONSuccess({ defaultBranch: def, branches, tags, readmeHtml });
  });

  // ── PR 列表（issue is_pull） ──────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/pulls', async (c: Context) => {
    const ar = authRepo(c);
    if (!ar) return;
    const rows = db.db().prepare(
      `SELECT i.id, i."index", i.name AS title, i.is_closed, i.created_unix, i.updated_unix,
              pr.head_branch, pr.base_branch, pr.has_merged, u.name AS author
       FROM issue i JOIN pull_request pr ON pr.issue_id = i.id
       LEFT JOIN user u ON u.id = i.poster_id
       WHERE i.repo_id = ? ORDER BY i."index" DESC LIMIT 50`
    ).all(ar.repo.id) as any[];
    c.JSONSuccess(rows.map((r) => ({
      index: r.index, title: r.title,
      state: r.has_merged ? 'merged' : (r.is_closed ? 'closed' : 'open'),
      head: r.head_branch, base: r.base_branch, author: r.author,
      updatedAt: r.updated_unix,
    })));
  });

  // ── PR 创建 ───────────────────────────────────────────────────
  m.post('/api/dsh/repos/:o/:r/pulls', async (c: Context) => {
    const ar = authRepo(c, true);
    if (!ar) return;
    const { repo, user } = ar;
    const body = await c.form();
    const title = String(body.title ?? '').trim();
    const head = String(body.head ?? '').trim();
    const base = String(body.base ?? '') || repo.default_branch || conf.defaultBranch;
    if (!title || !head) { c.JSON(422, { error: 'title and head required' }); return; }
    try {
      const { issueAction, ActionType } = await import('./db/actions.js');
      const index = db.maxIssueIndex(repo.id) + 1;
      const now = Math.floor(Date.now() / 1000);
      const info = db.db().prepare(
        `INSERT INTO issue (repo_id, "index", poster_id, name, content, is_closed, is_pull, num_comments, created_unix, updated_unix)
         VALUES (?,?,?,?,?,0,1,0,?,?)`
      ).run(repo.id, index, user.id, title, String(body.body ?? ''), now, now);
      const issueID = Number(info.lastInsertRowid);
      db.db().prepare('INSERT INTO issue_user (uid, issue_id, repo_id, is_poster, is_read) VALUES (?,?,?,1,1)').run(user.id, issueID, repo.id);
      const headDir = repo.RepoPath();
      const mergeBase = (await git.mergeBase(headDir, base, head)) ?? '';
      const patch = await git.git(headDir, 'diff', '--full-index', '--binary', '--end-of-options', mergeBase || base, head);
      const patchDir = path.join(conf.appDataPath, 'patches', String(repo.id));
      fs.mkdirSync(patchDir, { recursive: true });
      fs.writeFileSync(path.join(patchDir, `${index}.patch`), patch);
      const { testPullRequestMergeable } = await import('./routes/repo.js');
      const status = await testPullRequestMergeable(repo, { index, base_branch: base });
      db.db().prepare(
        `INSERT INTO pull_request (type, status, issue_id, "index", head_repo_id, base_repo_id, head_user_name, head_branch, base_branch, merge_base)
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(status, issueID, index, repo.id, repo.id, repo.OwnerName(), head, base, mergeBase);
      db.refreshIssueCounts(repo.id);
      const issue = db.getIssueByID(issueID)!;
      await issueAction(ActionType.CREATE_PULL_REQUEST, user, repo, issue);
      c.JSONSuccess({ ok: true, index });
    } catch (e: any) {
      c.JSON(500, { error: String(e?.message ?? e).slice(0, 200) });
    }
  });

  // ── 仓库信息（设置页用） ─────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    c.JSONSuccess({
      name: ar.repo.name, owner: ar.repo.OwnerName(),
      description: ar.repo.description || '', private: !!ar.repo.is_private,
      defaultBranch: ar.repo.default_branch || conf.defaultBranch,
    });
  });

  // ── 单条 issue（详情页编辑用） ───────────────────────────────
  m.get('/api/dsh/repos/:o/:r/issues/:idx', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const issue = db.getIssueByIndex(ar.repo.id, c.ParamsInt64(':idx'));
    if (!issue) { c.JSON(404, { error: 'not found' }); return; }
    const labels = db.db().prepare('SELECT l.id, l.name, l.color FROM issue_label il JOIN label l ON l.id = il.label_id WHERE il.issue_id = ?').all(issue.id);
    const ms = issue.milestone_id ? db.db().prepare('SELECT id, name FROM milestone WHERE id = ?').get(issue.milestone_id) as any : null;
    const as = issue.assignee_id ? db.db().prepare('SELECT name FROM user WHERE id = ?').get(issue.assignee_id) as any : null;
    const poster = issue.poster_id ? db.db().prepare('SELECT name FROM user WHERE id = ?').get(issue.poster_id) as any : null;
    c.JSONSuccess({
      number: Number(issue.index), title: issue.name, body: issue.content || '',
      state: issue.is_closed ? 'closed' : 'open',
      labels, milestone: ms ? { id: ms.id, title: ms.name } : null,
      assignee: as ? as.name : '', author: poster ? poster.name : '',
    });
  });

  // ── 提交详情（diff） ─────────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/commits/:sha', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const dir = ar.repo.RepoPath();
    const sha = c.Params(':sha');
    const meta = await git.getCommit(dir, sha);
    if (!meta) { c.JSON(404, { error: 'commit not found' }); return; }
    const parent = meta.parents[0] || '';
    const diff = parent
      ? await git.git(dir, 'diff', '--unified=3', '--end-of-options', parent, sha)
      : await git.git(dir, 'show', '--unified=3', '--format=', sha);
    c.JSONSuccess({
      sha, message: meta.message, author: meta.author, committer: meta.committer,
      files: (diff || '').toString(),
    });
  });

  // ── blame ─────────────────────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/blame', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const dir = ar.repo.RepoPath();
    const ref = c.Query('ref') || ar.repo.default_branch || conf.defaultBranch;
    const p = c.Query('path');
    if (!p) { c.JSON(422, { error: 'path required' }); return; }
    const out = (await git.git(dir, 'blame', '--line-porcelain', ref, '--', p))?.toString('utf8') ?? '';
    const lines: any[] = [];
    let cur: any = null;
    for (const line of out.split('\n')) {
      const bm = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
      if (bm) {
        if (cur && cur.sha) lines.push(cur);
        cur = { sha: bm[1], line: Number(bm[2]) };
      } else if (line.startsWith('author ')) { if (cur) cur.author = line.slice(7); }
      else if (line.startsWith('author-mail ')) { if (cur) cur.email = line.slice(12).replace(/[<>]/g, ''); }
      else if (line.startsWith('summary ')) { if (cur) cur.summary = line.slice(8); }
    }
    if (cur && cur.sha) lines.push(cur);
    c.JSONSuccess({ lines });
  });

  // ── compare（分支对比：commits + diff） ───────────────────────
  m.get('/api/dsh/repos/:o/:r/compare', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const dir = ar.repo.RepoPath();
    const base = c.Query('base') || ar.repo.default_branch || conf.defaultBranch;
    const head = c.Query('head') || base;
    const commits = (await git.git(dir, 'log', '--pretty=format:%H%x1f%s%x1f%an%x1f%aI', '--end-of-options', `${base}..${head}`, '--'))
      ?.toString('utf8').split('\n').filter(Boolean).map((l) => { const [sha, message, author, date] = l.split('\x1f'); return { sha, message, author, date } }) ?? [];
    const diff = (await git.git(dir, 'diff', '--stat', '--end-of-options', `${base}...${head}`))?.toString('utf8') ?? '';
    c.JSONSuccess({ base, head, commits, diffStat: diff });
  });

  // ── 标签管理 CRUD ─────────────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/labels', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    c.JSONSuccess(db.listLabels(ar.repo.id).map((l: any) => ({ id: l.id, name: l.name, color: l.color })));
  });
  m.post('/api/dsh/repos/:o/:r/labels', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    const body = await c.form();
    const name = String(body.name ?? '').trim();
    if (!name) { c.JSON(422, { error: 'name required' }); return; }
    const info = db.db().prepare('INSERT INTO label (repo_id, name, color, num_issues, num_closed_issues) VALUES (?,?,?,?,0)').run(ar.repo.id, name, String(body.color ?? '#70c24a'), 0);
    c.JSONSuccess({ id: Number(info.lastInsertRowid), name });
  });
  m.patch('/api/dsh/repos/:o/:r/labels/:id', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    const body = await c.form();
    const id = c.ParamsInt64(':id');
    const label = db.getLabelByID(ar.repo.id, id);
    if (!label) { c.JSON(404, { error: 'not found' }); return; }
    const sets: string[] = []; const args: any[] = [];
    if (body.name !== undefined) { sets.push('name = ?'); args.push(String(body.name)); }
    if (body.color !== undefined) { sets.push('color = ?'); args.push(String(body.color)); }
    if (sets.length) db.db().prepare(`UPDATE label SET ${sets.join(', ')} WHERE id = ? AND repo_id = ?`).run(...args, id, ar.repo.id);
    c.JSONSuccess({ ok: true });
  });
  m.delete('/api/dsh/repos/:o/:r/labels/:id', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    db.db().prepare('DELETE FROM label WHERE id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
    c.JSONSuccess({ ok: true });
  });

  // ── 里程碑 CRUD ───────────────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/milestones', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const rows = db.listMilestones(ar.repo.id, null).map((m: any) => ({
      id: m.id, title: m.name, description: m.content,
      due: m.deadline_unix, closed: !!m.is_closed,
      open: m.num_issues - m.num_closed_issues, closedIssues: m.num_closed_issues,
    }));
    c.JSONSuccess(rows);
  });
  m.post('/api/dsh/repos/:o/:r/milestones', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    const body = await c.form();
    const title = String(body.title ?? '').trim();
    if (!title) { c.JSON(422, { error: 'title required' }); return; }
    let deadline = 0;
    if (body.due) { const t = Date.parse(String(body.due)); if (!Number.isNaN(t)) deadline = Math.floor(t / 1000); }
    const info = db.db().prepare('INSERT INTO milestone (repo_id, name, content, is_closed, num_issues, num_closed_issues, completeness, deadline_unix) VALUES (?,?,?,?,0,0,0,?)')
      .run(ar.repo.id, title, String(body.description ?? ''), 0, deadline);
    c.JSONSuccess({ id: Number(info.lastInsertRowid), title });
  });
  m.patch('/api/dsh/repos/:o/:r/milestones/:id', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    const id = c.ParamsInt64(':id');
    const body = await c.form();
    const sets: string[] = []; const args: any[] = [];
    if (body.title !== undefined) { sets.push('name = ?'); args.push(String(body.title)); }
    if (body.description !== undefined) { sets.push('content = ?'); args.push(String(body.description)); }
    if (body.closed !== undefined) { sets.push('is_closed = ?'); args.push(body.closed ? 1 : 0); }
    if (sets.length) db.db().prepare(`UPDATE milestone SET ${sets.join(', ')} WHERE id = ? AND repo_id = ?`).run(...args, id, ar.repo.id);
    c.JSONSuccess({ ok: true });
  });
  m.delete('/api/dsh/repos/:o/:r/milestones/:id', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    db.db().prepare('DELETE FROM milestone WHERE id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
    c.JSONSuccess({ ok: true });
  });

  // ── issue 增强：编辑/标签/里程碑/负责人 ────────────────────────
  m.patch('/api/dsh/repos/:o/:r/issues/:idx', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const issue = db.getIssueByIndex(ar.repo.id, c.ParamsInt64(':idx'));
    if (!issue) { c.JSON(404, { error: 'not found' }); return; }
    const body = await c.form();
    const sets: string[] = []; const args: any[] = [];
    if (body.title !== undefined) { sets.push('name = ?'); args.push(String(body.title)); }
    if (body.body !== undefined) { sets.push('content = ?'); args.push(String(body.body)); }
    if (body.milestone !== undefined) { sets.push('milestone_id = ?'); args.push(Number(body.milestone) || 0); }
    if (body.assignee !== undefined) {
      const au = body.assignee ? db.getUserByUsername(String(body.assignee)) : null;
      sets.push('assignee_id = ?'); args.push(au ? au.id : 0);
    }
    if (sets.length) {
      sets.push('updated_unix = ?'); args.push(Math.floor(Date.now() / 1000), issue.id);
      db.db().prepare(`UPDATE issue SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    }
    if (body.labels !== undefined && Array.isArray(body.labels)) {
      db.db().prepare('DELETE FROM issue_label WHERE issue_id = ?').run(issue.id);
      for (const lid of body.labels) {
        db.db().prepare('INSERT INTO issue_label (issue_id, label_id) VALUES (?,?)').run(issue.id, Number(lid));
      }
    }
    db.refreshIssueCounts(ar.repo.id);
    c.JSONSuccess({ ok: true });
  });

  // ── 协作者 ────────────────────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/collaborators', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    const rows = db.db().prepare(
      'SELECT u.name, u.full_name, col.mode FROM collaboration col JOIN user u ON u.id = col.user_id WHERE col.repo_id = ?'
    ).all(ar.repo.id) as any[];
    c.JSONSuccess(rows);
  });
  m.post('/api/dsh/repos/:o/:r/collaborators/:name', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    const u = db.getUserByUsername(c.Params(':name'));
    if (!u) { c.JSON(404, { error: 'user not found' }); return; }
    const exists = db.db().prepare('SELECT 1 FROM collaboration WHERE user_id = ? AND repo_id = ?').get(u.id, ar.repo.id);
    if (!exists) db.db().prepare('INSERT INTO collaboration (user_id, repo_id, mode) VALUES (?,?,2)').run(u.id, ar.repo.id);
    c.JSONSuccess({ ok: true });
  });
  m.delete('/api/dsh/repos/:o/:r/collaborators/:name', async (c: Context) => {
    const ar = authRepo(c, true); if (!ar) return;
    const u = db.getUserByUsername(c.Params(':name'));
    if (u) db.db().prepare('DELETE FROM collaboration WHERE user_id = ? AND repo_id = ?').run(u.id, ar.repo.id);
    c.JSONSuccess({ ok: true });
  });

  // ── 仓库设置：改名/描述/私有 + 删除 ────────────────────────────
  m.patch('/api/dsh/repos/:o/:r', async (c: Context) => {
    const ar = authRepo(c); if (!ar) return;
    if (ar.repo.OwnerName() !== ar.user.name && ar.user.is_admin !== 1) { c.JSON(403, { error: 'forbidden' }); return; }
    const body = await c.form();
    const sets: string[] = []; const args: any[] = [];
    if (body.description !== undefined) { sets.push('description = ?'); args.push(String(body.description)); }
    if (body.private !== undefined) { sets.push('is_private = ?'); args.push(body.private ? 1 : 0); }
    if (sets.length) db.db().prepare(`UPDATE repository SET ${sets.join(', ')} WHERE id = ?`).run(...args, ar.repo.id);
    c.JSONSuccess({ ok: true });
  });

  // ── 用户 profile（资料+仓库+活动） ─────────────────────────────
  m.get('/api/dsh/users/:name', async (c: Context) => {
    const u = db.getUserByUsername(c.Params(':name'));
    if (!u) { c.JSON(404, { error: 'user not found' }); return; }
    const repos = db.listReposByOwner(u.id).filter((r: any) => !r.is_private || c.IsLogged).map((r: any) => ({
      name: r.name, owner: r.OwnerName(), description: r.description, stars: r.num_stars,
      updated: r.updated_unix,
    }));
    const activity = db.db().prepare(
      'SELECT a.op_type, a.ref_name, a.content, a.created_unix, r.lower_name AS repo, ow.name AS owner FROM action a JOIN repository r ON r.id = a.repo_id JOIN user ow ON ow.id = r.owner_id WHERE a.act_user_id = ? ORDER BY a.id DESC LIMIT 20'
    ).all(u.id);
    const followers = db.db().prepare('SELECT u.name FROM follow f JOIN user u ON u.id = f.user_id WHERE f.follow_id = ?').all(u.id).map((x: any) => x.name);
    const following = db.db().prepare('SELECT u.name FROM follow f JOIN user u ON u.id = f.follow_id WHERE f.user_id = ?').all(u.id).map((x: any) => x.name);
    c.JSONSuccess({
      name: u.name, fullName: u.full_name || '', email: u.email, isAdmin: u.is_admin === 1,
      followers, following, repos, activity: activity.map((a: any) => ({
        type: a.op_type, repo: a.owner + '/' + a.repo, ref: a.ref_name, content: a.content, date: a.created_unix,
      })),
    });
  });

  // ── 组织：我的组织列表 / 组织详情 / 创建 ────────────────────────
  m.get('/api/dsh/orgs', async (c: Context) => {
    const header = String(c.req.headers.authorization ?? '');
    const token = /^token (.+)$/.exec(header)?.[1] ?? '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user) { c.JSON(401, { error: 'unauthorized' }); return; }
    const rows = db.db().prepare(
      'SELECT u.id, u.name, u.full_name FROM user u JOIN org_user ou ON ou.org_id = u.id WHERE u.type = 1 AND ou.uid = ?'
    ).all(user.id) as any[];
    c.JSONSuccess(rows.map((r) => ({ id: r.id, name: r.name, fullName: r.full_name })));
  });
  m.get('/api/dsh/orgs/:name', async (c: Context) => {
    const o = db.getUserByUsername(c.Params(':name'));
    if (!o || o.type !== 1) { c.JSON(404, { error: 'org not found' }); return; }
    const members = db.db().prepare(
      'SELECT u.name, u.full_name, ou.is_owner FROM org_user ou JOIN user u ON u.id = ou.uid WHERE ou.org_id = ?'
    ).all(o.id) as any[];
    const repos = db.db().prepare('SELECT name, lower_name, description FROM repository WHERE owner_id = ?').all(o.id) as any[];
    c.JSONSuccess({ name: o.name, fullName: o.full_name, description: o.description,
      members: members.map((m: any) => ({ name: m.name, owner: !!m.is_owner })),
      repos: repos.map((r: any) => ({ name: r.name, owner: o.name })) });
  });
  m.post('/api/dsh/orgs', async (c: Context) => {
    const header = String(c.req.headers.authorization ?? '');
    const token = /^token (.+)$/.exec(header)?.[1] ?? '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user) { c.JSON(401, { error: 'unauthorized' }); return; }
    const body = await c.form();
    const name = String(body.name ?? '').trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) { c.JSON(422, { error: 'bad org name' }); return; }
    try {
      db.createOrganization(user, name, { fullName: String(body.fullName ?? ''), description: String(body.description ?? '') });
      c.JSONSuccess({ ok: true });
    } catch (e: any) { c.JSON(422, { error: String(e?.message ?? e).slice(0, 120) }); }
  });

  // ── 探索：仓库/用户搜索 ───────────────────────────────────────
  m.get('/api/dsh/explore/repos', async (c: Context) => {
    const q = '%' + c.Query('q').toLowerCase() + '%';
    const rows = db.db().prepare(
      'SELECT r.name, r.lower_name, r.description, r.is_private, r.num_stars, u.name AS owner FROM repository r JOIN user u ON u.id = r.owner_id WHERE (r.lower_name LIKE ? OR lower(r.description) LIKE ?) AND r.is_private = 0 ORDER BY r.num_stars DESC LIMIT 50'
    ).all(q, q) as any[];
    c.JSONSuccess(rows.map((r) => ({ name: r.name, owner: r.owner, description: r.description, stars: r.num_stars })));
  });
  m.get('/api/dsh/explore/users', async (c: Context) => {
    const q = '%' + c.Query('q').toLowerCase() + '%';
    const rows = db.db().prepare(
      "SELECT name, full_name FROM user WHERE (type = 0 OR type = 1) AND (lower_name LIKE ? OR lower(full_name) LIKE ?) LIMIT 50"
    ).all(q, q) as any[];
    c.JSONSuccess(rows);
  });

  // ── 管理面：统计 + 用户/仓库列表（admin token） ────────────────
  m.get('/api/dsh/admin/summary', async (c: Context) => {
    const header = String(c.req.headers.authorization ?? '');
    const token = /^token (.+)$/.exec(header)?.[1] ?? '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user || user.is_admin !== 1) { c.JSON(403, { error: 'forbidden' }); return; }
    const q = (t: string) => (db.db().prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as any).c;
    c.JSONSuccess({
      users: q('user'), orgs: (db.db().prepare('SELECT COUNT(*) AS c FROM user WHERE type = 1').get() as any).c,
      repos: q('repository'), issues: q('issue'), pulls: (db.db().prepare('SELECT COUNT(*) AS c FROM issue WHERE is_pull = 1').get() as any).c,
    });
  });
  m.get('/api/dsh/admin/users', async (c: Context) => {
    const header = String(c.req.headers.authorization ?? '');
    const token = /^token (.+)$/.exec(header)?.[1] ?? '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user || user.is_admin !== 1) { c.JSON(403, { error: 'forbidden' }); return; }
    const rows = db.db().prepare('SELECT name, full_name, email, is_admin, created_unix FROM user ORDER BY id').all() as any[];
    c.JSONSuccess(rows.map((r: any) => ({ name: r.name, fullName: r.full_name, email: r.email, isAdmin: r.is_admin === 1, created: r.created_unix })));
  });
  m.get('/api/dsh/admin/repos', async (c: Context) => {
    const header = String(c.req.headers.authorization ?? '');
    const token = /^token (.+)$/.exec(header)?.[1] ?? '';
    const user = token ? authenticateUserByToken(token) : null;
    if (!user || user.is_admin !== 1) { c.JSON(403, { error: 'forbidden' }); return; }
    const rows = db.db().prepare(
      'SELECT r.name, r.lower_name, r.is_private, r.num_stars, u.name AS owner FROM repository r JOIN user u ON u.id = r.owner_id ORDER BY r.id'
    ).all() as any[];
    c.JSONSuccess(rows.map((r: any) => ({ name: r.owner + '/' + r.name, owner: r.owner, private: !!r.is_private, stars: r.num_stars })));
  });

  // ── PR 合并 ───────────────────────────────────────────────────
  m.post('/api/dsh/repos/:o/:r/pulls/:index/merge', async (c: Context) => {
    const ar = authRepo(c, true);
    if (!ar) return;
    const { repo, user } = ar;
    const index = c.ParamsInt64(':index');
    const issue = db.getIssueByIndex(repo.id, index);
    const pr = issue ? (db.db().prepare('SELECT * FROM pull_request WHERE issue_id = ?').get(issue.id) as any) : null;
    if (!issue || !pr || pr.has_merged || issue.is_closed) {
      c.JSON(404, { error: 'pull not found or already closed' });
      return;
    }
    const baseDir = repo.RepoPath();
    const headRepo = db.getRepoByID(pr.head_repo_id) ?? repo;
    const tmpDir = path.join(conf.appDataPath, 'tmp', 'merge-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await git.git(process.cwd(), 'clone', '-b', pr.base_branch, baseDir, tmpDir);
      await git.git(tmpDir, 'remote', 'add', 'head_repo', headRepo.RepoPath());
      await git.git(tmpDir, 'fetch', 'head_repo');
      await git.git(tmpDir, 'merge', '--no-ff', '--no-commit', '--end-of-options', `head_repo/${pr.head_branch}`);
      const msg = `Merge branch '${pr.head_branch}' of ${pr.head_user_name}/${headRepo.name} into ${pr.base_branch}`;
      await git.git(tmpDir, 'commit', `--author=${user.name} <${user.email}>`, '-m', msg);
      await git.git(tmpDir, 'push', 'origin', `HEAD:refs/heads/${pr.base_branch}`);
      const now = Math.floor(Date.now() / 1000);
      db.db().prepare('UPDATE pull_request SET has_merged = 1, merger_id = ?, merged_unix = ? WHERE id = ?').run(user.id, now, pr.id);
      db.updateIssueColumns(issue.id, { is_closed: 1 });
      db.refreshIssueCounts(repo.id);
      const { issueAction, ActionType } = await import('./db/actions.js');
      await issueAction(ActionType.MERGE_PULL_REQUEST, user, repo, issue);
      c.JSONSuccess({ ok: true });
    } catch (e: any) {
      console.error('[dsh merge]', e);
      c.JSON(500, { error: 'merge failed: ' + String(e?.message ?? e).slice(0, 200) });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── wiki：列表 / 读取 / 保存 ──────────────────────────────────
  const wikiDirOf = (repo: any) => repo.WikiPath();

  m.get('/api/dsh/repos/:o/:r/wiki', async (c: Context) => {
    const ar = authRepo(c);
    if (!ar) return;
    const dir = wikiDirOf(ar.repo);
    if (!fs.existsSync(dir)) { c.JSONSuccess({ pages: [], initialized: false }); return; }
    const svc = await import('./gitx/service.js');
    const branch = svc.wikiBranch(dir);
    const ref = 'refs/heads/' + branch;
    if (!(await git.refExists(dir, ref))) { c.JSONSuccess({ pages: [], initialized: true }); return; }
    const commit = await git.getCommit(dir, ref);
    if (!commit) { c.JSONSuccess({ pages: [], initialized: true }); return; }
    const tree = await git.lsTree(dir, commit.id, '');
    const pages: any[] = [];
    for (const e of tree?.entries ?? []) {
      if (e.type !== 'blob' || !e.name.endsWith('.md')) continue;
      const last = await git.commitByPath(dir, ref, e.name);
      pages.push({ name: e.name.slice(0, -3), updatedAt: last?.committer?.when ?? null, author: last?.committer?.name ?? '' });
    }
    c.JSONSuccess({ pages, initialized: true });
  });

  m.get('/api/dsh/repos/:o/:r/wiki/:page', async (c: Context) => {
    const ar = authRepo(c);
    if (!ar) return;
    const svc = await import('./gitx/service.js');
    const dir = wikiDirOf(ar.repo);
    const name = svc.toWikiPageName(decodeURIComponent(c.Params(':page')));
    const branch = svc.wikiBranch(dir);
    const ref = 'refs/heads/' + branch;
    let content = '';
    try {
      const commit = await git.getCommit(dir, ref);
      if (commit) {
        const tree = await git.lsTree(dir, commit.id, name + '.md');
        const entry = tree?.entries[0];
        if (entry) content = (await git.blobBytes(dir, entry.sha)).toString('utf8');
      }
    } catch { /* empty */ }
    if (!content) { c.JSON(404, { error: 'page not found' }); return; }
    const html = sanitizeHTML(markdown(content, conf.subpath + '/', ar.repo.ComposeMetas()));
    c.JSONSuccess({ name, content, html });
  });

  m.post('/api/dsh/repos/:o/:r/wiki/:page', async (c: Context) => {
    const ar = authRepo(c, true);
    if (!ar) return;
    const svc = await import('./gitx/service.js');
    const name = svc.toWikiPageName(decodeURIComponent(c.Params(':page')));
    const body = await c.form();
    // 复用 routes/repo.ts 的写页实现（clone→写文件→commit→push→delegate hook）
    try {
      const __repo = await import('./routes/repo.js');
      await __repo.writeWikiPage(ar.repo, name, String(body.content ?? ''), ar.user, null);
      c.JSONSuccess({ ok: true });
    } catch (e: any) {
      c.JSON(500, { error: String(e?.message ?? e).slice(0, 200) });
    }
  });

  // ── 发版：列表 / 创建 ────────────────────────────────────────
  m.get('/api/dsh/repos/:o/:r/releases', async (c: Context) => {
    const ar = authRepo(c);
    if (!ar) return;
    const rows = db.db().prepare(
      'SELECT r.id, r.tag_name, r.title, r.note, r.created_unix, u.name AS author FROM `release` r LEFT JOIN user u ON u.id = r.publisher_id WHERE r.repo_id = ? ORDER BY r.created_unix DESC'
    ).all(ar.repo.id) as any[];
    c.JSONSuccess(rows.map((r) => ({
      id: r.id, tag: r.tag_name, title: r.title,
      noteHtml: r.note ? sanitizeHTML(markdown(r.note, conf.subpath + '/', {})) : '',
      author: r.author, createdAt: r.created_unix,
    })));
  });

  m.post('/api/dsh/repos/:o/:r/releases', async (c: Context) => {
    const ar = authRepo(c, true);
    if (!ar) return;
    const { repo, user } = ar;
    const body = await c.form();
    const tag = String(body.tag ?? '').trim();
    const title = String(body.title ?? '').trim() || tag;
    const note = String(body.note ?? '');
    const target = String(body.target ?? '') || repo.default_branch || conf.defaultBranch;
    if (!tag) { c.JSON(422, { error: 'tag required' }); return; }
    if (db.db().prepare('SELECT 1 FROM `release` WHERE repo_id = ? AND lower_tag_name = ?').get(repo.id, tag.toLowerCase())) {
      c.JSON(422, { error: 'tag already released' });
      return;
    }
    const repoDir = repo.RepoPath();
    try {
      const sha = (await git.gitOK(repoDir, 'rev-parse', '--verify', '--end-of-options', target))?.toString().trim() ?? '';
      if (!sha) { c.JSON(422, { error: 'target not found' }); return; }
      await git.gitOK(repoDir, 'tag', tag, sha);
      const numCommits = await git.commitsCount(repoDir, sha);
      const now = Math.floor(Date.now() / 1000);
      db.db().prepare(
        'INSERT INTO `release` (repo_id, publisher_id, tag_name, lower_tag_name, title, note, is_draft, is_prerelease, created_unix) VALUES (?,?,?,?,?,?,0,0,?)'
      ).run(repo.id, user.id, tag, tag.toLowerCase(), title, note, now);
      void numCommits; // 统计口径与内核同步，无需回写（列名随 schema 变动）
      c.JSONSuccess({ ok: true });
    } catch (e: any) {
      c.JSON(500, { error: String(e?.message ?? e).slice(0, 200) });
    }
  });
}
