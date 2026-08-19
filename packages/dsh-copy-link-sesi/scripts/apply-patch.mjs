#!/usr/bin/env node
/**
 * CLI manual untuk patch menu "Salin link" di bundle browser
 * `@deepseek-ai/dsh-client-ui-workspace`. Logika patch ada di patch-core.mjs
 * (sumber tunggal — host half plugin memakai core yang sama untuk auto-repair
 * saat boot, jadi tidak ada duplikasi yang bisa melenceng).
 *
 * Pemakaian:
 *   node scripts/apply-patch.mjs              # pasang patch (idempoten)
 *   node scripts/apply-patch.mjs --check      # cek saja (exit 0=terpasang, 1=belum)
 *   node scripts/apply-patch.mjs <path>       # target eksplisit (mis. dev checkout)
 *
 * Lokasi default: <npm root -g>/@deepseek-ai/dsh/node_modules/
 *   @deepseek-ai/dsh-client-ui-workspace/lib/client.js
 *
 * Latar belakang: menu baris sesi (rename/fork/archive) di-hardcode oleh
 * dsh-client-ui-workspace tanpa seam slot (terverifikasi 0.1.0-rc.6/rc.7) —
 * lihat CLAUDE.md paket ini. Patch menambah satu item menu "Salin link" persis
 * di bawah "Archive session" + handler onSelect yang menyalin deep link
 * `<origin><path>?session=<id>` ke clipboard.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { patchSource, STATUS } from './patch-core.mjs'

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

const result = patchSource(readFileSync(bundlePath, 'utf8'))

if (result.status === STATUS.INSTALLED) {
  console.log(`[dsh-copy-link-sesi] patch sudah terpasang (marker ditemukan): ${bundlePath}`)
  process.exit(0)
}

if (result.status === STATUS.ANCHOR_MISSING) {
  console.error(
    '[dsh-copy-link-sesi] anchor patch tidak ditemukan di bundle — versi dsh berubah? Periksa manual (patch-core.mjs):',
    bundlePath,
  )
  process.exit(3)
}

if (checkOnly) {
  console.log('[dsh-copy-link-sesi] patch BELUM terpasang (anchor utuh, siap di-apply)')
  process.exit(1)
}

writeFileSync(bundlePath, result.source)
console.log(`[dsh-copy-link-sesi] patch terpasang: ${bundlePath}`)
console.log('[dsh-copy-link-sesi] restart dsh sekali, lalu hard-refresh browser')
