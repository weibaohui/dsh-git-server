// dsh 服务桥：登录认证直接走 user-management 插件的 service。
//
// 注入方式（dsh 插件 service 模式）：本模块按 DSH_UM_STORE_PATH 加载
// user-management 插件的 store 模块（src/store.js，CJS），createStore 后
// 调用其公开 API（checkLogin / findUserByUsername）——与 UM 网关进程
// 完全同一代码路径。不再复刻 scrypt 校验，也不把密码同步进本库。
//
// 本库 user 表只承载「影子账号」：身份/仓库所有权/令牌归属。passwd 字段
// 永远是不可用占位（随机盐+随机哈希），任何登录路径都不校验它。
//
// 一致性：UM 网关是另一进程，users.json 的外部写入（建号/改密/禁用）
// 通过 mtime+size 指纹检测——变化即重建 store 实例（load 重读文件），
// 未变化时复用实例（checkLogin 仅付 scrypt 成本，约几十毫秒）。
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import * as dbm from '../db/db.js';

const requireCjs = createRequire(import.meta.url);

let storeMod: any = null; // user-management store 模块（一次性加载）
let storeInst: any = null; // 当前 store 实例（users.json 指纹未变时复用）
let storeStamp: string | null = null;
let storeHome: string | null = null;

export function umStorePath(): string {
  return process.env.DSH_UM_STORE_PATH || '';
}

export function umServiceEnabled(): boolean {
  return !!umStorePath();
}

/** dsh 数据根（store 的 <home>/user-management）。 */
function dshHome(): string {
  return process.env.DSH_UM_HOME ? path.resolve(process.env.DSH_UM_HOME) : path.join(os.homedir(), '.dsh');
}

/** 取可用的 store 实例；users.json 指纹变化时重建。 */
async function getStore(): Promise<any | null> {
  const modPath = umStorePath();
  if (!modPath) return null;
  try {
    if (!storeMod) storeMod = requireCjs(modPath);
    if (!storeHome) storeHome = dshHome();
    const usersFile = path.join(storeHome, 'user-management', 'users.json');
    let stamp = 'missing';
    try {
      const st = fs.statSync(usersFile);
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {}
    if (!storeInst || stamp !== storeStamp) {
      const inst = storeMod.createStore({ home: storeHome });
      await inst.load();
      storeInst = inst;
      storeStamp = stamp;
    }
    return storeInst;
  } catch (e) {
    storeInst = null;
    storeStamp = null;
    return null;
  }
}

/** 服务可用性：'ok'（store 模块可加载）| 'missing'（模块缺失）| 'disabled'。 */
export function umAvailability(): 'ok' | 'missing' | 'disabled' {
  if (!umServiceEnabled()) return 'disabled';
  try {
    fs.accessSync(umStorePath());
    return 'ok';
  } catch {
    return 'missing';
  }
}

/**
 * 登录校验（直接调 UM service 的 checkLogin）：
 *   result 'ok' → { ok: true, user }（UM publicUser：id/username/role/disabled/totpEnabled…）
 *   TOTP 账号明确拒绝（Basic/网页直登无处输入动态码）
 *   'disabled' → reason 'disabled'；'invalid' → reason 'bad-password'
 *   store 模块/用户库不可用 → unavailable（上层回退本地兜底账号）
 */
export async function umCheckLogin(username: string, password: string): Promise<{ ok: boolean; user?: any; reason?: string; unavailable?: boolean }> {
  if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
    return { ok: false };
  }
  const store = await getStore();
  if (!store) return { ok: false, unavailable: true };
  try {
    const outcome = await store.checkLogin(username, password);
    if (outcome.result === 'ok' && outcome.user) {
      if (outcome.user.totpEnabled) return { ok: false, reason: 'totp' };
      return { ok: true, user: outcome.user };
    }
    return { ok: false, reason: outcome.result === 'disabled' ? 'disabled' : 'bad-password' };
  } catch {
    return { ok: false, unavailable: true };
  }
}

/** 按 username 查 UM 用户（publicUser 形态）；服务不可用返回 null。 */
export async function umFindUser(username: string): Promise<any | null> {
  const store = await getStore();
  if (!store || typeof store.findUserByUsername !== 'function') return null;
  try {
    const u = store.findUserByUsername(username);
    return u ? { id: u.id, username: u.username, role: u.role, disabled: !!u.disabled, totpEnabled: !!u.totpSecret } : null;
  } catch {
    return null;
  }
}

/**
 * 影子开户/对齐：按 UM profile 维护本库同名行（仓库所有权/令牌归属的载体）。
 * 只同步身份与角色（UM admin → 本库管理员）；密码永不同步——passwd 为
 * 随机不可用占位，任何登录路径都不校验它（校验永远走 UM service）。
 */
export function ensureShadowUser(profile: any): any | null {
  if (!profile || !profile.username) return null;
  if (profile.disabled) return null;
  const username = String(profile.username);
  const isAdmin = profile.role === 'admin' ? 1 : 0;
  const now = Math.floor(Date.now() / 1000);
  const bootstrapName = (process.env.DSH_BOOTSTRAP_ADMIN || '').split(':')[0] || 'root';
  let user = dbm.getUserByUsername(username);
  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const unusable = createHash('sha256').update(randomBytes(32).toString('hex') + username).digest('hex');
    dbm.db().prepare(
      'INSERT INTO user (name, lower_name, email, passwd, salt, type, is_admin, created_unix, updated_unix) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)'
    ).run(username, username.toLowerCase(), `${username.toLowerCase()}@users.dsh.local`, unusable, salt, isAdmin, now, now);
  } else {
    // 既有影子账号：passwd 重置为随机不可用占位（清除历史版本同步过的密码；
    // 兜底管理员除外——它是 service 不可用时的紧急登录通道）
    const patch: string[] = [];
    const args: any[] = [];
    if ((user.is_admin === 1 ? 1 : 0) !== isAdmin) {
      patch.push('is_admin = ?');
      args.push(isAdmin);
    }
    if (username !== bootstrapName) {
      patch.push('passwd = ?', 'salt = ?');
      args.push(
        createHash('sha256').update(randomBytes(32).toString('hex') + username).digest('hex'),
        randomBytes(16).toString('hex'),
      );
    }
    if (patch.length) {
      dbm.db().prepare(`UPDATE user SET ${patch.join(', ')}, updated_unix = ? WHERE id = ?`).run(...args, now, user.id);
    }
  }
  return dbm.getUserByUsername(username) ?? null;
}
