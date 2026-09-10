/**
 * Initialize server/ from ../ts-gogs source (ONE-WAY import).
 * After the initial import, server/ is owned by this plugin — upstream fixes
 * are merged by hand. Re-running with FORCE=1 overwrites server/{src,templates,
 * vendored-conf,public,package.json,tsconfig.json} (server/src edits are lost).
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = process.env.TS_GOGS_SRC || join(repo, '..', 'ts-gogs')
const dest = join(repo, 'server')

if (!existsSync(src)) { console.error(`ts-gogs source not found: ${src}`); process.exit(1) }
if (existsSync(join(dest, 'src')) && process.env.FORCE !== '1') {
  console.error('server/src already exists — this is a ONE-WAY import; use FORCE=1 to overwrite (loses dsh customizations)')
  process.exit(1)
}
for (const item of ['src', 'templates', 'vendored-conf', 'public', 'package.json', 'tsconfig.json']) {
  rmSync(join(dest, item), { recursive: true, force: true })
  cpSync(join(src, item), join(dest, item), { recursive: true })
}
console.log('server/ imported from', src, '— now rebuild: npm run build:server')
