// Two-factor authentication: TOTP (RFC 6238), AES-GCM secret storage compatible
// with gogs cryptox, and recovery codes.
import * as crypto from 'node:crypto';
import * as db from './db/db.js';
import { conf } from './conf.js';
import { randomChars } from './db/db.js';
// ---------------------------------------------------------------- crypto (cryptox compat)
function md5Bytes(str) {
    return crypto.createHash('md5').update(str).digest();
}
export function aesGcmEncrypt(key, plaintext) {
    // golang.org/x/crypto GCM: 12-byte nonce prepended, tag appended
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([nonce, enc, cipher.getAuthTag()]);
}
export function aesGcmDecrypt(key, ciphertext) {
    const nonce = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(ciphertext.length - 16);
    const data = ciphertext.subarray(12, ciphertext.length - 16);
    const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
}
function secretKey() {
    return md5Bytes(conf.secretKey);
}
// ---------------------------------------------------------------- TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0)
        out += B32[(value << (5 - bits)) & 31];
    return out;
}
function base32Decode(str) {
    const clean = str.toUpperCase().replace(/[=\s]/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx < 0)
            continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}
export function totpGenerate(issuer, accountName) {
    const raw = crypto.randomBytes(20);
    const secret = base32Encode(raw);
    const url = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return { secret, url };
}
export function totpCode(secret, timeStep = Math.floor(Date.now() / 30000)) {
    const key = base32Decode(secret);
    const counter = Buffer.alloc(8);
    counter.writeUInt32BE(Math.floor(timeStep / 2 ** 32), 0);
    counter.writeUInt32BE(timeStep >>> 0, 4);
    const hmac = crypto.createHmac('sha1', key).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(code % 1000000).padStart(6, '0');
}
/** totp.Validate: accepts ±1 time step for clock skew, exactly 6 digits. */
export function totpValidate(passcode, secret) {
    if (!/^\d{6}$/.test(passcode))
        return false;
    const step = Math.floor(Date.now() / 30000);
    for (const t of [step - 1, step, step + 1]) {
        if (totpCode(secret, t) === passcode)
            return true;
    }
    return false;
}
// ---------------------------------------------------------------- storage
function encryptSecret(secret) {
    return aesGcmEncrypt(secretKey(), Buffer.from(secret)).toString('base64');
}
function decryptSecret(stored) {
    return aesGcmDecrypt(secretKey(), Buffer.from(stored, 'base64')).toString();
}
export function isTwoFactorEnabled(userID) {
    return !!db.db().prepare('SELECT 1 FROM two_factor WHERE user_id = ?').get(userID);
}
export function getTwoFactorByUserID(userID) {
    return db.db().prepare('SELECT * FROM two_factor WHERE user_id = ?').get(userID) ?? null;
}
export function createTwoFactor(userID, secret) {
    const now = Math.floor(Date.now() / 1000);
    db.db()
        .prepare('INSERT INTO two_factor (user_id, secret, created_unix) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret')
        .run(userID, encryptSecret(secret), now);
    // 10 recovery codes like gogs
    for (let i = 0; i < 10; i++) {
        const code = randomChars(10);
        db.db().prepare('INSERT INTO two_factor_recovery_code (user_id, code, is_used) VALUES (?,?,0)').run(userID, code.slice(0, 5).toLowerCase() + '-' + code.slice(5).toLowerCase());
    }
}
export function deleteTwoFactor(userID) {
    db.db().prepare('DELETE FROM two_factor WHERE user_id = ?').run(userID);
    db.db().prepare('DELETE FROM two_factor_recovery_code WHERE user_id = ?').run(userID);
}
export function validateTOTP(userID, passcode) {
    const t = getTwoFactorByUserID(userID);
    if (!t)
        return false;
    try {
        return totpValidate(passcode, decryptSecret(t.secret));
    }
    catch {
        return false;
    }
}
export function listRecoveryCodes(userID) {
    return db.db().prepare('SELECT * FROM two_factor_recovery_code WHERE user_id = ? ORDER BY id').all(userID);
}
export function regenerateRecoveryCodes(userID) {
    db.db().prepare('DELETE FROM two_factor_recovery_code WHERE user_id = ?').run(userID);
    for (let i = 0; i < 10; i++) {
        const code = randomChars(10);
        db.db().prepare('INSERT INTO two_factor_recovery_code (user_id, code, is_used) VALUES (?,?,0)').run(userID, code.slice(0, 5).toLowerCase() + '-' + code.slice(5).toLowerCase());
    }
}
export function useRecoveryCode(userID, codeInput) {
    const code = String(codeInput).toLowerCase().trim();
    const row = db.db().prepare('SELECT * FROM two_factor_recovery_code WHERE user_id = ? AND code = ? AND is_used = 0').get(userID, code);
    if (!row)
        return false;
    db.db().prepare('UPDATE two_factor_recovery_code SET is_used = 1 WHERE id = ?').run(row.id);
    return true;
}
// passcode reuse cache (60s) like gogs cache.TwoFactorCacheKey
const usedPasscodes = new Set();
export function passcodeRecentlyUsed(userID, passcode) {
    const key = `${userID}:${passcode}`;
    return usedPasscodes.has(key);
}
export function markPasscodeUsed(userID, passcode) {
    const key = `${userID}:${passcode}`;
    usedPasscodes.add(key);
    setTimeout(() => usedPasscodes.delete(key), 60000);
}
//# sourceMappingURL=twofactor.js.map