// dsh 原生界面的内核 JSON API（token 认证，按人权限）。
//
// 插件宿主把 /dsh-git-server/api/dsh/* 透传到这里（带用户个人令牌），
// 供 dsh 原生 UI 使用：仓库总览（README 渲染）、markdown 渲染、PR
// 列表/详情/合并、wiki 列表/读取/保存、发版列表/创建。
// 这是私有内核的内部接口——不再背负上游 gogs API 的兼容义务。
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as db from './db/db.js';
import * as git from './gitx/git.js';
import { conf } from './conf.js';
import { markdown, sanitizeHTML } from './markup.js';
import { authenticateUserByToken } from './context.js';
import * as svc from './gitx/service.js';
function requireAuth() { return { authenticateUserByToken }; }
export function registerDshRoutes(m) {
    // ── token 认证 + 仓库解析（:o/:r） ─────────────────────────────
    const authRepo = (c, needWrite = false) => {
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
    m.post('/api/dsh/markdown', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user) {
            c.JSON(401, { error: 'unauthorized' });
            return;
        }
        const body = await c.form();
        const html = markdown(String(body.text ?? ''), conf.subpath + '/', {});
        c.JSONSuccess({ html });
    });
    // ── 仓库总览：分支/标签/默认分支/README ────────────────────────
    m.get('/api/dsh/repos/:o/:r/overview', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const { repo } = ar;
        const dir = repo.RepoPath();
        const branches = (await git.getBranches(dir)).map((b) => b.name);
        const tags = (await git.getTags(dir)).map((t) => t.name);
        const def = repo.default_branch || conf.defaultBranch;
        // README（默认分支根目录）
        let readmeHtml = '';
        try {
            const commit = await git.getCommit(dir, def);
            if (commit) {
                const tree = await git.lsTree(dir, commit.id, '');
                const entry = (tree?.entries ?? []).find((e) => e.type === 'blob' && /^readme(\.md|\.markdown)?$/i.test(e.name));
                if (entry) {
                    const text = (await git.blobBytes(dir, entry.sha)).toString('utf8');
                    readmeHtml = sanitizeHTML(markdown(text, conf.subpath + '/', repo.ComposeMetas()));
                }
            }
        }
        catch { /* no readme */ }
        const numCommits = Number((await git.git(dir, 'rev-list', '--count', '--end-of-options', def))?.toString('utf8').trim() || 0);
        const numReleases = db.db().prepare('SELECT COUNT(*) AS c FROM release WHERE repo_id = ?').get(repo.id).c;
        c.JSONSuccess({
            defaultBranch: def, branches, tags, readmeHtml,
            name: repo.name, owner: repo.OwnerName(), description: repo.description || '',
            private: !!repo.is_private, numCommits, numBranches: branches.length, numTags: tags.length, numReleases,
            numStars: repo.num_stars || 0, numForks: repo.num_forks || 0, numWatches: repo.num_watches || 0,
        });
    });
    // ── git 标签列表（名称/指向/日期/说明） ──────────────────────
    m.get('/api/dsh/repos/:o/:r/tags', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = ar.repo.RepoPath();
        const out = (await git.git(dir, 'for-each-ref', '--sort=-creatordate', '--format=%(refname:short)%01%(objectname:short)%01%(creatordate:unix)%01%(contents:subject)', 'refs/tags/'))?.toString('utf8') ?? '';
        const rows = out.split('\n').filter(Boolean).map((l) => {
            const [name, sha, date, msg] = l.split('\x01');
            return { name, sha: sha || '', date: Number(date) * 1000 || 0, msg: msg || '' };
        });
        c.JSONSuccess(rows);
    });
    // ── 文件列表（带每项最近提交） ────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/tree', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = ar.repo.RepoPath();
        const ref = c.Query('ref') || ar.repo.default_branch || conf.defaultBranch;
        const p = c.Query('path');
        const tree = await git.lsTree(dir, ref, p || '');
        if (!tree) {
            c.JSON(404, { error: 'not found' });
            return;
        }
        const entries = [];
        for (const e of tree.entries) {
            const epath = p ? p + '/' + e.name : e.name;
            let size = 0;
            if (e.type === 'blob')
                size = Number((await git.git(dir, 'cat-file', '-s', e.sha))?.toString('utf8').trim() || 0);
            const out = (await git.git(dir, 'log', '-1', '--pretty=format:%h%x1f%s%x1f%ct', '--end-of-options', ref, '--', epath))?.toString('utf8') ?? '';
            const [lsha, lmsg, ldate] = out.split('\x1f');
            entries.push({
                name: e.name, type: e.type, path: epath, size,
                last: lsha ? { sha: lsha, msg: (lmsg || '').slice(0, 90), date: Number(ldate) * 1000 } : null,
            });
        }
        c.JSONSuccess({ entries });
    });
    // ── PR 列表（issue is_pull） ──────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/pulls', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.db().prepare(`SELECT i.id, i."index", i.name AS title, i.is_closed, i.created_unix, i.updated_unix,
              pr.head_branch, pr.base_branch, pr.has_merged, u.name AS author
       FROM issue i JOIN pull_request pr ON pr.issue_id = i.id
       LEFT JOIN user u ON u.id = i.poster_id
       WHERE i.repo_id = ? ORDER BY i."index" DESC LIMIT 50`).all(ar.repo.id);
        c.JSONSuccess(rows.map((r) => ({
            index: r.index, title: r.title,
            state: r.has_merged ? 'merged' : (r.is_closed ? 'closed' : 'open'),
            head: r.head_branch, base: r.base_branch, author: r.author,
            updatedAt: r.updated_unix,
        })));
    });
    // ── PR 创建 ───────────────────────────────────────────────────
    m.post('/api/dsh/repos/:o/:r/pulls', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const { repo, user } = ar;
        const body = await c.form();
        const title = String(body.title ?? '').trim();
        const head = String(body.head ?? '').trim();
        const base = String(body.base ?? '') || repo.default_branch || conf.defaultBranch;
        if (!title || !head) {
            c.JSON(422, { error: 'title and head required' });
            return;
        }
        try {
            const { issueAction, ActionType } = await import('./db/actions.js');
            const index = db.maxIssueIndex(repo.id) + 1;
            const now = Math.floor(Date.now() / 1000);
            const info = db.db().prepare(`INSERT INTO issue (repo_id, "index", poster_id, name, content, is_closed, is_pull, num_comments, created_unix, updated_unix)
         VALUES (?,?,?,?,?,0,1,0,?,?)`).run(repo.id, index, user.id, title, String(body.body ?? ''), now, now);
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
            db.db().prepare(`INSERT INTO pull_request (type, status, issue_id, "index", head_repo_id, base_repo_id, head_user_name, head_branch, base_branch, merge_base)
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(status, issueID, index, repo.id, repo.id, repo.OwnerName(), head, base, mergeBase);
            db.refreshIssueCounts(repo.id);
            const issue = db.getIssueByID(issueID);
            await issueAction(ActionType.CREATE_PULL_REQUEST, user, repo, issue);
            c.JSONSuccess({ ok: true, index });
        }
        catch (e) {
            c.JSON(500, { error: String(e?.message ?? e).slice(0, 200) });
        }
    });
    // ── 仓库信息（设置页用） ─────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        c.JSONSuccess({
            name: ar.repo.name, owner: ar.repo.OwnerName(),
            description: ar.repo.description || '', private: !!ar.repo.is_private,
            defaultBranch: ar.repo.default_branch || conf.defaultBranch,
        });
    });
    // ── 单条 issue（详情页编辑用） ───────────────────────────────
    m.get('/api/dsh/repos/:o/:r/issues/:idx', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const issue = db.getIssueByIndex(ar.repo.id, c.ParamsInt64(':idx'));
        if (!issue) {
            c.JSON(404, { error: 'not found' });
            return;
        }
        const labels = db.db().prepare('SELECT l.id, l.name, l.color FROM issue_label il JOIN label l ON l.id = il.label_id WHERE il.issue_id = ?').all(issue.id);
        const ms = issue.milestone_id ? db.db().prepare('SELECT id, name FROM milestone WHERE id = ?').get(issue.milestone_id) : null;
        const as = issue.assignee_id ? db.db().prepare('SELECT name FROM user WHERE id = ?').get(issue.assignee_id) : null;
        const poster = issue.poster_id ? db.db().prepare('SELECT name FROM user WHERE id = ?').get(issue.poster_id) : null;
        const participants = db.db().prepare('SELECT COUNT(DISTINCT poster_id) AS c FROM comment WHERE issue_id = ? UNION ALL SELECT poster_id AS c FROM issue WHERE id = ?').all(issue.id, issue.id).length;
        c.JSONSuccess({
            number: Number(issue.index), title: issue.name, body: issue.content || '',
            state: issue.is_closed ? 'closed' : 'open',
            labels, milestone: ms ? { id: ms.id, title: ms.name } : null,
            assignee: as ? as.name : '', author: poster ? poster.name : '',
            createdAt: Number(issue.created_unix) * 1000 || 0, participants,
        });
    });
    // ── issue 列表（富字段 + 标签/里程碑/负责人过滤） ─────────────
    m.get('/api/dsh/repos/:o/:r/issues', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const state = c.Query('state') || 'open';
        const labelF = c.QueryInt('label');
        const msF = c.QueryInt('milestone');
        const asg = c.Query('assignee');
        const where = ['i.repo_id = ?', 'i.is_pull = 0'];
        const args = [ar.repo.id];
        if (state === 'open' || state === 'closed') {
            where.push('i.is_closed = ?');
            args.push(state === 'closed' ? 1 : 0);
        }
        if (msF) {
            where.push('i.milestone_id = ?');
            args.push(msF);
        }
        if (asg) {
            const au = db.getUserByUsername(asg);
            where.push('i.assignee_id = ?');
            args.push(au ? au.id : -1);
        }
        if (labelF) {
            where.push('i.id IN (SELECT issue_id FROM issue_label WHERE label_id = ?)');
            args.push(labelF);
        }
        const search = c.Query('search').trim().toLowerCase();
        if (search) {
            where.push('(lower(i.name) LIKE ? OR lower(i.content) LIKE ?)');
            args.push('%' + search + '%', '%' + search + '%');
        }
        const sortKey = { latest: 'i.created_unix DESC', oldest: 'i.created_unix ASC', recentupdate: 'i.updated_unix DESC', leastupdate: 'i.updated_unix ASC', mostcomment: 'i.num_comments DESC', leastcomment: 'i.num_comments ASC' }[c.Query('sort') || 'latest'] || 'i.updated_unix DESC';
        const rows = db.db().prepare(`SELECT i.id, i."index" AS number, i.name AS title, i.is_closed, i.num_comments AS comments, i.updated_unix AS updated,
              u.name AS user, ms.id AS msId, ms.name AS msTitle, au.name AS assignee
       FROM issue i LEFT JOIN user u ON u.id = i.poster_id
       LEFT JOIN milestone ms ON ms.id = i.milestone_id
       LEFT JOIN user au ON au.id = i.assignee_id
       WHERE ${where.join(' AND ')} ORDER BY ${sortKey} LIMIT 200`).all(...args);
        const labelMap = {};
        if (rows.length) {
            const marks = rows.map(() => '?').join(',');
            const ls = db.db().prepare(`SELECT il.issue_id, l.id, l.name, l.color FROM issue_label il JOIN label l ON l.id = il.label_id WHERE il.issue_id IN (${marks})`).all(...rows.map((r) => r.id));
            for (const x of ls)
                (labelMap[x.issue_id] = labelMap[x.issue_id] || []).push({ id: x.id, name: x.name, color: x.color });
        }
        c.JSONSuccess(rows.map((r) => ({
            number: r.number, title: r.title, state: r.is_closed ? 'closed' : 'open',
            user: r.user, comments: r.comments, updatedAt: r.updated * 1000,
            labels: labelMap[r.id] || [],
            milestone: r.msId ? { id: r.msId, title: r.msTitle } : null,
            assignee: r.assignee || '',
        })));
    });
    // ── 提交详情（diff） ─────────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/commits/:sha', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = ar.repo.RepoPath();
        const sha = c.Params(':sha');
        const meta = await git.getCommit(dir, sha);
        if (!meta) {
            c.JSON(404, { error: 'commit not found' });
            return;
        }
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
    m.get('/api/dsh/repos/:o/:r/blame', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = ar.repo.RepoPath();
        const ref = c.Query('ref') || ar.repo.default_branch || conf.defaultBranch;
        const p = c.Query('path');
        if (!p) {
            c.JSON(422, { error: 'path required' });
            return;
        }
        const out = (await git.git(dir, 'blame', '--line-porcelain', ref, '--', p))?.toString('utf8') ?? '';
        const lines = [];
        let cur = null;
        for (const line of out.split('\n')) {
            const bm = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
            if (bm) {
                if (cur && cur.sha)
                    lines.push(cur);
                cur = { sha: bm[1], line: Number(bm[2]) };
            }
            else if (line.startsWith('author ')) {
                if (cur)
                    cur.author = line.slice(7);
            }
            else if (line.startsWith('author-mail ')) {
                if (cur)
                    cur.email = line.slice(12).replace(/[<>]/g, '');
            }
            else if (line.startsWith('summary ')) {
                if (cur)
                    cur.summary = line.slice(8);
            }
        }
        if (cur && cur.sha)
            lines.push(cur);
        c.JSONSuccess({ lines });
    });
    // ── compare（分支对比：commits + diff） ───────────────────────
    m.get('/api/dsh/repos/:o/:r/compare', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = ar.repo.RepoPath();
        const base = c.Query('base') || ar.repo.default_branch || conf.defaultBranch;
        const head = c.Query('head') || base;
        const commits = (await git.git(dir, 'log', '--pretty=format:%H%x1f%s%x1f%an%x1f%aI', '--end-of-options', `${base}..${head}`, '--'))
            ?.toString('utf8').split('\n').filter(Boolean).map((l) => { const [sha, message, author, date] = l.split('\x1f'); return { sha, message, author, date }; }) ?? [];
        const diff = (await git.git(dir, 'diff', '--stat', '--end-of-options', `${base}...${head}`))?.toString('utf8') ?? '';
        c.JSONSuccess({ base, head, commits, diffStat: diff });
    });
    // ── 源码下载（archive zip/tar.gz，二进制流） ──────────────────
    m.get('/api/dsh/repos/:o/:r/archive/*', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const wild = c.Params(':*');
        const ext = wild.endsWith('.zip') ? 'zip' : wild.endsWith('.tar.gz') ? 'tar.gz' : null;
        if (!ext) {
            c.JSON(404, { error: 'bad format' });
            return;
        }
        const ref = wild.slice(0, wild.length - (ext === 'zip' ? 4 : 7));
        const dir = ar.repo.RepoPath();
        const sha = (await git.gitOK(dir, 'rev-parse', '--verify', '--end-of-options', ref))?.toString().trim();
        if (!sha) {
            c.JSON(404, { error: 'ref not found' });
            return;
        }
        const dst = path.join(os.tmpdir(), `dgs-archive-${Date.now()}.${ext}`);
        try {
            await git.archive(dir, sha, ext, dst, ar.repo.name + '/');
            const buf = fs.readFileSync(dst);
            c.res.setHeader('Content-Type', ext === 'zip' ? 'application/zip' : 'application/gzip');
            c.res.setHeader('Content-Disposition', `attachment; filename=${ar.repo.name}-${ref.replace(/\//g, '-')}.${ext}`);
            c.res.setHeader('Content-Length', String(buf.length));
            c.res.statusCode = 200;
            c.res.end(buf);
            c.rendered = true;
        }
        catch (e) {
            c.JSON(500, { error: String(e?.message ?? e).slice(0, 160) });
        }
        finally {
            fs.rmSync(dst, { force: true });
        }
    });
    // ── 标签管理 CRUD ─────────────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/labels', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.listLabels(ar.repo.id);
        const counts = db.db().prepare('SELECT il.label_id, COUNT(*) AS c FROM issue_label il JOIN issue i ON i.id = il.issue_id WHERE i.repo_id = ? AND i.is_closed = 0 AND i.is_pull = 0 GROUP BY il.label_id').all(ar.repo.id);
        const cmap = {};
        for (const x of counts)
            cmap[x.label_id] = x.c;
        c.JSONSuccess(rows.map((l) => ({ id: l.id, name: l.name, color: l.color, openIssues: cmap[l.id] || 0 })));
    });
    m.post('/api/dsh/repos/:o/:r/labels', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const name = String(body.name ?? '').trim();
        if (!name) {
            c.JSON(422, { error: 'name required' });
            return;
        }
        const info = db.db().prepare('INSERT INTO label (repo_id, name, color, num_issues, num_closed_issues) VALUES (?,?,?,?,0)').run(ar.repo.id, name, String(body.color ?? '#70c24a'), 0);
        c.JSONSuccess({ id: Number(info.lastInsertRowid), name });
    });
    m.patch('/api/dsh/repos/:o/:r/labels/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const id = c.ParamsInt64(':id');
        const label = db.getLabelByID(ar.repo.id, id);
        if (!label) {
            c.JSON(404, { error: 'not found' });
            return;
        }
        const sets = [];
        const args = [];
        if (body.name !== undefined) {
            sets.push('name = ?');
            args.push(String(body.name));
        }
        if (body.color !== undefined) {
            sets.push('color = ?');
            args.push(String(body.color));
        }
        if (sets.length)
            db.db().prepare(`UPDATE label SET ${sets.join(', ')} WHERE id = ? AND repo_id = ?`).run(...args, id, ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    m.delete('/api/dsh/repos/:o/:r/labels/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        db.db().prepare('DELETE FROM label WHERE id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── 里程碑 CRUD ───────────────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/milestones', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.listMilestones(ar.repo.id, null).map((m) => ({
            id: m.id, title: m.name, description: m.content,
            due: m.deadline_unix, closed: !!m.is_closed,
            open: m.num_issues - m.num_closed_issues, closedIssues: m.num_closed_issues,
        }));
        c.JSONSuccess(rows);
    });
    m.post('/api/dsh/repos/:o/:r/milestones', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const title = String(body.title ?? '').trim();
        if (!title) {
            c.JSON(422, { error: 'title required' });
            return;
        }
        let deadline = 0;
        if (body.due) {
            const t = Date.parse(String(body.due));
            if (!Number.isNaN(t))
                deadline = Math.floor(t / 1000);
        }
        const info = db.db().prepare('INSERT INTO milestone (repo_id, name, content, is_closed, num_issues, num_closed_issues, completeness, deadline_unix) VALUES (?,?,?,?,0,0,0,?)')
            .run(ar.repo.id, title, String(body.description ?? ''), 0, deadline);
        c.JSONSuccess({ id: Number(info.lastInsertRowid), title });
    });
    m.patch('/api/dsh/repos/:o/:r/milestones/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const id = c.ParamsInt64(':id');
        const body = await c.form();
        const sets = [];
        const args = [];
        if (body.title !== undefined) {
            sets.push('name = ?');
            args.push(String(body.title));
        }
        if (body.description !== undefined) {
            sets.push('content = ?');
            args.push(String(body.description));
        }
        if (body.due !== undefined) {
            const t2 = Date.parse(String(body.due));
            sets.push('deadline_unix = ?');
            args.push(Number.isNaN(t2) ? 0 : Math.floor(t2 / 1000));
        }
        if (body.closed !== undefined) {
            sets.push('is_closed = ?');
            args.push(body.closed ? 1 : 0);
        }
        if (sets.length)
            db.db().prepare(`UPDATE milestone SET ${sets.join(', ')} WHERE id = ? AND repo_id = ?`).run(...args, id, ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    m.delete('/api/dsh/repos/:o/:r/milestones/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        db.db().prepare('DELETE FROM milestone WHERE id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── issue 增强：编辑/标签/里程碑/负责人 ────────────────────────
    m.patch('/api/dsh/repos/:o/:r/issues/:idx', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const issue = db.getIssueByIndex(ar.repo.id, c.ParamsInt64(':idx'));
        if (!issue) {
            c.JSON(404, { error: 'not found' });
            return;
        }
        const body = await c.form();
        const sets = [];
        const args = [];
        if (body.title !== undefined) {
            sets.push('name = ?');
            args.push(String(body.title));
        }
        if (body.body !== undefined) {
            sets.push('content = ?');
            args.push(String(body.body));
        }
        if (body.milestone !== undefined) {
            sets.push('milestone_id = ?');
            args.push(Number(body.milestone) || 0);
        }
        if (body.assignee !== undefined) {
            const au = body.assignee ? db.getUserByUsername(String(body.assignee)) : null;
            sets.push('assignee_id = ?');
            args.push(au ? au.id : 0);
        }
        if (sets.length) {
            sets.push('updated_unix = ?');
            args.push(Math.floor(Date.now() / 1000), issue.id);
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
    // ── 关注 / 星标（toggle + 列表，对齐原版 action/watch|star） ──
    const starWatch = (table, countCol) => {
        const ucol = table === 'star' ? 'uid' : 'user_id';
        return ({
            get: async (c) => {
                const ar = authRepo(c);
                if (!ar)
                    return;
                const on = !!db.db().prepare(`SELECT 1 FROM ${table} WHERE ${ucol} = ? AND repo_id = ?`).get(ar.user.id, ar.repo.id);
                const users = db.db().prepare(`SELECT u.name FROM ${table} x JOIN user u ON u.id = x.${ucol} WHERE x.repo_id = ? ORDER BY x.id DESC LIMIT 50`).all(ar.repo.id).map((r) => r.name);
                c.JSONSuccess({ on, count: Number(ar.repo[countCol] || 0), users });
            },
            post: async (c) => {
                const ar = authRepo(c);
                if (!ar)
                    return;
                const on = !!db.db().prepare(`SELECT 1 FROM ${table} WHERE ${ucol} = ? AND repo_id = ?`).get(ar.user.id, ar.repo.id);
                if (on)
                    db.db().prepare(`DELETE FROM ${table} WHERE ${ucol} = ? AND repo_id = ?`).run(ar.user.id, ar.repo.id);
                else
                    db.db().prepare(`INSERT INTO ${table} (${ucol}, repo_id) VALUES (?,?)`).run(ar.user.id, ar.repo.id);
                const n = db.db().prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE repo_id = ?`).get(ar.repo.id).c;
                db.db().prepare(`UPDATE repository SET ${countCol} = ? WHERE id = ?`).run(n, ar.repo.id);
                c.JSONSuccess({ on: !on, count: n });
            },
        });
    };
    const star = starWatch('star', 'num_stars');
    const watch = starWatch('watch', 'num_watches');
    m.get('/api/dsh/repos/:o/:r/star', (c) => star.get(c));
    m.post('/api/dsh/repos/:o/:r/star', (c) => star.post(c));
    m.get('/api/dsh/repos/:o/:r/watch', (c) => watch.get(c));
    m.post('/api/dsh/repos/:o/:r/watch', (c) => watch.post(c));
    // ── fork ────────────────────────────────────────────────────────
    m.post('/api/dsh/repos/:o/:r/fork', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const src = ar.repo;
        const body = await c.form();
        const orgName = String(body.org ?? '');
        const owner = orgName ? db.getUserByUsername(orgName) : ar.user;
        if (!owner) {
            c.JSON(404, { error: 'org not found' });
            return;
        }
        if (orgName) {
            const mem = db.db().prepare('SELECT 1 FROM org_user WHERE org_id = ? AND uid = ? AND is_owner = 1').get(owner.id, ar.user.id);
            if (!mem && ar.user.is_admin !== 1) {
                c.JSON(403, { error: '需要组织管理员' });
                return;
            }
        }
        if (db.getRepoByOwnerAndName(owner, src.name)) {
            c.JSON(422, { error: '同名仓库已存在' });
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const info = db.db().prepare('INSERT INTO repository (owner_id, lower_name, name, description, is_private, is_fork, fork_id, num_watches, num_stars, num_forks, num_issues, num_closed_issues, num_pulls, num_closed_pulls, created_unix) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,0,?)').run(owner.id, src.lower_name, src.name, src.description, src.is_private, 1, src.id, 1, 0, 0, now);
        const fork = db.getRepoByID(Number(info.lastInsertRowid));
        if (!fork) {
            c.JSON(500, { error: 'fork insert failed' });
            return;
        }
        try {
            await svc.forkRepository(src, fork);
            db.db().prepare('UPDATE repository SET num_forks = num_forks + 1 WHERE id = ?').run(src.id);
            const { forkRepoAction } = await import('./db/actions.js');
            await forkRepoAction(ar.user, fork);
            c.JSONSuccess({ ok: true, owner: owner.name, name: fork.name });
        }
        catch (e) {
            db.db().prepare('DELETE FROM repository WHERE id = ?').run(fork.id);
            c.JSON(500, { error: 'fork failed: ' + String(e?.message ?? e).slice(0, 160) });
        }
    });
    // ── webhook CRUD ────────────────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/hooks', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.db().prepare('SELECT id, url, content_type, is_active, events, created_unix FROM webhook WHERE repo_id = ? ORDER BY id').all(ar.repo.id);
        c.JSONSuccess(rows);
    });
    m.post('/api/dsh/repos/:o/:r/hooks', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const url = String(body.url ?? '').trim();
        if (!url.startsWith('http')) {
            c.JSON(422, { error: 'url required' });
            return;
        }
        const events = JSON.stringify(body.events || { push: true });
        const info = db.db().prepare('INSERT INTO webhook (repo_id, url, content_type, is_active, events, created_unix, updated_unix) VALUES (?,?,1,1,?,?,?)')
            .run(ar.repo.id, url, events, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
        c.JSONSuccess({ id: Number(info.lastInsertRowid), url });
    });
    m.patch('/api/dsh/repos/:o/:r/hooks/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const sets = [];
        const args = [];
        if (body.url !== undefined) {
            sets.push('url = ?');
            args.push(String(body.url));
        }
        if (body.active !== undefined) {
            sets.push('is_active = ?');
            args.push(body.active ? 1 : 0);
        }
        if (sets.length)
            db.db().prepare(`UPDATE webhook SET ${sets.join(', ')}, updated_unix = ? WHERE id = ? AND repo_id = ?`)
                .run(...args, Math.floor(Date.now() / 1000), c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    m.delete('/api/dsh/repos/:o/:r/hooks/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        db.db().prepare('DELETE FROM webhook WHERE id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── 部署密钥（settings/keys） ─────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/keys', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.db().prepare('SELECT k.id, k.name, k.fingerprint, k.created_unix FROM deploy_key dk JOIN public_key k ON k.id = dk.key_id WHERE dk.repo_id = ? ORDER BY k.id').all(ar.repo.id);
        c.JSONSuccess(rows);
    });
    m.post('/api/dsh/repos/:o/:r/keys', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const name = String(body.name ?? '').trim();
        const content = String(body.content ?? '').trim();
        if (!name || !content) {
            c.JSON(422, { error: 'name and content required' });
            return;
        }
        let fingerprint = '';
        try {
            const tmp = path.join(os.tmpdir(), 'dgs-key-' + Date.now());
            fs.writeFileSync(tmp, content);
            fingerprint = String((await git.git(os.tmpdir(), 'ssh-keygen', '-lf', tmp))?.toString('utf8') || '').trim();
            fs.rmSync(tmp, { force: true });
        }
        catch {
            fingerprint = 'ssh-key';
        }
        const now = Math.floor(Date.now() / 1000);
        const info = db.db().prepare('INSERT INTO public_key (owner_id, name, fingerprint, content, created_unix, updated_unix) VALUES (?,?,?,?,?,?)')
            .run(ar.user.id, name, fingerprint, content, now, now);
        db.db().prepare('INSERT INTO deploy_key (key_id, repo_id, name, fingerprint, mode) VALUES (?,?,?,?,1)')
            .run(Number(info.lastInsertRowid), ar.repo.id, name, fingerprint);
        c.JSONSuccess({ id: Number(info.lastInsertRowid), name, fingerprint });
    });
    m.delete('/api/dsh/repos/:o/:r/keys/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        db.db().prepare('DELETE FROM deploy_key WHERE key_id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── 协作者 ────────────────────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/collaborators', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.db().prepare('SELECT u.name, u.full_name, col.mode FROM collaboration col JOIN user u ON u.id = col.user_id WHERE col.repo_id = ?').all(ar.repo.id);
        c.JSONSuccess(rows);
    });
    m.post('/api/dsh/repos/:o/:r/collaborators/:name', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const u = db.getUserByUsername(c.Params(':name'));
        if (!u) {
            c.JSON(404, { error: 'user not found' });
            return;
        }
        const exists = db.db().prepare('SELECT 1 FROM collaboration WHERE user_id = ? AND repo_id = ?').get(u.id, ar.repo.id);
        if (!exists)
            db.db().prepare('INSERT INTO collaboration (user_id, repo_id, mode) VALUES (?,?,2)').run(u.id, ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    m.delete('/api/dsh/repos/:o/:r/collaborators/:name', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const u = db.getUserByUsername(c.Params(':name'));
        if (u)
            db.db().prepare('DELETE FROM collaboration WHERE user_id = ? AND repo_id = ?').run(u.id, ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── 仓库设置：改名/描述/私有 + 删除 ────────────────────────────
    m.patch('/api/dsh/repos/:o/:r', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        if (ar.repo.OwnerName() !== ar.user.name && ar.user.is_admin !== 1) {
            c.JSON(403, { error: 'forbidden' });
            return;
        }
        const body = await c.form();
        const sets = [];
        const args = [];
        if (body.description !== undefined) {
            sets.push('description = ?');
            args.push(String(body.description));
        }
        if (body.private !== undefined) {
            sets.push('is_private = ?');
            args.push(body.private ? 1 : 0);
        }
        if (sets.length)
            db.db().prepare(`UPDATE repository SET ${sets.join(', ')} WHERE id = ?`).run(...args, ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── 用户 profile（资料+仓库+活动） ─────────────────────────────
    m.get('/api/dsh/users/:name', async (c) => {
        const u = db.getUserByUsername(c.Params(':name'));
        if (!u) {
            c.JSON(404, { error: 'user not found' });
            return;
        }
        const repos = db.listReposByOwner(u.id).filter((r) => !r.is_private || c.IsLogged).map((r) => ({
            name: r.name, owner: r.OwnerName(), description: r.description, stars: r.num_stars,
            updated: r.updated_unix,
        }));
        const activity = db.db().prepare('SELECT a.op_type, a.ref_name, a.content, a.created_unix, r.lower_name AS repo, ow.name AS owner FROM action a JOIN repository r ON r.id = a.repo_id JOIN user ow ON ow.id = r.owner_id WHERE a.act_user_id = ? ORDER BY a.id DESC LIMIT 20').all(u.id);
        const followers = db.db().prepare('SELECT u.name FROM follow f JOIN user u ON u.id = f.user_id WHERE f.follow_id = ?').all(u.id).map((x) => x.name);
        const following = db.db().prepare('SELECT u.name FROM follow f JOIN user u ON u.id = f.follow_id WHERE f.user_id = ?').all(u.id).map((x) => x.name);
        c.JSONSuccess({
            name: u.name, fullName: u.full_name || '', email: u.email, isAdmin: u.is_admin === 1,
            followers, following, repos, activity: activity.map((a) => ({
                type: a.op_type, repo: a.owner + '/' + a.repo, ref: a.ref_name, content: a.content, date: a.created_unix,
            })),
        });
    });
    // ── 组织：我的组织列表 / 组织详情 / 创建 ────────────────────────
    m.get('/api/dsh/orgs', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user) {
            c.JSON(401, { error: 'unauthorized' });
            return;
        }
        const rows = db.db().prepare('SELECT u.id, u.name, u.full_name FROM user u JOIN org_user ou ON ou.org_id = u.id WHERE u.type = 1 AND ou.uid = ?').all(user.id);
        c.JSONSuccess(rows.map((r) => ({ id: r.id, name: r.name, fullName: r.full_name })));
    });
    m.get('/api/dsh/orgs/:name', async (c) => {
        const o = db.getUserByUsername(c.Params(':name'));
        if (!o || o.type !== 1) {
            c.JSON(404, { error: 'org not found' });
            return;
        }
        const members = db.db().prepare('SELECT u.name, u.full_name, ou.is_owner FROM org_user ou JOIN user u ON u.id = ou.uid WHERE ou.org_id = ?').all(o.id);
        const repos = db.db().prepare('SELECT name, lower_name, description FROM repository WHERE owner_id = ?').all(o.id);
        c.JSONSuccess({ name: o.name, fullName: o.full_name, description: o.description,
            members: members.map((m) => ({ name: m.name, owner: !!m.is_owner })),
            repos: repos.map((r) => ({ name: r.name, owner: o.name })) });
    });
    m.post('/api/dsh/orgs', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user) {
            c.JSON(401, { error: 'unauthorized' });
            return;
        }
        const body = await c.form();
        const name = String(body.name ?? '').trim();
        if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
            c.JSON(422, { error: 'bad org name' });
            return;
        }
        try {
            db.createOrganization(user, name, { fullName: String(body.fullName ?? ''), description: String(body.description ?? '') });
            c.JSONSuccess({ ok: true });
        }
        catch (e) {
            c.JSON(422, { error: String(e?.message ?? e).slice(0, 120) });
        }
    });
    m.patch('/api/dsh/orgs/:name', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user) {
            c.JSON(401, { error: 'unauthorized' });
            return;
        }
        const o = db.getUserByUsername(c.Params(':name'));
        if (!o || o.type !== 1) {
            c.JSON(404, { error: 'org not found' });
            return;
        }
        const ownerRow = db.db().prepare('SELECT is_owner FROM org_user WHERE org_id = ? AND uid = ?').get(o.id, user.id);
        if ((!ownerRow || !ownerRow.is_owner) && user.is_admin !== 1) {
            c.JSON(403, { error: 'forbidden' });
            return;
        }
        const body = await c.form();
        const sets = [];
        const args = [];
        if (body.fullName !== undefined) {
            sets.push('full_name = ?');
            args.push(String(body.fullName));
        }
        if (body.description !== undefined) {
            sets.push('description = ?');
            args.push(String(body.description));
        }
        if (sets.length)
            db.db().prepare(`UPDATE user SET ${sets.join(', ')} WHERE id = ? AND type = 1`).run(...args, o.id);
        c.JSONSuccess({ ok: true });
    });
    // ── 探索：仓库/用户搜索 ───────────────────────────────────────
    m.get('/api/dsh/explore/repos', async (c) => {
        const q = '%' + c.Query('q').toLowerCase() + '%';
        const rows = db.db().prepare('SELECT r.name, r.lower_name, r.description, r.is_private, r.num_stars, u.name AS owner FROM repository r JOIN user u ON u.id = r.owner_id WHERE (r.lower_name LIKE ? OR lower(r.description) LIKE ?) AND r.is_private = 0 ORDER BY r.num_stars DESC LIMIT 50').all(q, q);
        c.JSONSuccess(rows.map((r) => ({ name: r.name, owner: r.owner, description: r.description, stars: r.num_stars })));
    });
    m.get('/api/dsh/explore/users', async (c) => {
        const q = '%' + c.Query('q').toLowerCase() + '%';
        const rows = db.db().prepare("SELECT name, full_name FROM user WHERE (type = 0 OR type = 1) AND (lower_name LIKE ? OR lower(full_name) LIKE ?) LIMIT 50").all(q, q);
        c.JSONSuccess(rows);
    });
    // ── 管理面：统计 + 用户/仓库列表（admin token） ────────────────
    m.get('/api/dsh/admin/summary', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user || user.is_admin !== 1) {
            c.JSON(403, { error: 'forbidden' });
            return;
        }
        const q = (t) => db.db().prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
        c.JSONSuccess({
            users: q('user'), orgs: db.db().prepare('SELECT COUNT(*) AS c FROM user WHERE type = 1').get().c,
            repos: q('repository'), issues: q('issue'), pulls: db.db().prepare('SELECT COUNT(*) AS c FROM issue WHERE is_pull = 1').get().c,
        });
    });
    m.get('/api/dsh/admin/users', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user || user.is_admin !== 1) {
            c.JSON(403, { error: 'forbidden' });
            return;
        }
        const rows = db.db().prepare('SELECT name, full_name, email, is_admin, created_unix FROM user ORDER BY id').all();
        c.JSONSuccess(rows.map((r) => ({ name: r.name, fullName: r.full_name, email: r.email, isAdmin: r.is_admin === 1, created: r.created_unix })));
    });
    m.get('/api/dsh/admin/repos', async (c) => {
        const header = String(c.req.headers.authorization ?? '');
        const token = /^token (.+)$/.exec(header)?.[1] ?? '';
        const user = token ? authenticateUserByToken(token) : null;
        if (!user || user.is_admin !== 1) {
            c.JSON(403, { error: 'forbidden' });
            return;
        }
        const rows = db.db().prepare('SELECT r.name, r.lower_name, r.is_private, r.num_stars, u.name AS owner FROM repository r JOIN user u ON u.id = r.owner_id ORDER BY r.id').all();
        c.JSONSuccess(rows.map((r) => ({ name: r.owner + '/' + r.name, owner: r.owner, private: !!r.is_private, stars: r.num_stars })));
    });
    // ── PR 合并 ───────────────────────────────────────────────────
    m.post('/api/dsh/repos/:o/:r/pulls/:index/merge', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const { repo, user } = ar;
        const index = c.ParamsInt64(':index');
        const issue = db.getIssueByIndex(repo.id, index);
        const pr = issue ? db.db().prepare('SELECT * FROM pull_request WHERE issue_id = ?').get(issue.id) : null;
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
            const style = (await c.form()).style || 'merge';
            if (style === 'rebase') {
                await git.git(tmpDir, 'rebase', '--end-of-options', `head_repo/${pr.head_branch}`);
            }
            else if (style === 'squash') {
                await git.git(tmpDir, 'merge', '--squash', '--end-of-options', `head_repo/${pr.head_branch}`);
                const msg = `${pr.title} (#${issue.index})\n\n${issue.content || ''}`;
                await git.git(tmpDir, 'commit', `--author=${user.name} <${user.email}>`, '-m', msg);
            }
            else {
                await git.git(tmpDir, 'merge', '--no-ff', '--no-commit', '--end-of-options', `head_repo/${pr.head_branch}`);
                const msg = `Merge branch '${pr.head_branch}' of ${pr.head_user_name}/${headRepo.name} into ${pr.base_branch}`;
                await git.git(tmpDir, 'commit', `--author=${user.name} <${user.email}>`, '-m', msg);
            }
            await git.git(tmpDir, 'push', 'origin', `HEAD:refs/heads/${pr.base_branch}`);
            const now = Math.floor(Date.now() / 1000);
            db.db().prepare('UPDATE pull_request SET has_merged = 1, merger_id = ?, merged_unix = ? WHERE id = ?').run(user.id, now, pr.id);
            db.updateIssueColumns(issue.id, { is_closed: 1 });
            db.refreshIssueCounts(repo.id);
            const { issueAction, ActionType } = await import('./db/actions.js');
            await issueAction(ActionType.MERGE_PULL_REQUEST, user, repo, issue);
            c.JSONSuccess({ ok: true });
        }
        catch (e) {
            console.error('[dsh merge]', e);
            c.JSON(500, { error: 'merge failed: ' + String(e?.message ?? e).slice(0, 200) });
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    // ── PR 不合并关闭 ─────────────────────────────────────────────
    m.post('/api/dsh/repos/:o/:r/pulls/:index/close', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const issue = db.getIssueByIndex(ar.repo.id, c.ParamsInt64(':index'));
        if (!issue || !issue.is_pull) {
            c.JSON(404, { error: 'pull not found' });
            return;
        }
        db.updateIssueColumns(issue.id, { is_closed: 1 });
        db.refreshIssueCounts(ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    // ── wiki：列表 / 读取 / 保存 ──────────────────────────────────
    const wikiDirOf = (repo) => repo.WikiPath();
    m.get('/api/dsh/repos/:o/:r/wiki', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = wikiDirOf(ar.repo);
        if (!fs.existsSync(dir)) {
            c.JSONSuccess({ pages: [], initialized: false });
            return;
        }
        const svc = await import('./gitx/service.js');
        const branch = svc.wikiBranch(dir);
        const ref = 'refs/heads/' + branch;
        if (!(await git.refExists(dir, ref))) {
            c.JSONSuccess({ pages: [], initialized: true });
            return;
        }
        const commit = await git.getCommit(dir, ref);
        if (!commit) {
            c.JSONSuccess({ pages: [], initialized: true });
            return;
        }
        const tree = await git.lsTree(dir, commit.id, '');
        const pages = [];
        for (const e of tree?.entries ?? []) {
            if (e.type !== 'blob' || !e.name.endsWith('.md'))
                continue;
            const last = await git.commitByPath(dir, ref, e.name);
            pages.push({ name: e.name.slice(0, -3), updatedAt: last?.committer?.when ?? null, author: last?.committer?.name ?? '' });
        }
        c.JSONSuccess({ pages, initialized: true });
    });
    m.get('/api/dsh/repos/:o/:r/wiki/:page', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
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
                if (entry)
                    content = (await git.blobBytes(dir, entry.sha)).toString('utf8');
            }
        }
        catch { /* empty */ }
        if (!content) {
            c.JSON(404, { error: 'page not found' });
            return;
        }
        const html = sanitizeHTML(markdown(content, conf.subpath + '/', ar.repo.ComposeMetas()));
        c.JSONSuccess({ name, content, html });
    });
    m.get('/api/dsh/repos/:o/:r/wiki/:page/commits', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const dir = wikiDirOf(ar.repo);
        if (!fs.existsSync(dir)) {
            c.JSONSuccess([]);
            return;
        }
        const pageName = c.Params(':page');
        const file = pageName.endsWith('.md') ? pageName : pageName + '.md';
        const out = (await git.git(dir, 'log', '--pretty=format:%H%x1f%s%x1f%an%x1f%ai', '--', file))?.toString('utf8') ?? '';
        const rows = out.split('\n').filter(Boolean).map((l) => { const [sha, message, author, date] = l.split('\x1f'); return { sha, message, author, date }; });
        c.JSONSuccess(rows);
    });
    m.delete('/api/dsh/repos/:o/:r/wiki/:page', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const dir = wikiDirOf(ar.repo);
        if (!fs.existsSync(dir)) {
            c.JSON(404, { error: 'no wiki' });
            return;
        }
        const pageName = c.Params(':page');
        const file = pageName.endsWith('.md') ? pageName : pageName + '.md';
        try {
            await git.git(dir, 'rm', '-q', '--', file);
            await git.git(dir, 'commit', '-q', '-m', `Delete ${pageName}`);
            c.JSONSuccess({ ok: true });
        }
        catch (e) {
            c.JSON(500, { error: String(e?.message ?? e).slice(0, 120) });
        }
    });
    m.post('/api/dsh/repos/:o/:r/wiki/:page', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const svc = await import('./gitx/service.js');
        const name = svc.toWikiPageName(decodeURIComponent(c.Params(':page')));
        const body = await c.form();
        // 复用 routes/repo.ts 的写页实现（clone→写文件→commit→push→delegate hook）
        try {
            const __repo = await import('./routes/repo.js');
            await __repo.writeWikiPage(ar.repo, name, String(body.content ?? ''), ar.user, null);
            c.JSONSuccess({ ok: true });
        }
        catch (e) {
            c.JSON(500, { error: String(e?.message ?? e).slice(0, 200) });
        }
    });
    // ── 发版：列表 / 创建 ────────────────────────────────────────
    m.get('/api/dsh/repos/:o/:r/releases', async (c) => {
        const ar = authRepo(c);
        if (!ar)
            return;
        const rows = db.db().prepare('SELECT r.id, r.tag_name, r.title, r.note, r.is_draft, r.is_prerelease, r.created_unix, u.name AS author FROM `release` r LEFT JOIN user u ON u.id = r.publisher_id WHERE r.repo_id = ? ORDER BY r.created_unix DESC').all(ar.repo.id);
        const dir = ar.repo.RepoPath();
        const out = [];
        for (const r of rows) {
            let behind = 0;
            try {
                behind = Number((await git.git(dir, 'rev-list', '--count', '--end-of-options', `${r.tag_name}..${r.target || ar.repo.default_branch || conf.defaultBranch}`))?.toString('utf8').trim() || 0);
            }
            catch {
                behind = 0;
            }
            out.push({
                id: r.id, tag: r.tag_name, title: r.title, draft: !!r.is_draft, prerelease: !!r.is_prerelease,
                noteHtml: r.note ? sanitizeHTML(markdown(r.note, conf.subpath + '/', {})) : '',
                noteRaw: r.note || '',
                author: r.author, createdAt: r.created_unix, target: r.target || '', behind,
            });
        }
        c.JSONSuccess(out);
    });
    m.patch('/api/dsh/repos/:o/:r/releases/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const body = await c.form();
        const sets = [];
        const args = [];
        if (body.title !== undefined) {
            sets.push('title = ?');
            args.push(String(body.title));
        }
        if (body.note !== undefined) {
            sets.push('note = ?');
            args.push(String(body.note));
        }
        if (sets.length)
            db.db().prepare(`UPDATE release SET ${sets.join(', ')} WHERE id = ? AND repo_id = ?`).run(...args, c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    m.delete('/api/dsh/repos/:o/:r/releases/:id', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        db.db().prepare('DELETE FROM release WHERE id = ? AND repo_id = ?').run(c.ParamsInt64(':id'), ar.repo.id);
        c.JSONSuccess({ ok: true });
    });
    m.post('/api/dsh/repos/:o/:r/releases', async (c) => {
        const ar = authRepo(c, true);
        if (!ar)
            return;
        const { repo, user } = ar;
        const body = await c.form();
        const tag = String(body.tag ?? '').trim();
        const title = String(body.title ?? '').trim() || tag;
        const note = String(body.note ?? '');
        const target = String(body.target ?? '') || repo.default_branch || conf.defaultBranch;
        if (!tag) {
            c.JSON(422, { error: 'tag required' });
            return;
        }
        if (db.db().prepare('SELECT 1 FROM `release` WHERE repo_id = ? AND lower_tag_name = ?').get(repo.id, tag.toLowerCase())) {
            c.JSON(422, { error: 'tag already released' });
            return;
        }
        const repoDir = repo.RepoPath();
        try {
            const sha = (await git.gitOK(repoDir, 'rev-parse', '--verify', '--end-of-options', target))?.toString().trim() ?? '';
            if (!sha) {
                c.JSON(422, { error: 'target not found' });
                return;
            }
            await git.gitOK(repoDir, 'tag', tag, sha);
            const numCommits = await git.commitsCount(repoDir, sha);
            const now = Math.floor(Date.now() / 1000);
            db.db().prepare('INSERT INTO `release` (repo_id, publisher_id, tag_name, lower_tag_name, target, title, sha1, num_commits, note, is_draft, is_prerelease, created_unix) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(repo.id, user.id, tag, tag.toLowerCase(), target, title, sha, numCommits, note, body.draft ? 1 : 0, body.prerelease ? 1 : 0, now);
            c.JSONSuccess({ ok: true });
        }
        catch (e) {
            c.JSON(500, { error: String(e?.message ?? e).slice(0, 200) });
        }
    });
}
//# sourceMappingURL=dshapi.js.map