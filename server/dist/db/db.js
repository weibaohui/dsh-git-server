// Database layer: SQLite via better-sqlite3, schema mirroring gogs.
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { conf } from '../conf.js';
import { encodePassword, randomSalt, md5 } from '../authx/password.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EmptyID = '0000000000000000000000000000000000000000';
export function nowUnix() {
    return Math.floor(Date.now() / 1000);
}
export function randomChars(n) {
    // strx.RandomChars: alphanumeric
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    const bytes = crypto.randomBytes(n);
    for (let i = 0; i < n; i++)
        out += alphabet[bytes[i] % alphabet.length];
    return out;
}
export function newUUID() {
    return crypto.randomUUID().replaceAll('-', '');
}
let sqlite = null;
export function openDB() {
    if (sqlite)
        return sqlite;
    fs.mkdirSync(path.dirname(conf.dbPath), { recursive: true });
    sqlite = new Database(conf.dbPath);
    sqlite.pragma('journal_mode = WAL');
    let schemaFile = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaFile)) {
        schemaFile = path.join(conf.workDir, 'src', 'db', 'schema.sql');
    }
    const schema = fs.readFileSync(schemaFile, 'utf8');
    sqlite.exec(schema);
    // version table single row (gogs minDBVersion 19 + 3 migrations = 22)
    const row = sqlite.prepare('SELECT version FROM version WHERE id = 1').get();
    if (!row)
        sqlite.prepare('INSERT INTO version (id, version) VALUES (1, 22)').run();
    return sqlite;
}
export function db() {
    return openDB();
}
// ---------------------------------------------------------------- errors
export class NotFoundError extends Error {
    constructor(msg = 'not found') {
        super(msg);
    }
}
export class AlreadyExistError extends Error {
    constructor(msg = 'already exist') {
        super(msg);
    }
}
export class NameNotAllowedError extends Error {
    reason;
    constructor(reason) {
        super(`name is not allowed: ${reason}`);
        this.reason = reason;
    }
}
// ---------------------------------------------------------------- reserved names
const reservedUsernames = new Set([
    '-', 'explore', 'create', 'assets', 'css', 'img', 'js', 'less', 'plugins', 'debug',
    'raw', 'install', 'api', 'avatar', 'user', 'org', 'help', 'stars', 'issues', 'pulls',
    'commits', 'repo', 'template', 'admin', 'new', '.', '..',
]);
const reservedUsernamePatterns = ['*.keys'];
const reservedRepoNames = new Set([
    '-', '.', '..', 'explore', 'create', 'assets', 'css', 'img', 'js', 'less', 'plugins',
    'debug', 'raw', 'install', 'api', 'avatar', 'user', 'org', 'help', 'stars', 'issues',
    'pulls', 'commits', 'repo', 'template', 'admin', 'new', 'search', 'serviceworker.js',
    'manifest.json', 'api', 'metrics',
]);
export function isUsernameAllowed(name) {
    const n = name.trim().toLowerCase();
    if (!n)
        return false;
    if (reservedUsernames.has(n))
        return false;
    for (const p of reservedUsernamePatterns) {
        if ((p[0] === '*' && n.endsWith(p.slice(1))) || (p.endsWith('*') && n.startsWith(p.slice(0, -1))))
            return false;
    }
    return true;
}
export function isRepoNameAllowed(name) {
    const n = name.trim().toLowerCase();
    if (!n)
        return false;
    return !reservedRepoNames.has(n);
}
// ---------------------------------------------------------------- model wrappers
// Provide the methods that gogs templates and handlers call on models.
export class User {
    constructor(row) {
        Object.assign(this, row);
        goAlias(this);
    }
    id;
    lower_name;
    name;
    full_name;
    email;
    passwd;
    salt;
    rands;
    is_admin;
    is_active;
    type; // 0=individual 1=organization
    avatar;
    avatar_email;
    use_custom_avatar;
    num_repos;
    num_followers;
    num_following;
    num_stars;
    created_unix;
    updated_unix;
    prohibit_login;
    max_repo_creation;
    description;
    location;
    website;
    get IsOrganization() {
        return this.type === 1;
    }
    DisplayName() {
        return this.full_name || this.name;
    }
    ShortName(length) {
        const name = this.DisplayName();
        return name.length > length ? name.slice(0, length - 2) + '…' : name;
    }
    HomeURLPath() {
        return conf.subpath + '/' + this.name;
    }
    /** gogs User.Link / HomeLink */
    Link() {
        return this.HomeURLPath();
    }
    HomeLink() {
        return this.HomeURLPath();
    }
    HTMLURL() {
        return conf.externalURL + this.name;
    }
    get NumOpenIssues() {
        return 0;
    }
    /** gogs User.Created / Updated (time.Time views over unix columns) */
    get Created() {
        return new Date((this.created_unix ?? 0) * 1000);
    }
    /** gogs User.GetOrganizationCount */
    GetOrganizationCount() {
        const r = db().prepare('SELECT COUNT(*) AS c FROM org_user WHERE uid = ?').get(this.id);
        return r?.c ?? 0;
    }
    NumRepos() {
        return this.num_repos;
    }
    get Updated() {
        return new Date((this.updated_unix ?? 0) * 1000);
    }
    AvatarURLPath() {
        if (this.id <= 0)
            return conf.subpath + '/img/avatar_default.png';
        if (this.use_custom_avatar) {
            return `${conf.subpath}/user/avatars/${this.id}`;
        }
        if (conf.disableGravatar) {
            return conf.subpath + '/img/avatar_default.png';
        }
        return `${conf.subpath}/user/avatar/${this.avatar}`;
    }
    AvatarURL() {
        const link = this.AvatarURLPath();
        if (link[0] === '/' && link[1] !== '/') {
            return conf.externalURL + link.slice(conf.subpath ? conf.subpath.length + 1 : 1);
        }
        return link;
    }
    CanCreateOrganization() {
        return this.is_admin === 1;
    }
}
export class Repository {
    constructor(row) {
        Object.assign(this, row);
        goAlias(this);
    }
    id;
    owner_id;
    lower_name;
    name;
    description;
    website;
    default_branch;
    is_private;
    is_bare;
    is_mirror;
    is_fork;
    fork_id;
    is_unlisted;
    size;
    num_watches;
    num_stars;
    num_forks;
    num_issues;
    num_closed_issues;
    num_pulls;
    num_closed_pulls;
    num_milestones;
    num_closed_milestones;
    enable_issues;
    enable_wiki;
    allow_public_wiki;
    enable_pulls;
    pulls_ignore_whitespace;
    pulls_allow_rebase;
    allow_public_issues;
    enable_external_tracker;
    external_tracker_url;
    external_tracker_format;
    external_tracker_style;
    created_unix;
    updated_unix;
    owner;
    RepoPath() {
        return repoPath(this.OwnerName(), this.name);
    }
    /** gogs Repository.Link */
    Link() {
        return conf.subpath + '/' + this.FullName();
    }
    get NumOpenIssues() {
        return (this.num_issues ?? 0) - (this.num_closed_issues ?? 0);
    }
    /** gogs Repository.Created / Updated (time.Time views over unix columns) */
    get Created() {
        return new Date((this.created_unix ?? 0) * 1000);
    }
    get Updated() {
        return new Date((this.updated_unix ?? 0) * 1000);
    }
    get NumOpenPulls() {
        return (this.num_pulls ?? 0) - (this.num_closed_pulls ?? 0);
    }
    get NumClosedIssues() {
        return this.num_closed_issues ?? 0;
    }
    get NumClosedPulls() {
        return this.num_closed_pulls ?? 0;
    }
    AllowsPulls() {
        return this.enable_pulls === 1;
    }
    AllowsIssues() {
        return this.enable_issues === 1;
    }
    IsPartialPublic() {
        return !this.is_private;
    }
    CanGuestViewIssues() {
        return this.enable_issues === 1 && this.allow_public_issues === 1;
    }
    CanGuestViewWiki() {
        return this.enable_wiki === 1 && this.allow_public_wiki === 1;
    }
    OwnerName() {
        return this.owner ? this.owner.name : this.lower_name;
    }
    FullName() {
        return `${this.OwnerName()}/${this.name}`;
    }
    HTMLURL() {
        return conf.externalURL + this.FullName();
    }
    CloneURL() {
        return conf.externalURL + this.FullName() + '.git';
    }
    WikiPath() {
        return wikiPath(this.OwnerName(), this.name);
    }
    ComposeMetas() {
        const metas = { repoLink: conf.subpath + '/' + this.FullName() };
        if (this.enable_external_tracker) {
            metas['format'] = this.external_tracker_format;
            metas['user'] = this.OwnerName();
            metas['repo'] = this.name;
            metas['style'] = this.external_tracker_style ?? '';
            metas['externalTrackerURL'] = this.external_tracker_url ?? '';
        }
        return metas;
    }
}
// ---------------------------------------------------------------- disk layout
import { repoPath, wikiPath, userPath } from '../gitx/paths.js';
export { repoPath, wikiPath, userPath };
// ---------------------------------------------------------------- users
export function getUserByID(id) {
    const row = db().prepare('SELECT * FROM user WHERE id = ?').get(id);
    return row ? new User(row) : null;
}
export function getUserByUsername(name) {
    const row = db().prepare('SELECT * FROM user WHERE lower_name = ?').get(name.toLowerCase());
    return row ? new User(row) : null;
}
export function getUserByEmail(email) {
    email = email.toLowerCase().trim();
    const row = db().prepare('SELECT * FROM user WHERE lower(email) = ?').get(email);
    if (row)
        return new User(row);
    const ea = db().prepare('SELECT uid FROM email_address WHERE lower(email) = ? AND is_activated = 1').get(email);
    if (ea)
        return getUserByID(ea.uid);
    return null;
}
export function createUser(username, email, opts = {}) {
    username = username.trim();
    if (!isUsernameAllowed(username))
        throw new NameNotAllowedError('reserved');
    if (getUserByUsername(username))
        throw new AlreadyExistError(`user already exists [name: ${username}]`);
    email = email.toLowerCase().trim();
    if (email && getUserByEmail(email))
        throw new AlreadyExistError(`email has been used [email: ${email}]`);
    const salt = randomSalt();
    const now = nowUnix();
    const info = db()
        .prepare(`INSERT INTO user (lower_name, name, full_name, email, passwd, login_source, login_name,
        type, location, website, rands, salt, created_unix, updated_unix, max_repo_creation,
        is_active, is_admin, avatar, avatar_email, use_custom_avatar,
        num_followers, num_following, num_stars, num_repos, num_teams, num_members)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(username.toLowerCase(), username, opts.fullName ?? '', email, encodePassword(opts.password ?? '', salt), opts.loginSource ?? 0, opts.loginName ?? '', 0, opts.location ?? '', opts.website ?? '', randomSalt(), salt, now, now, -1, opts.activated ? 1 : 0, opts.admin ? 1 : 0, md5(email), email, 0, 0, 0, 0, 0, 0, 0);
    const user = getUserByID(Number(info.lastInsertRowid));
    if (email) {
        db()
            .prepare('INSERT INTO email_address (uid, email, is_activated) VALUES (?,?,?)')
            .run(user.id, email, opts.activated ? 1 : 0);
    }
    return user;
}
export function createOrganization(doer, username, opts) {
    if (!isUsernameAllowed(username))
        throw new NameNotAllowedError('reserved');
    if (getUserByUsername(username))
        throw new AlreadyExistError(`user already exists [name: ${username}]`);
    const now = nowUnix();
    const salt = randomSalt();
    const info = db()
        .prepare(`INSERT INTO user (lower_name, name, full_name, email, passwd, type, description, location,
        website, rands, salt, created_unix, updated_unix, max_repo_creation, is_active,
        avatar, avatar_email, num_teams, num_members)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(username.toLowerCase(), username, opts.fullName ?? '', doer.email, // orgs reuse creator email as placeholder like gogs
    encodePassword(randomSalt(), salt), 1, opts.description ?? '', opts.location ?? '', opts.website ?? '', randomSalt(), salt, now, now, -1, 1, md5(username + '@localhost'), username + '@localhost', 1, // owners team
    1);
    const org = getUserByID(Number(info.lastInsertRowid));
    // owners team
    const team = db()
        .prepare('INSERT INTO team (org_id, lower_name, name, description, authorize, num_repos, num_members) VALUES (?,?,?,?,?,0,1)')
        .run(org.id, 'owners', 'Owners', '', 4);
    db().prepare('INSERT INTO team_user (org_id, team_id, uid) VALUES (?,?,?)').run(org.id, Number(team.lastInsertRowid), doer.id);
    db().prepare('INSERT INTO org_user (uid, org_id, is_public, is_owner, num_teams) VALUES (?,?,0,1,1)').run(doer.id, org.id);
    return org;
}
export function updateUserColumns(id, cols) {
    const keys = Object.keys(cols);
    if (!keys.length)
        return;
    const setSql = keys.map((k) => `${k} = ?`).join(', ');
    db()
        .prepare(`UPDATE user SET ${setSql}, updated_unix = ? WHERE id = ?`)
        .run(...keys.map((k) => cols[k]), nowUnix(), id);
}
// ---------------------------------------------------------------- repositories
export function getRepoByID(id) {
    const row = db().prepare('SELECT * FROM repository WHERE id = ?').get(id);
    if (!row)
        return null;
    const repo = new Repository(row);
    repo.owner = getUserByID(repo.owner_id) ?? undefined;
    return repo;
}
export function getRepoByName(ownerName, repoName) {
    const owner = getUserByUsername(ownerName);
    if (!owner)
        return null;
    const row = db()
        .prepare('SELECT * FROM repository WHERE owner_id = ? AND lower_name = ?')
        .get(owner.id, repoName.toLowerCase());
    if (!row)
        return null;
    const repo = new Repository(row);
    repo.owner = owner;
    return repo;
}
export function getRepoByOwnerAndName(owner, repoName) {
    const row = db()
        .prepare('SELECT * FROM repository WHERE owner_id = ? AND lower_name = ?')
        .get(owner.id, repoName.toLowerCase());
    if (!row)
        return null;
    const repo = new Repository(row);
    repo.owner = owner;
    return repo;
}
/** dsh 桥用：取第一个管理员（映射 UM 凭据的目标账号）。 */
export function getFirstAdmin() {
    const r = db().prepare('SELECT * FROM user WHERE type = 0 AND is_admin = 1 ORDER BY id LIMIT 1').get();
    return r ? new User(r) : null;
}
export function updateRepoColumns(id, cols) {
    const keys = Object.keys(cols);
    if (!keys.length)
        return;
    const setSql = keys.map((k) => `${k} = ?`).join(', ');
    db()
        .prepare(`UPDATE repository SET ${setSql}, updated_unix = ? WHERE id = ?`)
        .run(...keys.map((k) => cols[k]), nowUnix(), id);
}
export function countUserRepos(ownerID) {
    const r = db().prepare('SELECT COUNT(*) AS c FROM repository WHERE owner_id = ?').get(ownerID);
    return r.c;
}
export function listReposByOwner(ownerID) {
    return db().prepare('SELECT * FROM repository WHERE owner_id = ? ORDER BY updated_unix DESC').all(ownerID).map((r) => {
        const repo = new Repository(r);
        repo.owner = getUserByID(repo.owner_id) ?? undefined;
        return repo;
    });
}
/** Repositories visible to a viewer across all owners (explore). */
export function listVisibleRepos(viewerID, keyword, page, pageSize, ownerID = 0) {
    const kw = `%${keyword.toLowerCase()}%`;
    let visSQL;
    const visArgs = [];
    if (viewerID > 0) {
        visSQL = `(r.is_private = 0 OR r.owner_id = ? OR r.id IN (
        SELECT repo_id FROM collaboration WHERE user_id = ?
      ) OR r.owner_id IN (
        SELECT org_id FROM org_user WHERE uid = ?
      ) OR r.id IN (
        SELECT tr.repo_id FROM team_repo tr
          JOIN team_user tu ON tu.team_id = tr.team_id WHERE tu.uid = ?
      ))`;
        visArgs.push(viewerID, viewerID, viewerID, viewerID);
    }
    else {
        visSQL = 'r.is_private = 0';
    }
    const ownerSQL = ownerID > 0 ? ' AND r.owner_id = ?' : '';
    const ownerArgs = ownerID > 0 ? [ownerID] : [];
    const where = `WHERE ${visSQL} AND (r.is_bare = 0 OR 1) AND lower(r.lower_name) LIKE ? AND r.is_mirror = 0${ownerSQL}`;
    const total = db()
        .prepare(`SELECT COUNT(*) AS c FROM repository r ${where.replace(/r\./g, 'r.')}`)
        .get(...visArgs, kw, ...ownerArgs).c;
    const rows = db()
        .prepare(`SELECT r.* FROM repository r ${where} ORDER BY r.updated_unix DESC LIMIT ? OFFSET ?`)
        .all(...visArgs, kw, ...ownerArgs, pageSize, (page - 1) * pageSize);
    const repos = rows.map((r) => {
        const repo = new Repository(r);
        repo.owner = getUserByID(repo.owner_id) ?? undefined;
        return repo;
    });
    return { total, repos };
}
// ---------------------------------------------------------------- access / permissions
export const AccessMode = { NONE: 0, READ: 1, WRITE: 2, ADMIN: 3, OWNER: 4 };
export function accessMode(userID, repo) {
    if (userID <= 0)
        return repo.is_private ? AccessMode.NONE : AccessMode.READ;
    if (repo.owner_id === userID)
        return AccessMode.OWNER;
    if (repo.owner && repo.owner.type === 1) {
        // organization ownership
        const ou = db().prepare('SELECT 1 FROM org_user WHERE uid = ? AND org_id = ? AND is_owner = 1').get(userID, repo.owner_id);
        if (ou)
            return AccessMode.OWNER;
        // team access
        const teamMode = db()
            .prepare(`SELECT MAX(t.authorize) AS m FROM team t
           JOIN team_repo tr ON tr.team_id = t.id
           JOIN team_user tu ON tu.team_id = t.id
         WHERE tu.uid = ? AND tr.repo_id = ?`)
            .get(userID, repo.id);
        if (teamMode?.m > 0)
            return Math.max(teamMode.m, AccessMode.READ);
        const member = db().prepare('SELECT 1 FROM org_user WHERE uid = ? AND org_id = ?').get(userID, repo.owner_id);
        if (member && !repo.is_private)
            return AccessMode.READ;
    }
    const col = db().prepare('SELECT mode FROM collaboration WHERE user_id = ? AND repo_id = ?').get(userID, repo.id);
    if (col)
        return col.mode;
    if (!repo.is_private)
        return AccessMode.READ;
    return AccessMode.NONE;
}
export function hasAccess(userID, repo) {
    return accessMode(userID, repo) >= AccessMode.READ;
}
// ---------------------------------------------------------------- orgs & teams
export function listUserOrgs(userID, all) {
    // upstream GetOrgsByUserID(all=false) exposes only public memberships
    let sql = `SELECT u.* FROM user u JOIN org_user ou ON ou.org_id = u.id WHERE u.type = 1 AND ou.uid = ?`;
    const args = [userID];
    if (!all)
        sql += ` AND ou.is_public = 1`;
    const rows = db().prepare(sql).all(...args);
    return rows.map((r) => new User(r));
}
export function listOrgMembers(orgID, all) {
    let sql = `SELECT u.* FROM user u JOIN org_user ou ON ou.uid = u.id WHERE ou.org_id = ?`;
    if (!all)
        sql += ' AND ou.is_public = 1';
    return db().prepare(sql).all(orgID).map((r) => new User(r));
}
export function isOrgMember(userID, orgID) {
    return !!db().prepare('SELECT 1 FROM org_user WHERE uid = ? AND org_id = ?').get(userID, orgID);
}
export function isOrgOwner(userID, orgID) {
    return !!db().prepare('SELECT 1 FROM org_user WHERE uid = ? AND org_id = ? AND is_owner = 1').get(userID, orgID);
}
export function getTeamByID(id) {
    return db().prepare('SELECT * FROM team WHERE id = ?').get(id) ?? null;
}
export function getTeamByName(orgID, name) {
    return db().prepare('SELECT * FROM team WHERE org_id = ? AND lower_name = ?').get(orgID, name.toLowerCase()) ?? null;
}
export function listTeamsByOrg(orgID) {
    return db().prepare('SELECT * FROM team WHERE org_id = ? ORDER BY name').all(orgID);
}
export function listTeamMembers(teamID) {
    return db().prepare('SELECT u.* FROM user u JOIN team_user tu ON tu.uid = u.id WHERE tu.team_id = ?').all(teamID).map((r) => new User(r));
}
export function listTeamRepos(teamID) {
    return db().prepare('SELECT r.* FROM repository r JOIN team_repo tr ON tr.repo_id = r.id WHERE tr.team_id = ?').all(teamID).map((r) => {
        const repo = new Repository(r);
        repo.owner = getUserByID(repo.owner_id) ?? undefined;
        return repo;
    });
}
// ---------------------------------------------------------------- follows / stars / watches
export function isFollowing(userID, targetID) {
    return !!db().prepare('SELECT 1 FROM follow WHERE user_id = ? AND follow_id = ?').get(userID, targetID);
}
export function followUser(userID, targetID) {
    if (userID === targetID || isFollowing(userID, targetID))
        return;
    db().prepare('INSERT INTO follow (user_id, follow_id) VALUES (?,?)').run(userID, targetID);
    db().prepare('UPDATE user SET num_following = num_following + 1 WHERE id = ?').run(userID);
    db().prepare('UPDATE user SET num_followers = num_followers + 1 WHERE id = ?').run(targetID);
}
export function unfollowUser(userID, targetID) {
    if (!isFollowing(userID, targetID))
        return;
    db().prepare('DELETE FROM follow WHERE user_id = ? AND follow_id = ?').run(userID, targetID);
    db().prepare('UPDATE user SET num_following = num_following - 1 WHERE id = ?').run(userID);
    db().prepare('UPDATE user SET num_followers = num_followers - 1 WHERE id = ?').run(targetID);
}
export function listFollowers(userID, page, size) {
    return db()
        .prepare('SELECT u.* FROM user u JOIN follow f ON f.user_id = u.id WHERE f.follow_id = ? LIMIT ? OFFSET ?')
        .all(userID, size, (page - 1) * size).map((r) => new User(r));
}
export function listFollowing(userID, page, size) {
    return db()
        .prepare('SELECT u.* FROM user u JOIN follow f ON f.follow_id = u.id WHERE f.user_id = ? LIMIT ? OFFSET ?')
        .all(userID, size, (page - 1) * size).map((r) => new User(r));
}
export function isWatching(userID, repoID) {
    return !!db().prepare('SELECT 1 FROM watch WHERE user_id = ? AND repo_id = ?').get(userID, repoID);
}
export function isStaring(userID, repoID) {
    return !!db().prepare('SELECT 1 FROM star WHERE uid = ? AND repo_id = ?').get(userID, repoID);
}
export function watchRepo(userID, repoID, watch) {
    if (watch && !isWatching(userID, repoID)) {
        db().prepare('INSERT INTO watch (user_id, repo_id) VALUES (?,?)').run(userID, repoID);
        db().prepare('UPDATE repository SET num_watches = num_watches + 1 WHERE id = ?').run(repoID);
    }
    else if (!watch && isWatching(userID, repoID)) {
        db().prepare('DELETE FROM watch WHERE user_id = ? AND repo_id = ?').run(userID, repoID);
        db().prepare('UPDATE repository SET num_watches = num_watches - 1 WHERE id = ?').run(repoID);
    }
}
export function starRepo(userID, repoID, star) {
    if (star && !isStaring(userID, repoID)) {
        db().prepare('INSERT INTO star (uid, repo_id) VALUES (?,?)').run(userID, repoID);
        db().prepare('UPDATE repository SET num_stars = num_stars + 1 WHERE id = ?').run(repoID);
        db().prepare('UPDATE user SET num_stars = num_stars + 1 WHERE id = ?').run(userID);
    }
    else if (!star && isStaring(userID, repoID)) {
        db().prepare('DELETE FROM star WHERE uid = ? AND repo_id = ?').run(userID, repoID);
        db().prepare('UPDATE repository SET num_stars = num_stars - 1 WHERE id = ?').run(repoID);
        db().prepare('UPDATE user SET num_stars = num_stars - 1 WHERE id = ?').run(userID);
    }
}
export function listStarredRepos(userID) {
    return db().prepare('SELECT r.* FROM repository r JOIN star s ON s.repo_id = r.id WHERE s.uid = ?').all(userID).map((r) => {
        const repo = new Repository(r);
        repo.owner = getUserByID(repo.owner_id) ?? undefined;
        return repo;
    });
}
// ---------------------------------------------------------------- access tokens
export function getAccessTokenBySHA1(sha1) {
    return db().prepare('SELECT * FROM access_token WHERE sha1 = ?').get(sha1) ?? null;
}
export function touchAccessToken(id) {
    db().prepare('UPDATE access_token SET updated_unix = ? WHERE id = ?').run(nowUnix(), id);
}
export function listAccessTokens(uid) {
    return db().prepare('SELECT * FROM access_token WHERE uid = ? ORDER BY id ASC').all(uid);
}
// ---------------------------------------------------------------- notifications for dashboard
export function countUnreadIssues(userID) {
    const r = db()
        .prepare('SELECT COUNT(*) AS c FROM issue_user WHERE uid = ? AND is_closed = 0 AND is_read = 0')
        .get(userID);
    return r.c;
}
// ---------------------------------------------------------------- webhooks
export function updateWebhookLastStatus(id, status) {
    db().prepare('UPDATE webhook SET last_status = ? WHERE id = ?').run(status, id);
}
export function listWebhooks(repoID) {
    return db().prepare('SELECT * FROM webhook WHERE repo_id = ? ORDER BY id DESC').all(repoID);
}
export function getWebhookByID(repoID, id) {
    return db().prepare('SELECT * FROM webhook WHERE id = ? AND (repo_id = ? OR org_id = ?)').get(id, repoID, repoID) ?? null;
}
// ---------------------------------------------------------------- collaborations
export function listCollaborations(repoID) {
    return db().prepare('SELECT * FROM collaboration WHERE repo_id = ?').all(repoID);
}
export function getCollaboration(repoID, userID) {
    return db().prepare('SELECT * FROM collaboration WHERE repo_id = ? AND user_id = ?').get(repoID, userID) ?? null;
}
// ---------------------------------------------------------------- SSH keys
export function listPublicKeys(ownerID) {
    return db().prepare('SELECT * FROM public_key WHERE owner_id = ? AND type = 1 ORDER BY id DESC').all(ownerID);
}
export function getPublicKeyByID(id) {
    return db().prepare('SELECT * FROM public_key WHERE id = ?').get(id) ?? null;
}
// ---------------------------------------------------------------- issues
export function getIssueByIndex(repoID, index) {
    return db().prepare('SELECT * FROM issue WHERE repo_id = ? AND "index" = ?').get(repoID, index) ?? null;
}
export function getIssueByID(id) {
    return db().prepare('SELECT * FROM issue WHERE id = ?').get(id) ?? null;
}
export function maxIssueIndex(repoID) {
    const r = db().prepare('SELECT MAX("index") AS m FROM issue WHERE repo_id = ?').get(repoID);
    return r.m ?? 0;
}
export function listIssues(repoID, isClosed, page, size) {
    let where = 'repo_id = ?';
    const args = [repoID];
    if (isClosed !== null) {
        where += ' AND is_closed = ?';
        args.push(isClosed);
    }
    const total = db().prepare(`SELECT COUNT(*) AS c FROM issue WHERE ${where}`).get(...args).c;
    const rows = db()
        .prepare(`SELECT * FROM issue WHERE ${where} ORDER BY created_unix DESC LIMIT ? OFFSET ?`)
        .all(...args, size, (page - 1) * size);
    return { total, issues: rows };
}
export function updateIssueColumns(id, cols) {
    const keys = Object.keys(cols);
    if (!keys.length)
        return;
    const setSql = keys.map((k) => `${k} = ?`).join(', ');
    db().prepare(`UPDATE issue SET ${setSql}, updated_unix = ? WHERE id = ?`).run(...keys.map((k) => cols[k]), nowUnix(), id);
}
export function refreshIssueCounts(repoID) {
    db().prepare(`UPDATE repository SET
       num_issues = (SELECT COUNT(*) FROM issue WHERE repo_id = repository.id AND is_pull = 0),
       num_closed_issues = (SELECT COUNT(*) FROM issue WHERE repo_id = repository.id AND is_pull = 0 AND is_closed = 1),
       num_pulls = (SELECT COUNT(*) FROM issue WHERE repo_id = repository.id AND is_pull = 1),
       num_closed_pulls = (SELECT COUNT(*) FROM issue WHERE repo_id = repository.id AND is_pull = 1 AND is_closed = 1)
     WHERE id = ?`).run(repoID);
}
// ---------------------------------------------------------------- comments
export function listComments(issueID) {
    return db().prepare('SELECT * FROM comment WHERE issue_id = ? ORDER BY id ASC').all(issueID);
}
export function getCommentByID(id) {
    return db().prepare('SELECT * FROM comment WHERE id = ?').get(id) ?? null;
}
// ---------------------------------------------------------------- labels
export function listLabels(repoID) {
    return db().prepare('SELECT * FROM label WHERE repo_id = ? ORDER BY id ASC').all(repoID);
}
export function getLabelByID(repoID, id) {
    return db().prepare('SELECT * FROM label WHERE id = ? AND repo_id = ?').get(id, repoID) ?? null;
}
export function getLabelByName(repoID, name) {
    return db().prepare('SELECT * FROM label WHERE name = ? AND repo_id = ?').get(name, repoID) ?? null;
}
export function listIssueLabels(issueID) {
    return db().prepare('SELECT l.* FROM label l JOIN issue_label il ON il.label_id = l.id WHERE il.issue_id = ? ORDER BY l.id').all(issueID);
}
// ---------------------------------------------------------------- milestones
export function listMilestones(repoID, isClosed) {
    if (isClosed === null) {
        return db().prepare('SELECT * FROM milestone WHERE repo_id = ? ORDER BY deadline_unix ASC, id ASC').all(repoID);
    }
    return db().prepare('SELECT * FROM milestone WHERE repo_id = ? AND is_closed = ? ORDER BY deadline_unix ASC').all(repoID, isClosed);
}
export function getMilestoneByID(repoID, id) {
    return db().prepare('SELECT * FROM milestone WHERE id = ? AND repo_id = ?').get(id, repoID) ?? null;
}
export function refreshMilestoneCounts(repoID) {
    db().prepare(`UPDATE repository SET
       num_milestones = (SELECT COUNT(*) FROM milestone WHERE repo_id = repository.id AND is_closed = 0),
       num_closed_milestones = (SELECT COUNT(*) FROM milestone WHERE repo_id = repository.id AND is_closed = 1)
     WHERE id = ?`).run(repoID);
}
// ---------------------------------------------------------------- releases
export function listReleases(repoID) {
    return db().prepare('SELECT * FROM release WHERE repo_id = ? ORDER BY created_unix DESC').all(repoID);
}
export function getReleaseByID(repoID, id) {
    return db().prepare('SELECT * FROM release WHERE id = ? AND repo_id = ?').get(id, repoID) ?? null;
}
// ---------------------------------------------------------------- email addresses
export function listEmailAddresses(uid) {
    return db().prepare('SELECT * FROM email_address WHERE uid = ? ORDER BY id').all(uid);
}
export function getEmailAddress(email) {
    return db().prepare('SELECT * FROM email_address WHERE lower(email) = ?').get(email.toLowerCase()) ?? null;
}
// ---------------------------------------------------------------- notices (admin)
export function createNotice(description) {
    db().prepare('INSERT INTO notice (type, description, created_unix) VALUES (1, ?, ?)').run(description, nowUnix());
}
export function listNotices(page, size) {
    const total = db().prepare('SELECT COUNT(*) AS c FROM notice').get().c;
    const rows = db().prepare('SELECT * FROM notice ORDER BY id DESC LIMIT ? OFFSET ?').all(size, (page - 1) * size);
    return { total, notices: rows };
}
// ---------------------------------------------------------------- Go field aliasing
// Gogs templates read exported Go fields (`.Repository.Name`, `.Owner.AvatarURLPath`).
// goAlias adds uppercase aliases over snake_case row columns plus method shims.
/** Go initialism exports (ID not Id, URL not Url, ...). */
const GO_INITIALISMS = {
    id: 'ID', ids: 'IDs', uid: 'UID', uids: 'UIDs', url: 'URL', urls: 'URLs',
    uri: 'URI', api: 'API', ssh: 'SSH', http: 'HTTP', https: 'HTTPS', html: 'HTML',
    ssl: 'SSL', tls: 'TLS', ip: 'IP', uuid: 'UUID', json: 'JSON', sha: 'SHA', ok: 'OK',
};
function capSegment(seg) {
    if (GO_INITIALISMS[seg.toLowerCase()])
        return GO_INITIALISMS[seg.toLowerCase()];
    return seg[0].toUpperCase() + seg.slice(1);
}
function goExport(key) {
    if (key.includes('_')) {
        return key.split('_').map(capSegment).join('');
    }
    return capSegment(key);
}
/** Unix-second columns that templates read as time.Time. */
const GO_TIME_COLUMNS = {
    created_unix: 'Created',
    updated_unix: 'Updated',
    merged_unix: 'Merged',
    closed_date_unix: 'ClosedDate',
    deadline_unix: 'Deadline',
    next_update_unix: 'NextUpdate',
    updated_unix_created: 'Updated',
};
export function goAlias(row) {
    for (const key of Object.keys(row)) {
        // time columns: expose as Date under their Go time.Time field name
        if (GO_TIME_COLUMNS[key] && !(GO_TIME_COLUMNS[key] in row)) {
            const exported = GO_TIME_COLUMNS[key];
            Object.defineProperty(row, exported, {
                get() {
                    const v = this[key];
                    return v ? new Date(v * 1000) : new Date(0);
                },
                set(unix) {
                    this[key] = unix;
                },
                enumerable: false,
                configurable: true,
            });
            continue;
        }
        if (key.includes('_')) {
            const exported = goExport(key);
            if (!(exported in row)) {
                Object.defineProperty(row, exported, {
                    get() {
                        return this[key];
                    },
                    set(v) {
                        this[key] = v;
                    },
                    enumerable: false,
                    configurable: true,
                });
            }
        }
        else {
            const exported = goExport(key);
            if (!(exported in row)) {
                Object.defineProperty(row, exported, {
                    get() {
                        return this[key];
                    },
                    set(v) {
                        this[key] = v;
                    },
                    enumerable: false,
                    configurable: true,
                });
            }
        }
    }
    return row;
}
//# sourceMappingURL=db.js.map