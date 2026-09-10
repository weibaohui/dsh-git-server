// Git CLI wrapper mirroring gogs/git-module usage patterns from the contract
// (internal/gitx + github.com/gogs/git-module). All revs are passed after
// positional position with `-` prefixed values rejected.
import { spawn, execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
export function safeRev(rev) {
    if (!rev || rev.startsWith('-'))
        throw new Error(`invalid revision: ${rev}`);
    return rev;
}
export function runGit(dir, args, timeoutMs = 120000, extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('git', args, {
            cwd: dir || undefined,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/true', GCM_INTERACTIVE: 'Never', ...extraEnv },
        });
        const chunks = [];
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill('SIGKILL');
                reject(new Error(`git ${args[0]}: timeout after ${timeoutMs}ms`));
            }
        }, timeoutMs);
        child.stdout.on('data', (d) => chunks.push(d));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', (e) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(e);
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({ stdout: Buffer.concat(chunks), stderr, code: code ?? 0 });
        });
    });
}
export async function git(dir, ...args) {
    const r = await runGit(dir, args);
    if (r.code !== 0)
        throw new Error(`git ${args.join(' ')}: ${r.stderr.trim() || 'exit ' + r.code}`);
    return r.stdout;
}
/** Run git tolerating non-zero exit (returns null on failure). */
export async function gitOK(dir, ...args) {
    const r = await runGit(dir, args);
    return r.code === 0 ? r.stdout : null;
}
// ---------------------------------------------------------------- version
export async function gitVersion() {
    const out = await git(process.cwd(), 'version');
    return out.toString().trim().split(' ')[2] ?? '';
}
// views with Go-style exported field names for templates
const sigViews = new WeakMap();
function sigView(sig) {
    let v = sigViews.get(sig);
    if (!v) {
        v = {};
        defineAlias(v, 'Name', 'name', sig);
        defineAlias(v, 'Email', 'email', sig);
        defineAlias(v, 'When', 'when', sig);
        sigViews.set(sig, v);
    }
    return v;
}
/** String wrapper exposing .String() like Go sha1 objects. */
function shaObject(sha) {
    const obj = new String(sha);
    obj.String = () => sha;
    return obj;
}
function defineAlias(target, exported, key, src) {
    Object.defineProperty(target, exported, {
        get() {
            return (src ?? target)[key];
        },
        enumerable: false,
        configurable: true,
    });
}
function defineGetter(target, exported, fn) {
    Object.defineProperty(target, exported, {
        get: fn,
        enumerable: false,
        configurable: true,
    });
}
/** Full Go-style view of a Commit for templates: ID, Author/Committer views,
 * Summary(), ParentsCount, plus User/CommitterUser slots filled by callers. */
