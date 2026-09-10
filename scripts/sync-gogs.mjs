/**
 * Sync the ts-gogs build into vendor/ts-gogs.
 *
 * Run from this repo: `npm run sync-gogs` (expects ../ts-gogs next to this
 * repo, or TS_GOGS_SRC env override).
 *
 * Copied: dist/ templates/ vendored-conf/ public/ package.json — everything
 * the vendored server needs at runtime (its npm deps live in THIS package).
 */

import { cpSync, existsSync, mkdirSync, rmSync, statSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const src = process.env.TS_GOGS_SRC || join(repo, '..', '..', 'ts-gogs')
const dest = join(repo, 'vendor', 'ts-gogs')

const items = ['dist', 'src/db', 'templates', 'vendored-conf', 'public', 'package.json']

if (!existsSync(src)) {
  console.error(`ts-gogs source not found: ${src} (set TS_GOGS_SRC)`)
  process.exit(1)
}
for (const item of items) {
  if (!existsSync(join(src, item))) {
    console.error(`ts-gogs build missing '${item}' — run 'npm run build' in ${src} first`)
    process.exit(1)
  }
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const item of items) {
  cpSync(join(src, item), join(dest, item), { recursive: true })
}

const size = (p) => {
  let total = 0
  try { total = statSync(p).size } catch {}
  return total
}
const distSize = size(join(dest, 'dist', 'index.js'))
console.log(`synced ts-gogs → vendor/ts-gogs (dist/index.js ${distSize} bytes)`)
console.log('remember: npm install here provides better-sqlite3/ssh2/etc for the vendored server')
