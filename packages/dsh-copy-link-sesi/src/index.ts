/**
 * dsh-copy-link-sesi — host half.
 *
 * Hanya verifikasi: memastikan patch menu "Salin link" masih terpasang di
 * bundle browser `@deepseek-ai/dsh-client-ui-workspace`. Kalau hilang (mis.
 * dsh di-upgrade dan bundle diganti versi baru), log peringatan + petunjuk
 * re-apply. Tidak menyediakan service baru dan tidak mendaftarkan route.
 *
 * Kenapa perlu verifikasi: menu baris sesi (rename/fork/archive) di-hardcode
 * oleh dsh-client-ui-workspace tanpa seam slot (terverifikasi 0.1.0-rc.6),
 * jadi fitur ini butuh patch bundle — dan patch rawan hilang saat upgrade.
 */
import { Service } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const TARGET = '@deepseek-ai/dsh-client-ui-workspace'
const BUNDLE_REL = join('lib', 'client.js')
const MARKER = 'dsh-copy-link-sesi:menu'

export default class SessionLinkHost extends Service {
  async [Service.init](): Promise<void> {
    // Tunda ke microtask: verifikasi tidak boleh memperlambat boot.
    queueMicrotask(() => this.verifyPatch())
  }

  private verifyPatch(): void {
    try {
      const baseUrl = (this.ctx as { baseUrl?: unknown }).baseUrl
      if (typeof baseUrl !== 'string') return // anchor config tidak tersedia — lewati
      const require = createRequire(baseUrl)
      const pkgJson = require.resolve(`${TARGET}/package.json`)
      const bundlePath = join(dirname(pkgJson), BUNDLE_REL)
      if (!readFileSync(bundlePath, 'utf8').includes(MARKER)) {
        this.ctx.logger.warn(
          `[dsh-copy-link-sesi] patch menu "Salin link" tidak ditemukan di ${bundlePath} — jalankan scripts/apply-patch.mjs dari paket ini lalu restart dsh`
        )
      }
    } catch (error) {
      this.ctx.logger.warn(`[dsh-copy-link-sesi] verifikasi patch gagal: ${String(error)}`)
    }
  }
}