export function commitView(cm) {
    const v = {
        ID: shaObject(cm.id),
        id: cm.id,
        Message: cm.message,
        message: cm.message,
        Parents: cm.parents,
        ParentsCount: cm.parents.length,
        Author: sigView(cm.author),
        Committer: sigView(cm.committer),
        author: cm.author,
        committer: cm.committer,
        Summary: () => cm.Summary(),
        FullMessage: () => cm.message,
        repoDir: cm.repoDir,
    };
    return v;
}
export function Summary() {
    return '';
}
function parseSignature(line) {
    // "Name <email> 1234567890 +0800"
    const m = /^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(line.trim());
    if (!m) {
        const m2 = /^(.*) <([^>]*)>$/.exec(line.trim());
        return { name: m2?.[1] ?? line.trim(), email: m2?.[2] ?? '', when: new Date(0) };
    }
    return { name: m[1], email: m[2], when: new Date(Number(m[3]) * 1000) };
}
export function parseRawCommit(repoDir, sha, raw) {
    const [head, ...rest] = raw.split('\n\n');
    const message = rest.join('\n\n').replace(/\n$/, '');
    let tree = '';
    const parents = [];
    let author = { name: '', email: '', when: new Date(0) };
    let committer = { name: '', email: '', when: new Date(0) };
    for (const line of head.split('\n')) {
        if (line.startsWith('tree '))
            tree = line.slice(5).trim();
        else if (line.startsWith('parent '))
            parents.push(line.slice(7).trim());
        else if (line.startsWith('author '))
            author = parseSignature(line.slice(7));
        else if (line.startsWith('committer '))
            committer = parseSignature(line.slice(10));
    }
    const commit = {
        id: sha,
        author,
        committer,
        message,
        parents,
        repoDir,
        Summary() {
            const idx = message.indexOf('\n');
            return idx < 0 ? message : message.slice(0, idx);
        },
        FullMessage() {
            return message;
        },
    };
    // Go-style exported aliases for templates (.ID, .Author.Name, .Committer.When ...)
    defineGetter(commit, 'ID', () => shaObject(sha));
    defineAlias(commit, 'Message', 'message');
    defineGetter(commit, 'Author', () => sigView(commit.author));
    defineGetter(commit, 'Committer', () => sigView(commit.committer));
    return commit;
}
export async function catFileCommit(repoDir, sha) {
    const out = await git(repoDir, 'cat-file', 'commit', safeRev(sha));
    return parseRawCommit(repoDir, sha, out.toString('utf8'));
}
export async function getCommit(repoDir, rev) {
    const sha = await gitOK(repoDir, 'rev-parse', '--verify', '--end-of-options', safeRev(rev) + '^{commit}');
    if (!sha)
        return null;
    return catFileCommit(repoDir, sha.toString().trim());
}
export async function refExists(repoDir, rev) {
    const out = await gitOK(repoDir, 'rev-parse', '--verify', '--quiet', '--end-of-options', safeRev(rev));
    return out !== null;
}
/** Resolve branch → tag → 7..40 hex sha, mirroring gogs RefCommits handling. */
/** gogs RevParse semantics: resolve a branch/tag/SHA to its commit ID. */
export async function resolveRef(repoDir, ref) {
    for (const candidate of ['refs/heads/' + ref, 'refs/tags/' + ref]) {
        if (await refExists(repoDir, candidate)) {
            const out = await gitOK(repoDir, 'rev-parse', '--verify', '--end-of-options', candidate + '^{commit}');
            return out ? out.toString().trim() : null;
        }
    }
    if (/^[0-9a-f]{7,40}$/.test(ref) && (await refExists(repoDir, ref + '^{commit}')))
        return ref;
    return null;
}
export async function commitsCount(repoDir, rev) {
    const out = await gitOK(repoDir, 'rev-list', '--count', '--end-of-options', safeRev(rev), '--');
    return out ? Number(out.toString().trim()) : 0;
}
export async function commitsByPage(repoDir, rev, page, size, filePath) {
    const args = ['log', '--pretty=format:%H', `--max-count=${size}`, `--skip=${(page - 1) * size}`, '--end-of-options', safeRev(rev)];
    if (filePath)
        args.push('--', filePath);
    const out = await gitOK(repoDir, ...args);
    if (!out)
        return [];
    const shas = out.toString().trim().split('\n').filter(Boolean);
    const commits = [];
    for (const sha of shas) {
        try {
            commits.push(await catFileCommit(repoDir, sha));
        }
        catch {
            // ignore missing
        }
    }
    return commits;
}
export async function commitsAfter(repoDir, oldSha, newSha) {
    const out = await gitOK(repoDir, 'rev-list', '--end-of-options', `${oldSha}...${newSha}`, '--');
    if (!out)
        return [];
    const shas = out.toString().trim().split('\n').filter(Boolean);
    const commits = [];
    for (const sha of shas) {
        try {
            commits.push(await catFileCommit(repoDir, sha));
        }
        catch {
            // ignore
        }
    }
    return commits;
}
/** Latest commit that touched the given path. */
export async function commitByPath(repoDir, rev, treePath) {
    const out = await gitOK(repoDir, 'log', '--pretty=format:%H', '--max-count=1', '--end-of-options', safeRev(rev), '--', treePath);
    if (!out)
        return null;
    const sha = out.toString().trim();
    if (!sha)
        return null;
    return catFileCommit(repoDir, sha);
}
export async function lsTree(repoDir, treeRev, treePath) {
    let rev = safeRev(treeRev);
    if (treePath) {
        // walk down the path
        const parts = treePath.split('/').filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
            const sub = await lsTreeOnce(repoDir, rev, '');
            const found = sub?.entries.find((e) => e.name === parts[i]);
            if (!found)
                return null;
            rev = found.sha;
            if (found.type !== 'tree') {
                // blob / submodule: single-entry view, don't ls-tree a non-tree
                return {
                    sha: rev,
                    entries: [{
                            mode: found.mode,
                            type: found.type,
                            sha: found.sha,
                            name: found.name,
                            size: found.type === 'blob' ? await entrySize(repoDir, found.sha) : 0,
                        }],
                };
            }
        }
    }
    const entries = await lsTreeOnce(repoDir, rev, '');
    if (!entries)
        return null;
    return { entries: entries.entries, sha: rev };
}
async function lsTreeOnce(repoDir, rev, subPath) {
    const args = ['ls-tree', '-z', '--end-of-options', safeRev(rev)];
    if (subPath)
        args.push('--', subPath);
    const out = await gitOK(repoDir, ...args);
    if (!out)
        return null;
    const entries = [];
    const records = out.toString('utf8').split('\0').filter(Boolean);
    for (const rec of records) {
        // "<mode> <type> <sha>\t<name>"
        const tab = rec.indexOf('\t');
        if (tab < 0)
            continue;
        const meta = rec.slice(0, tab).split(/\s+/);
        const name = rec.slice(tab + 1);
        entries.push({
            mode: meta[0],
            type: meta[1],
            sha: meta[2],
            name,
            size: 0,
        });
    }
    return { entries, sha: rev };
}
export async function entrySize(repoDir, sha) {
    const out = await gitOK(repoDir, 'cat-file', '-s', sha);
    return out ? Number(out.toString().trim()) : 0;
}
export async function blobBytes(repoDir, sha, maxBytes = 0) {
    if (maxBytes > 0) {
        // read at most maxBytes by streaming through cat-file with size check
        const size = await entrySize(repoDir, sha);
        if (size > maxBytes) {
            const err = new Error('file too large');
            err.tooLarge = true;
            err.size = size;
            throw err;
        }
    }
    return git(repoDir, 'cat-file', 'blob', sha);
}
export async function getBranches(repoDir) {
    const out = await gitOK(repoDir, 'show-ref', '--heads');
    if (!out)
        return [];
    const branches = [];
    for (const line of out.toString().trim().split('\n').filter(Boolean)) {
        const [sha, ref] = line.split(/\s+/);
        const name = ref.replace('refs/heads/', '');
        try {
            const commit = await catFileCommit(repoDir, sha);
            branches.push({ name, commit });
        }
        catch {
            // ignore
        }
    }
    return branches;
}
export async function getDefaultBranch(repoDir) {
    const out = await gitOK(repoDir, 'symbolic-ref', '--short', 'HEAD');
    if (out)
        return out.toString().trim();
    return 'master';
}
export async function getTags(repoDir) {
    const out = await gitOK(repoDir, 'show-ref', '--tags');
    if (!out)
        return [];
    const tags = [];
    for (const line of out.toString().trim().split('\n').filter(Boolean)) {
        const [sha, ref] = line.split(/\s+/);
        const name = ref.replace('refs/tags/', '');
        try {
            // dereference annotated tags
            const deref = (await gitOK(repoDir, 'rev-parse', '--verify', '--end-of-options', sha + '^{commit}'))?.toString().trim() ?? sha;
            const commit = await catFileCommit(repoDir, deref);
            tags.push({ name, commit });
        }
        catch {
            // ignore
        }
    }
    return tags;
}
export async function repoDiff(repoDir, rev, base, maxFiles = 1000, maxLines = 5000) {
    let args;
    if (base) {
        args = ['diff', '--full-index', '-M', '--end-of-options', safeRev(base), safeRev(rev)];
    }
    else {
        const commit = await getCommit(repoDir, rev);
        if (!commit)
            throw new Error('commit not found: ' + rev);
        if (commit.parents.length > 0) {
            args = ['diff', '--full-index', '-M', '--end-of-options', commit.parents[0], commit.id];
        }
        else {
            args = ['show', '--full-index', '--end-of-options', commit.id];
        }
    }
    const out = await git(repoDir, ...args);
    return parseDiff(out.toString('utf8'), maxFiles, maxLines);
}
export async function diffNameOnly(repoDir, base, head) {
    const out = await gitOK(repoDir, 'diff', '--name-only', '--end-of-options', safeRev(base), safeRev(head));
    if (!out)
        return [];
    return out.toString().trim().split('\n').filter(Boolean);
}
export async function mergeBase(repoDir, base, head) {
    const out = await gitOK(repoDir, 'merge-base', '--end-of-options', safeRev(base), safeRev(head));
    return out ? out.toString().trim() : null;
}
export function parseDiff(text, maxFiles = 1000, maxLines = 5000) {
    const diff = { files: [], totalAdditions: 0, totalDeletions: 0, numFiles: 0, isIncomplete: false, Files: [], NumFiles: 0, TotalAdditions: 0, TotalDeletions: 0, IsIncomplete: false };
    if (!text)
        return diff;
    const lines = text.split('\n');
    let curFile = null;
    let curSection = null;
    let leftIdx = 0;
    let rightIdx = 0;
    let lineCount = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('diff --git ')) {
            if (diff.files.length >= maxFiles) {
                diff.isIncomplete = true;
                break;
            }
            // parse "diff --git a/x b/x"
            const rest = line.slice('diff --git '.length);
            const paths = parseDiffGitPaths(rest);
            curFile = {
                name: paths.b,
                oldName: paths.a,
                index: diff.files.length + 1,
                type: 'change',
                isBinary: false,
                sections: [],
                additions: 0,
                deletions: 0,
                isCreated: false,
                isDeleted: false,
                mode: '',
            };
            diff.files.push(curFile);
            curSection = null;
            continue;
        }
        if (!curFile)
            continue;
        if (line.startsWith('new file mode')) {
            curFile.type = 'add';
            curFile.isCreated = true;
            curFile.mode = line.slice('new file mode '.length).trim();
        }
        else if (line.startsWith('deleted file mode')) {
            curFile.type = 'delete';
            curFile.isDeleted = true;
            curFile.mode = line.slice('deleted file mode '.length).trim();
        }
        else if (line.startsWith('old mode') || line.startsWith('new mode')) {
            curFile.mode = line.split(' ').pop() ?? '';
        }
        else if (line.startsWith('rename from ')) {
            curFile.type = 'rename';
            curFile.oldName = line.slice('rename from '.length);
        }
        else if (line.startsWith('rename to ')) {
            curFile.name = line.slice('rename to '.length);
        }
        else if (line.startsWith('Binary')) {
            curFile.isBinary = true;
        }
        else if (line.startsWith('@@')) {
            if (lineCount >= maxLines) {
                diff.isIncomplete = true;
                continue;
            }
            const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
            curSection = {
                fileName: curFile.name,
                leftHunk: m?.[1] ?? '0',
                leftRange: m?.[2] ? Number(m[2]) : 1,
                rightHunk: m?.[3] ?? '0',
                rightRange: m?.[4] ? Number(m[4]) : 1,
                lines: [],
            };
            curFile.sections.push(curSection);
            leftIdx = Number(curSection.leftHunk);
            rightIdx = Number(curSection.rightHunk);
        }
        else if (curSection) {
            if (line.startsWith('+')) {
                curSection.lines.push({ leftIdx: 0, rightIdx: rightIdx++, type: 'add', content: line.slice(1) });
                curFile.additions++;
                diff.totalAdditions++;
                lineCount++;
            }
            else if (line.startsWith('-')) {
                curSection.lines.push({ leftIdx: leftIdx++, rightIdx: 0, type: 'del', content: line.slice(1) });
                curFile.deletions++;
                diff.totalDeletions++;
                lineCount++;
            }
            else if (line.startsWith(' ') || line === '') {
                curSection.lines.push({ leftIdx: leftIdx++, rightIdx: rightIdx++, type: 'same', content: line.slice(1) });
                lineCount++;
            }
            // "\ No newline at end of file" ignored
        }
    }
    diff.numFiles = diff.files.length;
    diff.Files = diff.files;
    diff.NumFiles = diff.numFiles;
    diff.TotalAdditions = diff.totalAdditions;
    diff.TotalDeletions = diff.totalDeletions;
    diff.IsIncomplete = diff.isIncomplete;
    return diff;
}
function parseDiffGitPaths(rest) {
    // handles quoted paths and plain a/... b/...
    const m = /^"((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)"$/.exec(rest);
    if (m) {
        return { a: unescapeDiffPath(m[1].slice(2)), b: unescapeDiffPath(m[2].slice(2)) };
    }
    const parts = rest.split(' ');
    return { a: (parts[0] ?? '').replace(/^a\//, ''), b: (parts[1] ?? '').replace(/^b\//, '') };
}
function unescapeDiffPath(p) {
    try {
        return JSON.parse('"' + p + '"');
    }
    catch {
        return p;
    }
}
// ---------------------------------------------------------------- archive & misc
export async function archive(repoDir, sha, format, dst, prefix) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await git(repoDir, 'archive', `--prefix=${prefix}`, `--format=${format === 'zip' ? 'zip' : 'tar.gz'}`, '-o', dst, '--end-of-options', sha);
}
export async function updateServerInfo(repoDir) {
    await gitOK(repoDir, 'update-server-info');
}
export async function countObjects(repoDir) {
    const out = await gitOK(repoDir, 'count-objects', '-v');
    if (!out)
        return { size: 0 };
    const m = /size: (\d+)/.exec(out.toString());
    const sizeDisk = /size-pack: (\d+)/.exec(out.toString());
    const kb = Number(m?.[1] ?? 0) + Number(sizeDisk?.[1] ?? 0);
    return { size: kb * 1024 };
}
export async function initBare(repoDir, defaultBranch) {
    fs.mkdirSync(repoDir, { recursive: true });
    await git(repoDir, 'init', '--bare', '--end-of-options');
    await gitOK(repoDir, 'symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`);
}
/** pkt-line for smart HTTP advertisement */
export function pktLine(data) {
    const len = Buffer.byteLength(data) + 4;
    return len.toString(16).padStart(4, '0') + data;
}
/** Execute `git <service> --stateless-rpc [--advertise-refs] <dir>` piping stdin→stdout. */
export function statelessRPC(dir, service, advertiseRefs, input, extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const args = [service, '--stateless-rpc'];
        if (advertiseRefs)
            args.push('--advertise-refs');
        args.push('.');
        const child = spawn('git', args, {
            cwd: dir,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
        });
        const chunks = [];
        child.stdout.on('data', (d) => chunks.push(d));
        child.stderr.on('data', () => { });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0)
                resolve(Buffer.concat(chunks));
            else
                reject(new Error(`${service} exited with ${code}`));
        });
        child.stdin.end(input);
    });
}
/** execFile helper for one-shot commands outside repo context */
export function execCmd(cmd, args, timeoutMs = 600000) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`${cmd} ${args.join(' ')}: ${stderr || err.message}`));
            }
            else {
                resolve(stdout);
            }
        });
    });
}
//# sourceMappingURL=git.js.map