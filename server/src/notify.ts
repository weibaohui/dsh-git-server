// 站内通知：基于 issue_user 表（is_read/is_assigned/is_mentioned/is_poster）的
// 轻量实现——评论/指派/提及/状态变更时把相关人的行标记为未读，面板轮询未读数。
import * as db from './db/db.js';

function ensureRow(uid: number, issue: any): void {
  const row = db.db().prepare('SELECT 1 FROM issue_user WHERE uid = ? AND issue_id = ?').get(uid, issue.id);
  if (row) return;
  db.db()
    .prepare('INSERT INTO issue_user (uid, issue_id, repo_id, is_read, is_assigned, is_mentioned, is_poster, is_closed) VALUES (?,?,?,1,0,0,0,?)')
    .run(uid, issue.id, issue.repo_id, issue.is_closed ?? 0);
}

/** 文本里 @到的已存在用户。 */
export function mentionedUserIDs(content: string): number[] {
  const out = new Set<number>();
  for (const m of content.matchAll(/@([a-zA-Z0-9_.-]+)/g)) {
    const u = db.getUserByUsername(m[1]);
    if (u) out.add(u.id);
  }
  return [...out];
}

/** 把工单相关人（作者/负责人/既往评论者/@提及）标记为未读；actor 本人除外。 */
export function markIssueUnread(issue: any, actorID: number, opts: { mentionContent?: string; assigned?: boolean } = {}): void {
  const uids = new Set<number>();
  if (issue.poster_id) uids.add(issue.poster_id);
  if (issue.assignee_id) uids.add(issue.assignee_id);
  const commenters = db.db().prepare('SELECT DISTINCT poster_id FROM comment WHERE issue_id = ? AND type = 0').all(issue.id) as any[];
  for (const cm of commenters) if (cm.poster_id) uids.add(cm.poster_id);
  const mentioned = new Set<number>(opts.mentionContent ? mentionedUserIDs(opts.mentionContent) : []);
  for (const uid of mentioned) uids.add(uid);
  for (const uid of uids) {
    if (!uid || uid === actorID) continue;
    ensureRow(uid, issue);
    db.db()
      .prepare(
        `UPDATE issue_user SET is_read = 0, is_closed = ?,
           is_mentioned = MAX(COALESCE(is_mentioned, 0), ?), is_assigned = MAX(COALESCE(is_assigned, 0), ?),
           milestone_id = COALESCE(?, milestone_id)
         WHERE uid = ? AND issue_id = ?`
      )
      .run(issue.is_closed ?? 0, mentioned.has(uid) ? 1 : 0, opts.assigned && issue.assignee_id === uid ? 1 : 0, issue.milestone_id ?? null, uid, issue.id);
  }
}

/** 查看工单详情后标记已读。 */
export function markIssueRead(uid: number, issueID: number): void {
  db.db().prepare('UPDATE issue_user SET is_read = 1 WHERE uid = ? AND issue_id = ?').run(uid, issueID);
}

export function unreadCount(uid: number): number {
  return (db.db().prepare('SELECT COUNT(*) AS c FROM issue_user WHERE uid = ? AND is_read = 0').get(uid) as any).c;
}
