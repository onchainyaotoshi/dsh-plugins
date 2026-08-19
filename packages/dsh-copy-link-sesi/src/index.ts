/**
 * dsh-copy-link-sesi — host half.
 *
 * Auto-repair patch menu "Salin link" di bundle browser
 * `@deepseek-ai/dsh-client-ui-workspace`. Saat boot: kalau marker patch hilang
 * (biasanya karena dsh di-upgrade dan bundle diganti versi baru), pasang ulang
 * otomatis lewat patch-core — sumber tunggal yang sama dengan
 * scripts/apply-patch.mjs. Kalau anchor tidak cocok (dsh mengubah struktur
 * bundle), log warn; boot tidak pernah gagal karena hal ini.
 *
 * Kenapa perlu auto-repair: menu baris sesi (rename/fork/archive) di-hardcode
 * oleh dsh-client-ui-workspace tanpa seam slot (terverifikasi 0.1.0-rc.6 dan
 * rc.7), jadi fitur ini butuh patch bundle — dan patch rawan hilang setiap
 * dsh di-upgrade. Setelah upgrade, restart dsh (yang memang wajib) otomatis
 * memasang ulang patch; hard-refresh browser saja di sisi user.
 */
import { Service } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { patchSource, STATUS } from '../scripts/patch-core.mjs'

const TARGET = '@deepseek-ai/dsh-client-ui-workspace'
const BUNDLE_REL = join('lib', 'client.js')

export default class SessionLinkHost extends Service {
  async [Service.init](): Promise<void> {
    // Tunda ke microtask: auto-repair tidak boleh memperlambat boot.
    queueMicrotask(() => this.repairPatch())
  }

  private repairPatch(): void {
    try {
      const baseUrl = (this.ctx as { baseUrl?: unknown }).baseUrl
      if (typeof baseUrl !== 'string') return // anchor config tidak tersedia — lewati
      const require = createRequire(baseUrl)
      const pkgJson = require.resolve(`${TARGET}/package.json`)
      const bundlePath = join(dirname(pkgJson), BUNDLE_REL)
      const result = patchSource(readFileSync(bundlePath, 'utf8'))
      if (result.status === STATUS.APPLIED) {
        writeFileSync(bundlePath, result.source)
        this.ctx.logger.info(
          `[dsh-copy-link-sesi] patch menu "Salin link" terpasang ulang otomatis: ${bundlePath} — hard-refresh browser`
        )
      } else if (result.status === STATUS.ANCHOR_MISSING) {
        this.ctx.logger.warn(
          `[dsh-copy-link-sesi] patch menu "Salin link" hilang DAN anchor tidak cocok di ${bundlePath} — versi dsh mengubah struktur bundle? Periksa scripts/patch-core.mjs lalu jalankan scripts/apply-patch.mjs`
        )
      }
    } catch (error) {
      this.ctx.logger.warn(`[dsh-copy-link-sesi] auto-repair patch gagal: ${String(error)}`)
    }
  }
}
