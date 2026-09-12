// 仓库领域的活函数：从已裁撤的 routes/repo.ts（网页路由）中摘出，
// 供 /api/v1 建仓与 /api/dsh PR 合并性检测使用。routes/ 死网页路由已整体删除。
import * as fs from 'node:fs';
import * as path from 'node:path';
import { conf } from './conf.js';
import * as db from './db/db.js';
import { nowUnix } from './db/db.js';
import * as git from './gitx/git.js';
import * as svc from './gitx/service.js';
import { createRepoAction } from './db/actions.js';

/** 建仓：写 repository 记录 + 初始化裸仓 + 关注/动作。原 routes/repo.ts createRepositoryRecord。 */
export async function createRepositoryRecord(doer: db.User, owner: db.User, opts: any): Promise<db.Repository> {
  const now = nowUnix();
  const info = db
    .db()
    .prepare(
      `INSERT INTO repository (owner_id, lower_name, name, description, website, default_branch,
        is_private, is_bare, is_mirror, enable_wiki, enable_issues, enable_pulls,
        num_watches, num_stars, num_forks, num_issues, num_closed_issues, num_pulls, num_closed_pulls,
        num_milestones, num_closed_milestones, created_unix, updated_unix, size)
       VALUES (?,?,?,?,?,?,?,?,?,1,1,1,0,0,0,0,0,0,0,0,0,?,?,0)`
    )
    .run(
      owner.id,
      opts.name.toLowerCase(),
      opts.name,
      opts.description ?? '',
      opts.website ?? '',
      conf.defaultBranch,
      opts.private ? 1 : 0,
      opts.autoInit ? 0 : 1,
      opts.mirror ? 1 : 0,
      now,
      now
    );
  const repo = db.getRepoByID(Number(info.lastInsertRowid))!;
  db.db().prepare('UPDATE user SET num_repos = num_repos + 1 WHERE id = ?').run(owner.id);
  // owner watches own repo
  db.watchRepo(doer.id, repo.id, true);
  await svc.initRepository(repo, { autoInit: opts.autoInit, doer, readme: opts.readme, gitignores: opts.gitignores, license: opts.license });
  createRepoAction(doer, repo);
  return repo;
}

/** PR 合并性检测：clone 基线分支后 `git apply --check` 试套 patch。原 routes/repo.ts testPullRequestMergeable。 */
export async function testPullRequestMergeable(repo: db.Repository, pr: any): Promise<number> {
  const patchFile = path.join(conf.appDataPath, 'patches', String(repo.id), `${pr.index}.patch`);
  if (!fs.existsSync(patchFile)) return pr.status ?? 0;
  const tmpDir = path.join(conf.appDataPath, 'tmp', 'prtest-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const baseDir = repo.RepoPath();
    await git.git(process.cwd(), 'clone', '-q', '-b', pr.base_branch, baseDir, tmpDir);
    const wsFlag = repo.pulls_ignore_whitespace ? '--ignore-whitespace' : null;
    const args = ['apply', '--check'];
    if (wsFlag) args.push(wsFlag);
    args.push(patchFile);
    const r = await git.gitOK(tmpDir, ...args);
    return r !== null ? 2 : 0; // 2=mergeable 0=conflict
  } catch {
    return 0;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** wiki 写页：clone wiki 仓 → 写/删 .md → commit → push。原 routes/repo.ts writeWikiPage。 */
export async function writeWikiPage(repo: db.Repository, title: string, content: string, doer: db.User, oldTitle: string | null, isDelete = false): Promise<void> {
  const wikiDir = repo.WikiPath();
  await svc.initWiki(wikiDir);
  const tmpDir = path.join(conf.appDataPath, 'tmp', 'wiki-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const branch = svc.wikiBranch(wikiDir);
    const hasBranch = await git.refExists(wikiDir, 'refs/heads/' + branch);
    if (hasBranch) {
      await git.git(process.cwd(), 'clone', wikiDir, tmpDir);
    } else {
      await git.git(process.cwd(), 'clone', wikiDir, tmpDir);
    }
    const target = path.join(tmpDir, title + '.md');
    if (isDelete) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      const symlink = target.endsWith('.md') ? target.slice(0, -3) : target;
      if (fs.existsSync(symlink)) fs.unlinkSync(symlink);
    } else {
      if (oldTitle && oldTitle !== title) {
        const oldPath = path.join(tmpDir, oldTitle + '.md');
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      if (!isDelete && fs.existsSync(target) && oldTitle === null) {
        throw new Error('page already exists');
      }
      fs.writeFileSync(target, content);
    }
    const author = `${doer.name} <${doer.email}>`;
    await git.git(tmpDir, 'add', '--all');
    const msg = isDelete ? `Delete page '${title}'` : oldTitle ? `Update page '${title}'` : `Update page '${title}'`;
    await git.git(tmpDir, 'commit', `--author=${author}`, '-m', msg);
    await git.git(tmpDir, 'push', 'origin', `HEAD:refs/heads/${branch}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}