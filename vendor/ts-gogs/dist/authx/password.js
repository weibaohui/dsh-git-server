// Password hashing compatible with gogs: PBKDF2-HMAC-SHA256, 10000 iterations,
// 50-byte key, hex encoded. Salt: 10 random alphanumeric chars.
import * as crypto from 'node:crypto';
export function encodePassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 50, 'sha256').toString('hex');
}
export function verifyPassword(password, salt, encoded) {
    const candidate = encodePassword(password, salt);
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(encoded, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function randomSalt() {
    const bytes = crypto.randomBytes(10);
    let out = '';
    for (let i = 0; i < 10; i++)
        out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}
export function md5(input) {
    return crypto.createHash('md5').update(input).digest('hex');
}
export function sha1(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}
export function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}
export function newTokenSHA1() {
    return crypto.randomBytes(20).toString('hex');
}
export function basicAuthDecode(encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0)
        return [decoded, ''];
    return [decoded.slice(0, idx), decoded.slice(idx + 1)];
}
export function basicAuthEncode(username, password) {
    return Buffer.from(`${username}:${password}`).toString('base64');
}
//# sourceMappingURL=password.js.map