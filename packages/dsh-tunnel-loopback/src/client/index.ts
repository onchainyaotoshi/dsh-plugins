/**
 * dsh-tunnel-loopback — browser half.
 *
 * Masalah: `dsh-client-ui-settings` memilih persistence settingsScope dengan
 * `connection.isLoopback ? "host" : "memory"`, dan `isLoopback` dihitung dari
 * `location.hostname` — selalu false kalau UI diakses lewat tunnel/proxy
 * (mis. domain publik → cloudflared → proxy loopback → dsh). Akibatnya
 * persistence "memory": load()/set() jadi no-op dan tema/bahasa/composer/
 * welcome notice balik ke default tiap reload. Gate yang sama juga mematikan
 * SettingsDocumentStore (settings-general) dan WelcomeNoticeStore
 * (settings-models).
 *
 * Fix: set `connection.isLoopback = true` SEBELUM plugin settings mengikat
 * scope-nya. Server-side fence TIDAK disentuh sama sekali — di balik proxy
 * yang menulis ulang Host, server memang melihat request sebagai loopback,
 * jadi client hanya dibuat sepakat dengan kenyataan itu. Tanpa proxy seperti
 * itu, method istimewa tetap ditolak server (403) dan tidak ada yang bocor.
 *
 * Jaminan urutan aktivasi (mengapa ini bekerja):
 * - `immediately: true` di deklarasi dsh.client membuat bundle ini
 *   di-prefetch oleh shell SEBELUM boot plugin; import-nya lalu resolve
 *   instan, jadi fiber plugin ini selalu terdaftar lebih dulu dari bundle
 *   lain yang masih menunggu jaringan.
 * - `inject: ['connection']` menahan aktivasi sampai service `connection`
 *   tersedia; saat service itu muncul, cordis me-refresh injector sesuai
 *   urutan registrasi — kita yang pertama, sebelum ui-settings dkk.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-tunnel-loopback'
export const inject = ['connection'] as const

/** Bentuk minimal handle service `connection` yang kita sentuh. */
interface ConnectionHandle {
  isLoopback: boolean
}

export function apply(ctx: Context) {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  if (connection === undefined) {
    ctx.logger.warn('dsh-tunnel-loopback: service "connection" belum tersedia — inject hilang?')
    return
  }
  connection.isLoopback = true
  ctx.logger.info('dsh-tunnel-loopback: connection.isLoopback dipaksa true (deployment tunnel/proxy)')
}
