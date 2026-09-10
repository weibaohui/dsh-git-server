import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URLSearchParams } from 'node:url';
import { conf } from './conf.js';
import { i18n, Locale } from './i18n.js';
import { TemplateSet, SafeHTML } from './gotemplate/engine.js';
import { buildFuncMap } from './gotemplate/funcs.js';
import * as db from './db/db.js';
import { getRepoByName, accessMode, AccessMode } from './db/db.js';
import { basicAuthDecode } from './authx/password.js';
import * as umBridge from './authx/um.js';
import { getAccessTokenBySHA1, touchAccessToken } from './db/db.js';
import { verifyPassword } from './authx/password.js';
// ---------------------------------------------------------------- sessions
const sessions = new Map();
function newSessionID() {
    return crypto.randomBytes(16).toString('hex');
}
export class Session {
    sid;
    data;
    isNew;
    maxAge;
    constructor(sid) {
        this.maxAge = 86400 * conf.loginRememberDays;
        const now = Date.now();
        if (sid && sessions.has(sid)) {
            const s = sessions.get(sid);
            if (s.expires > now) {
                this.sid = sid;
                this.data = s.data;
                this.isNew = false;
                s.expires = now + this.maxAge * 1000;
                return;
            }
            sessions.delete(sid);
        }
        this.sid = newSessionID();
        this.data = {};
        this.isNew = true;
        sessions.set(this.sid, { data: this.data, expires: now + this.maxAge * 1000 });
    }
    Get(key) {
        return this.data[key];
    }
    Set(key, value) {
        this.data[key] = value;
    }
    Delete(key) {
        delete this.data[key];
    }
    Clear() {
        this.data = {};
        sessions.set(this.sid, { data: this.data, expires: Date.now() + this.maxAge * 1000 });
    }
    Release() {
        sessions.set(this.sid, { data: this.data, expires: Date.now() + this.maxAge * 1000 });
    }
}
// ---------------------------------------------------------------- flash
export class Flash {
    SuccessMsg = '';
    ErrorMsg = '';
    WarningMsg = '';
    InfoMsg = '';
    values = {};
    readFromCookie(cookie) {
        if (!cookie)
            return this;
        const params = new URLSearchParams(cookie);
        for (const key of ['error', 'warning', 'info', 'success']) {
            const v = params.get(key);
            if (v === null)
                continue;
            this.values[key] = v;
            if (key === 'error')
                this.ErrorMsg = v;
            if (key === 'warning')
                this.WarningMsg = v;
            if (key === 'info')
                this.InfoMsg = v;
            if (key === 'success')
                this.SuccessMsg = v;
        }
        return this;
    }
    Success(msg) { this.values['success'] = msg; }
    Error(msg) { this.values['error'] = msg; }
    Warning(msg) { this.values['warning'] = msg; }
    Info(msg) { this.values['info'] = msg; }
    hasWrites() {
        return Object.keys(this.values).length > 0;
    }
    encoded() {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(this.values))
            params.set(k, v);
        return params.toString();
    }
}
// ---------------------------------------------------------------- context
export class Context {
    req;
    res;
    params = {};
    urlObj;
    session;
    locale;
    lang = 'en-US';
    Data = {};
    flash = new Flash();
    User = null;
    isBasicAuth = false;
    isTokenAuth = false;
    /** repo assignment */
    Repo = new RepoContext();
    Org = {};
    bodyBuffer = null;
    formObj = null;
    filesObj = null;
    rendered = false;
    pageStartTime = Date.now();
    constructor(req, res) {
        this.req = req;
        this.res = res;
    }
    init(session) {
        this.session = session;
        this.urlObj = new URL(this.req.url ?? '/', 'http://internal');
        this.Data['PageStartTime'] = new Date(this.pageStartTime);
        this.Data['TmplLoadTimes'] = () => `${Date.now() - this.pageStartTime}ms`;
        // security headers like gogs
        this.res.setHeader('X-Content-Type-Options', 'nosniff');
        this.res.setHeader('X-Frame-Options', 'deny');
    }
    // -------------------------------------------------- request accessors
    Method() {
        return (this.req.method ?? 'GET').toUpperCase();
    }
    Path() {
        return this.urlObj.pathname;
    }
    RequestURI() {
        return this.urlObj.pathname + this.urlObj.search;
    }
    Query(name) {
        return this.urlObj.searchParams.get(name) ?? '';
    }
    QueryInt(name) {
        return Number(this.Query(name)) || 0;
    }
    Params(name) {
        return this.params[name] ?? '';
    }
    ParamsInt64(name) {
        return Number(this.params[name]) || 0;
    }
    header() {
        return this.res;
    }
    Header() {
        return this.res.getHeaders();
    }
    SetHeader(name, value) {
        this.res.setHeader(name, value);
    }
    async body() {
        if (this.bodyBuffer === null) {
            const chunks = [];
            for await (const chunk of this.req)
                chunks.push(chunk);
            this.bodyBuffer = Buffer.concat(chunks);
        }
        return this.bodyBuffer;
    }
    /** Parsed body: urlencoded, JSON, or multipart (fields merged; files in c.Files). */
    async form() {
        if (this.formObj)
            return this.formObj;
        const buf = await this.body();
        const ctype = String(this.req.headers['content-type'] ?? '');
        this.formObj = {};
        if (ctype.includes('application/json')) {
            try {
                this.formObj = JSON.parse(buf.toString('utf8') || '{}');
            }
            catch {
                this.formObj = {};
            }
        }
        else if (ctype.includes('multipart/form-data')) {
            const { parseMultipart } = await import('./multipart.js');
            const { fields, files } = await parseMultipart(this.req, buf);
            this.formObj = fields;
            this.filesObj = files;
        }
        else {
            const params = new URLSearchParams(buf.toString('utf8'));
            const obj = {};
            for (const [k, v] of params.entries()) {
                if (obj[k] === undefined)
                    obj[k] = v;
                else if (Array.isArray(obj[k]))
                    obj[k].push(v);
                else
                    obj[k] = [obj[k], v];
            }
            this.formObj = obj;
        }
        return this.formObj;
    }
    Files() {
        return this.filesObj ?? [];
    }
    async FormString(name) {
        const f = await this.form();
        const v = f[name];
        if (v === undefined || v === null)
            return '';
        return String(v);
    }
    GetCookie(name) {
        const cookie = this.req.headers.cookie ?? '';
        for (const part of cookie.split(';')) {
            const idx = part.indexOf('=');
            if (idx < 0)
                continue;
            if (part.slice(0, idx).trim() === name)
                return decodeURIComponent(part.slice(idx + 1).trim());
        }
        return '';
    }
    SetCookie(name, value, maxAge, pathStr, httpOnly = true) {
        const parts = [`${name}=${encodeURIComponent(value)}`];
        parts.push(`Path=${pathStr ?? (conf.subpath || '/')}`);
        if (maxAge > 0)
            parts.push(`Max-Age=${maxAge}`);
        if (maxAge === 0)
            parts.push('Max-Age=0');
        if (conf.sessionCookieSecure)
            parts.push('Secure');
        if (httpOnly)
            parts.push('HttpOnly');
        const prev = this.res.getHeader('Set-Cookie');
        const arr = prev ? (Array.isArray(prev) ? prev.map(String) : [String(prev)]) : [];
        arr.push(parts.join('; '));
        this.res.setHeader('Set-Cookie', arr);
    }
    // -------------------------------------------------- response helpers
    Status(code) {
        this.res.statusCode = code;
    }
    JSON(status, obj) {
        this.rendered = true;
        this.res.statusCode = status;
        this.res.setHeader('Content-Type', 'application/json;charset=utf-8');
        this.res.end(JSON.stringify(obj ?? null));
    }
    JSONSuccess(obj) {
        this.JSON(200, obj);
    }
    NoContent() {
        this.rendered = true;
        this.res.statusCode = 204;
        this.res.end();
    }
    PlainText(status, text) {
        this.rendered = true;
        this.res.statusCode = status;
        this.res.setHeader('Content-Type', 'text/plain;charset=utf-8');
        this.res.end(text);
    }
    Redirect(location, status = 303) {
        this.rendered = true;
        this.res.statusCode = status;
        this.res.setHeader('Location', escapePound(location));
        this.res.end();
    }
    RedirectSubpath(location, status = 303) {
        this.Redirect(conf.subpath + location, status);
    }
    Success(tmpl) {
        this.HTML(200, tmpl);
    }
    HTML(status, tmpl) {
        this.rendered = true;
        this.Data['Lang'] = this.lang;
        this.Data['LangName'] = this.locale?.Language() ?? this.lang;
        const allLangs = i18n.languages();
        this.Data['AllLangs'] = allLangs;
        this.Data['RestLangs'] = allLangs.filter((l) => l.Lang !== this.lang);
        this.Data['i18n'] = this.locale;
        this.Data['Tr'] = (key, ...args) => this.locale.Tr(key, ...args);
        this.Data['Flash'] = this.flash;
        this.Data['ShowFooterBranding'] = conf.showFooterBranding;
        if (process.env.TPL_DEBUG && tmpl.startsWith('repo/branches')) {
            console.log('[render:dbg] %s DefaultBranch=%j', tmpl, this.Data['DefaultBranch']);
        }
        try {
            const html = templates.render(tmpl, this.Data);
            this.res.statusCode = status;
            this.res.setHeader('Content-Type', 'text/html; charset=utf-8');
            this.res.end(html);
        }
        catch (e) {
            console.error('[template error]', tmpl, e);
            this.res.statusCode = 500;
            this.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            this.res.end('Internal server error');
        }
    }
    /** gogs 404: redirect to SPA shell — we render a simple 404 page (status/404 template missing in this version) */
    NotFound() {
        // gogs 404 hands the request to the React SPA shell with status 404
        this.rendered = true;
        if (serveWebHandler) {
            serveWebHandler(this, 404);
            return;
        }
        this.res.statusCode = 404;
        this.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        this.res.end('404 page not found');
    }
    /** Hand the request to the React SPA (c.ServeWeb in gogs). */
    ServeWeb(statusCode = 200) {
        this.rendered = true;
        if (serveWebHandler) {
            serveWebHandler(this, statusCode);
            return;
        }
        this.res.statusCode = statusCode;
        this.res.end();
    }
    Error(err, msg) {
        console.error(`[ctx error] ${msg}: ${err?.stack ?? err}`);
        this.Data['Title'] = this.locale?.Tr('status.internal_server_error') ?? 'Internal Server Error';
        if (!conf.isProdMode() || this.User?.is_admin === 1) {
            this.Data['ErrorMsg'] = String(err?.message ?? err);
        }
        try {
            this.rendered = true;
            const html = templates.render('status/500', { ...this.Data, Lang: this.lang, i18n: this.locale, Flash: this.flash });
            this.res.statusCode = 500;
            this.res.setHeader('Content-Type', 'text/html; charset=utf-8');
            this.res.end(html);
        }
        catch {
            this.res.statusCode = 500;
            this.res.end('Internal server error');
        }
    }
    NotFoundOrError(err, msg) {
        if (err instanceof db.NotFoundError || err?.notFound) {
            this.NotFound();
        }
        else {
            this.Error(err, msg);
        }
    }
    HasError() {
        return !!this.Data['HasError'];
    }
    FormErr(names) {
        for (const n of names)
            this.Data['Err_' + n] = true;
    }
    Title(key) {
        this.Data['Title'] = this.locale.Tr(key);
    }
    RawTitle(s) {
        this.Data['Title'] = s;
    }
    PageIs(name) {
        this.Data['PageIs' + name] = true;
    }
    Require(name) {
        this.Data['Require' + name] = true;
    }
    async RenderWithErr(msg, tpl, form) {
        if (form)
            this.Data['Form'] = form;
        this.Data['HasError'] = true;
        this.Data['ErrorMsg'] = msg;
        this.Data['Flash'] = this.flash;
        this.Success(tpl);
    }
    Tr(key, ...args) {
        return this.locale.Tr(key, ...args);
    }
    UserID() {
        return this.User?.id ?? 0;
    }
    // auth flags
    get IsLogged() {
        return this.User !== null;
    }
    /** link of current request path (EscapePound'ed), like gogs Contexter */
    get Link() {
        return conf.subpath + this.Path().replace(/\/$/, '');
    }
}
export class RepoContext {
    Repository = null;
    Owner = null;
    AccessMode = AccessMode.NONE;
    Commit = null;
    CommitID = '';
    BranchName = '';
    TagName = '';
    TreePath = '';
    IsViewBranch = false;
    IsViewTag = false;
    IsViewCommit = false;
    PullRequest = { BaseRepo: null, Allowed: false, SameRepo: false, HeadInfo: '' };
    GitRepoDir = '';
    IsOwner() {
        return this.AccessMode >= AccessMode.OWNER;
    }
    IsAdmin() {
        return this.AccessMode >= AccessMode.ADMIN;
    }
    IsWriter() {
        return this.AccessMode >= AccessMode.WRITE;
    }
    HasAccess() {
        return this.AccessMode >= AccessMode.READ;
    }
}
/** Injected by server.ts so context can render the SPA shell. */
let serveWebHandler = null;
export function setServeWebHandler(fn) {
    serveWebHandler = fn;
}
// ---------------------------------------------------------------- template set
export const templates = new TemplateSet();
let templatesLoaded = false;
export function loadTemplates(workDir) {
    if (templatesLoaded)
        return;
    templates.funcs = buildFuncMap();
    const dir = path.join(workDir, 'templates');
    const load = (d, rel) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            const name = rel ? rel + '/' + entry.name : entry.name;
            if (entry.isDirectory())
                load(full, name);
            else if (entry.name.endsWith('.tmpl')) {
                templates.registerFile(name.slice(0, -5), fs.readFileSync(full, 'utf8'));
            }
        }
    };
    load(dir, '');
    templatesLoaded = true;
}
// ---------------------------------------------------------------- helpers
export function escapePound(str) {
    return String(str).replaceAll('%', '%25').replaceAll('#', '%23').replaceAll(' ', '%20').replaceAll('?', '%3F');
}
// ---------------------------------------------------------------- auth
/** dsh 桥运行时：启用状态 + UM 凭据映射到的本库管理员（懒解析，缓存实例）。 */
function umRuntime() {
    const enabled = umBridge.umAuthEnabled();
    return { enabled, umCheck: umBridge.umCheck, ensureAlignedUser: umBridge.ensureAlignedUser };
}
export function authenticateUserByBasic(header) {
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Basic')
        return null;
    const [uname, passwd] = basicAuthDecode(parts[1]);
    const user = db.getUserByUsername(uname);
    if (user && verifyPassword(passwd, user.salt, user.passwd)) {
        return { user, isBasic: true };
    }
    // dsh 桥：user-management 用户库（见 authx/um.ts）——同名账户拉通
    const um = umRuntime();
    if (um.enabled) {
        const check = um.umCheck(uname, passwd);
        if (check.ok) {
            const aligned = um.ensureAlignedUser(uname, passwd);
            if (aligned)
                return { user: aligned, isBasic: true };
        }
    }
    // try token in either field
    const token = getAccessTokenBySHA1(uname) ?? getAccessTokenBySHA1(passwd);
    if (token) {
        const tu = db.getUserByID(token.uid);
        if (tu)
            return { user: tu, isBasic: true };
    }
    return null;
}
export function authenticateUserByToken(sha1) {
    const token = getAccessTokenBySHA1(sha1);
    if (!token)
        return null;
    touchAccessToken(token.id);
    return db.getUserByID(token.uid);
}
// ---------------------------------------------------------------- middleware factories
export function Contexter() {
    return async (c) => {
        // i18n resolution: ?lang → cookie → Accept-Language → en-US
        const langs = i18n.languages().map((l) => l.Lang);
        let lang = '';
        const q = c.Query('lang');
        const cookieLang = c.GetCookie('lang');
        if (q && langs.includes(q)) {
            lang = q;
            c.SetCookie('lang', q, 1 << 31 - 1, '/');
        }
        else if (cookieLang && langs.includes(cookieLang)) {
            lang = cookieLang;
        }
        else {
            const accept = String(c.req.headers['accept-language'] ?? '');
            for (const part of accept.split(',')) {
                const code = part.split(';')[0].trim();
                if (langs.includes(code)) {
                    lang = code;
                    break;
                }
                const prefix = code.split('-')[0];
                const hit = langs.find((l) => l === prefix || l.startsWith(prefix + '-'));
                if (hit) {
                    lang = hit;
                    break;
                }
            }
            lang = lang || 'en-US';
        }
        c.lang = lang;
        c.locale = new Locale(lang);
        // session auth
        const uid = c.session.Get('uid');
        if (uid > 0) {
            c.User = db.getUserByID(uid);
            if (c.User && c.User.prohibit_login === 1)
                c.User = null;
        }
        // link + common data
        c.Data['Link'] = escapePound(c.Link);
        c.Data['IsLogged'] = c.IsLogged;
        c.Data['LoggedUser'] = c.User;
        c.Data['LoggedUserID'] = c.UserID();
        c.Data['LoggedUserName'] = c.User?.name ?? '';
        c.Data['IsAdmin'] = c.User?.is_admin === 1;
        c.Data['ShowRegistrationButton'] = !conf.disableRegistration;
        // server notice banner
        const noticeFile = path.join(conf.customDir, 'notice', 'banner.md');
        if (fs.existsSync(noticeFile) && fs.statSync(noticeFile).size <= 1024) {
            const { rawMarkdown } = await import('./markup.js');
            c.Data['ServerNotice'] = new SafeHTML(rawMarkdown(fs.readFileSync(noticeFile, 'utf8'), conf.subpath, {}));
        }
    };
}
/** Toggle middleware mirroring gogs context.Toggle. */
export function Toggle(opts) {
    return (c) => {
        if (c.IsLogged && c.User.prohibit_login === 1) {
            c.Data['Title'] = c.Tr('auth.prohibit_login');
            c.Success('user/auth/prohibit_login');
            return;
        }
        if (!c.IsLogged && c.RequestURI() === '/' && conf.landingURL !== '/') {
            c.RedirectSubpath(conf.landingURL);
            return;
        }
        if (opts.SignOutRequired && c.IsLogged && c.RequestURI() !== '/') {
            c.RedirectSubpath('/');
            return;
        }
        if (opts.SignInRequired) {
            if (!c.IsLogged) {
                if (c.Path().startsWith('/api/')) {
                    c.JSON(403, { message: 'Only authenticated user is allowed to call APIs.' });
                    return;
                }
                c.SetCookie('redirect_to', encodeURIComponent(conf.subpath + c.RequestURI()), 0);
                c.RedirectSubpath('/user/sign-in');
                return;
            }
            else if (!c.User.is_active && conf.requireEmailConfirmation) {
                c.RedirectSubpath('/user/activate');
                return;
            }
        }
        if (opts.AdminRequired) {
            if (c.User?.is_admin !== 1) {
                c.Status(403);
                return;
            }
            c.PageIs('Admin');
        }
    };
}
export const reqSignIn = Toggle({ SignInRequired: true });
export const ignSignIn = Toggle({ SignInRequired: conf.requireSigninView });
export const reqSignOut = Toggle({ SignOutRequired: true });
export const reqAdmin = Toggle({ SignInRequired: true, AdminRequired: true });
/** RepoAssignment middleware (args: mustBeNotBare) */
export function RepoAssignment(mustBeNotBare = false) {
    return (c) => {
        const username = c.Params(':username');
        const reponame = c.Params(':reponame');
        const owner = db.getUserByUsername(username);
        if (!owner) {
            c.NotFound();
            return;
        }
        const repo = getRepoByName(username, reponame);
        if (!repo) {
            c.NotFound();
            return;
        }
        c.Repo.Owner = owner;
        c.Repo.Repository = repo;
        c.Repo.AccessMode = accessMode(c.UserID(), repo);
        if (mustBeNotBare && repo.is_bare) {
            c.NotFound();
            return;
        }
        c.Data['Username'] = username;
        c.Data['Reponame'] = reponame;
        c.Data['IsBareRepo'] = repo.is_bare === 1;
        c.Data['RepoLink'] = conf.subpath + '/' + repo.FullName();
        c.Data['RepoRelPath'] = repo.FullName();
        c.RawTitle(repo.FullName());
        c.Data['Repository'] = repo;
        c.Data['Owner'] = repo.owner;
        c.Data['IsRepositoryOwner'] = c.Repo.IsOwner();
        c.Data['IsRepositoryAdmin'] = c.Repo.IsAdmin();
        c.Data['IsRepositoryWriter'] = c.Repo.IsWriter();
        c.Data['DisableSSH'] = conf.disableSSH;
        c.Data['DisableHTTP'] = conf.disableHTTPGit;
        c.Data['CloneLink'] = {
            HTTPS: repo.CloneURL(),
            SSH: `${conf.sshDomain === 'localhost' ? conf.domain : conf.sshDomain}:${owner.name === conf.runUser ? conf.sshPort : 22}/${repo.FullName()}.git`,
            Git: `git://${conf.domain}/${repo.FullName()}.git`,
        };
        c.Data['WikiCloneLink'] = {
            HTTPS: conf.externalURL + repo.FullName() + '.wiki.git',
            SSH: '',
            Git: '',
        };
        if (c.IsLogged) {
            c.Data['IsWatchingRepo'] = db.isWatching(c.UserID(), repo.id);
            c.Data['IsStaringRepo'] = db.isStaring(c.UserID(), repo.id);
        }
        c.Data['IsGuest'] = !c.Repo.HasAccess();
        if (!repo.is_bare) {
            c.Repo.BranchName = repo.default_branch || conf.defaultBranch;
            c.Data['BranchName'] = c.Repo.BranchName;
            c.Data['Branches'] = [];
            c.Data['BranchCount'] = 0;
        }
        if (repo.is_mirror) {
            c.Data['MirrorInterval'] = '';
            c.Data['MirrorEnablePrune'] = true;
        }
    };
}
export function RequireRepoAdmin() {
    return (c) => {
        if (!c.Repo.IsAdmin()) {
            c.NotFound();
        }
    };
}
export function RequireRepoWriter() {
    return (c) => {
        if (!c.Repo.IsWriter()) {
            c.NotFound();
        }
    };
}
/** RepoRef middleware — resolve ref from "*" param or default branch. */
export function RepoRef() {
    return async (c) => {
        const repo = c.Repo.Repository;
        if (repo.is_bare)
            return;
        const repoDir = repo.RepoPath();
        c.Repo.GitRepoDir = repoDir;
        const { getCommit, getBranches, refExists, catFileCommit } = await import('./gitx/git.js');
        let refName = '';
        let treePath = '';
        const wildcard = c.Params(':*');
        if (wildcard === '') {
            refName = repo.default_branch || conf.defaultBranch;
            if (!(await refExists(repoDir, 'refs/heads/' + refName))) {
                const branches = await getBranches(repoDir);
                refName = branches[0]?.name ?? refName;
            }
            c.Repo.Commit = await getCommit(repoDir, refName);
            c.Repo.CommitID = c.Repo.Commit?.id ?? '';
            c.Repo.IsViewBranch = true;
        }
        else {
            const parts = wildcard.split('/');
            let hasMatched = false;
            let acc = '';
            for (let i = 0; i < parts.length; i++) {
                acc = (acc ? acc + '/' : '') + parts[i];
                if ((await refExists(repoDir, 'refs/heads/' + acc)) ||
                    (await refExists(repoDir, 'refs/tags/' + acc))) {
                    if (i < parts.length - 1)
                        treePath = parts.slice(i + 1).join('/');
                    refName = acc;
                    hasMatched = true;
                    break;
                }
            }
            if (!hasMatched && parts[0].length === 40) {
                refName = parts[0];
                treePath = parts.slice(1).join('/');
            }
            if (!refName) {
                c.NotFound();
                return;
            }
            if (await refExists(repoDir, 'refs/heads/' + refName)) {
                c.Repo.IsViewBranch = true;
                c.Repo.Commit = await getCommit(repoDir, refName);
                c.Repo.CommitID = c.Repo.Commit?.id ?? '';
            }
            else if (await refExists(repoDir, 'refs/tags/' + refName)) {
                c.Repo.IsViewTag = true;
                c.Repo.Commit = await getCommit(repoDir, refName + '^{commit}');
                c.Repo.CommitID = c.Repo.Commit?.id ?? '';
            }
            else if (refName.length === 40) {
                c.Repo.IsViewCommit = true;
                c.Repo.CommitID = refName;
                c.Repo.Commit = await catFileCommit(repoDir, refName).catch(() => null);
                if (!c.Repo.Commit) {
                    c.NotFound();
                    return;
                }
            }
            else {
                c.NotFound();
                return;
            }
        }
        c.Repo.BranchName = refName;
        c.Repo.TreePath = treePath;
        c.Data['BranchName'] = refName;
        c.Data['CommitID'] = c.Repo.CommitID;
        c.Data['TreePath'] = treePath;
        c.Data['IsViewBranch'] = c.Repo.IsViewBranch;
        c.Data['IsViewTag'] = c.Repo.IsViewTag;
        c.Data['IsViewCommit'] = c.Repo.IsViewCommit;
        // pull request context
        if (c.Repo.IsWriter() || repo.enable_pulls) {
            c.Repo.PullRequest.Allowed = c.Repo.IsWriter();
            c.Data['PullRequestCtx'] = c.Repo.PullRequest;
            if (c.Repo.IsWriter()) {
                c.Data['BaseRepo'] = repo;
                c.Repo.PullRequest.BaseRepo = repo;
                c.Repo.PullRequest.SameRepo = true;
                c.Repo.PullRequest.HeadInfo = (c.Repo.Owner?.name ?? '') + ':' + refName;
            }
        }
    };
}
/** InjectParamsUser middleware: resolves :username to c.Data ContextUser. */
export function InjectParamsUser() {
    return (c) => {
        const user = db.getUserByUsername(c.Params(':username'));
        if (user === null) {
            c.NotFound();
            return;
        }
        c.Data['ContextUser'] = user;
        c.ContextUser = user;
    };
}
/** Finalize sign-in session (gogs completeSignIn). */
export function completeSignIn(c, u) {
    c.session.Set('uid', u.id);
    c.session.Set('uname', u.name);
    c.session.Delete('mfaUserID');
    c.session.Release();
    if (conf.enableLoginStatusCookie) {
        c.SetCookie(conf.loginStatusCookieName, 'true', 0);
    }
}
//# sourceMappingURL=context.js.map