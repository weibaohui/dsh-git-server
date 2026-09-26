// git hook subcommand: pre-receive/update/post-receive, mirroring cmd/gogs/hook.go.
// Environment carries the auth/repo context (ComposeHookEnvs).
import * as db from './db/db.js';

export async function runHook(name: string): Promise<void> {
  if (name === 'update') {
    // 分支保护：受保护分支拒绝删除与强推（非快进）。merge/网页编辑都是快进，不受影响。
    const [ref, oldSha, newSha] = process.argv.slice(4);
    if (ref?.startsWith('refs/heads/') && newSha) {
      const branch = ref.slice('refs/heads/'.length);
      const ownerName = process.env.GOGS_REPO_OWNER_NAME ?? '';
      const repoName = process.env.GOGS_REPO_NAME ?? '';
      const owner = db.getUserByUsername(ownerName);
      const repo = owner ? db.getRepoByOwnerAndName(owner, repoName) : null;
      if (repo) {
        const prot = db.db().prepare('SELECT 1 FROM protect_branch WHERE repo_id = ? AND name = ? AND protected = 1').get(repo.id, branch);
        if (prot) {
          const EMPTY = '0000000000000000000000000000000000000000';
          if (newSha === EMPTY) {
            console.error(`[hook] rejected: branch ${branch} is protected (deletion)`);
            process.exit(1);
          }
          if (oldSha && oldSha !== EMPTY && /^[0-9a-f]{40}$/.test(oldSha) && /^[0-9a-f]{40}$/.test(newSha)) {
            const { gitOK } = await import('./gitx/git.js');
            const ok = await gitOK(repo.RepoPath(), 'merge-base', '--is-ancestor', oldSha, newSha);
            if (ok === null) {
              console.error(`[hook] rejected: branch ${branch} is protected (non-fast-forward)`);
              process.exit(1);
            }
          }
        }
      }
    }
    process.exit(0);
  }
  if (name === 'pre-receive') {
    process.exit(0);
  }
  if (name !== 'post-receive') {
    process.exit(0);
  }

  console.error('[hook:dbg] name=%s owner=%s repo=%s user=%s', name, process.env.GOGS_REPO_OWNER_NAME, process.env.GOGS_REPO_NAME, process.env.GOGS_AUTH_USER_ID);
  const ownerName = process.env.GOGS_REPO_OWNER_NAME ?? '';
  const repoName = process.env.GOGS_REPO_NAME ?? '';
  const userID = Number(process.env.GOGS_AUTH_USER_ID ?? 0);
  const owner = db.getUserByUsername(ownerName);
  const repo = owner ? db.getRepoByOwnerAndName(owner, repoName) : null;
  const doer = db.getUserByID(userID);

  if (!repo || !doer) {
    console.error('[hook] missing context: owner=%s repo=%s user=%d repoObj=%s', ownerName, repoName, userID, !!repo);
    process.exit(0);
  }
  console.error('[hook:dbg] context ok, reading stdin');

  // stdin lines: "<old> <new> <ref>"
  const input: string = await new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => resolve(data));
  });

  const { processPushUpdate } = await import('./gitx/service.js');
  const { pendingDeliveries } = await import('./webhook.js');
  for (const line of input.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [oldSha, newSha, ref] = parts;
    console.error('[hook:dbg] processing line: %s %s %s', oldSha, newSha, ref);
    // wiki pushes are handled by their own flows
    if (repo.RepoPath().includes('.wiki.git')) continue;
    try {
      await processPushUpdate({ doer, repo, refName: ref, oldSha, newSha, pusherID: doer.id });
    } catch (e: any) {
      console.error(`[hook] push update failed: ${e?.stack ?? e?.message ?? e}`);
    }
  }
  // let async webhook deliveries flush before the hook process exits
  await Promise.allSettled(Array.from(pendingDeliveries));
  process.exit(0);
}
