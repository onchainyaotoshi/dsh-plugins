#!/usr/bin/env node
/**
 * Pasang/cek patch menu "Salin link" di bundle browser
 * `@deepseek-ai/dsh-client-ui-workspace` milik instalasi global dsh.
 *
 * Pemakaian:
 *   node scripts/apply-patch.mjs              # pasang patch (idempoten)
 *   node scripts/apply-patch.mjs --check      # cek saja (exit 0=terpasang, 1=belum)
 *   node scripts/apply-patch.mjs <path>       # target eksplisit (mis. untuk dev checkout)
 *
 * Lokasi default: <npm root -g>/@deepseek-ai/dsh/node_modules/
 *   @deepseek-ai/dsh-client-ui-workspace/lib/client.js
 *
 * Latar belakang: menu baris sesi (rename/fork/archive) di-hardcode oleh
 * dsh-client-ui-workspace tanpa seam slot (terverifikasi 0.1.0-rc.6) — lihat
 * CLAUDE.md paket ini. Patch menambah satu item menu "Salin link" persis di
 * bawah "Archive session" + handler onSelect yang menyalin deep link
 * `<origin><path>?session=<id>` ke clipboard.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MARKER = 'dsh-copy-link-sesi:menu'

// Anchor 1: ujung array sessionMenuItems (item archive + tutup array).
// Indentasi TAB persis seperti bundle (jangan diubah).
const OLD_ITEMS = [
  '\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })',
  '\t\t\t\t}',
  '\t\t\t];',
].join('\n')

const NEW_ITEMS = [
  '\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })',
  '\t\t\t\t},',
  '\t\t\t\t{',
  '\t\t\t\t\tid: "copy-link",',
  '\t\t\t\t\tlabel: "Salin link",',
  '\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline16, {})',
  `\t\t\t\t} /* ${MARKER} */`,
  '\t\t\t];',
].join('\n')

// Anchor 2: handler onSelect menu sesi.
const OLD_SELECT = '\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);'

const NEW_SELECT = [
  OLD_SELECT,
  '',
  '\t\t\t\t\t\t\t\tif (id === "copy-link") {',
  '\t\t\t\t\t\t\t\t\tnavigator.clipboard?.writeText(location.origin + location.pathname + "?session=" + node.id)?.catch(() => {});',
  '\t\t\t\t\t\t\t\t}',
].join('\n')

function defaultBundlePath() {
  const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  return join(
    npmRoot,
    '@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js',
  )
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const explicit = args.find((a) => a !== '--check')
const bundlePath = resolve(explicit ?? defaultBundlePath())

if (!existsSync(bundlePath)) {
  console.error(`[dsh-copy-link-sesi] bundle tidak ditemukan: ${bundlePath}`)
  process.exit(2)
}

const source = readFileSync(bundlePath, 'utf8')

if (source.includes(MARKER)) {
  console.log(`[dsh-copy-link-sesi] patch sudah terpasang (marker ditemukan): ${bundlePath}`)
  process.exit(0)
}

if (!source.includes(OLD_ITEMS) || !source.includes(OLD_SELECT)) {
  console.error(
    '[dsh-copy-link-sesi] anchor patch tidak ditemukan di bundle — versi dsh berubah? Periksa manual:',
    bundlePath,
  )
  process.exit(3)
}

if (checkOnly) {
  console.log('[dsh-copy-link-sesi] patch BELUM terpasang (anchor utuh, siap di-apply)')
  process.exit(1)
}

const patched = source.replace(OLD_ITEMS, NEW_ITEMS).replace(OLD_SELECT, NEW_SELECT)
writeFileSync(bundlePath, patched)
console.log(`[dsh-copy-link-sesi] patch terpasang: ${bundlePath}`)
console.log('[dsh-copy-link-sesi] restart dsh sekali, lalu hard-refresh browser')
