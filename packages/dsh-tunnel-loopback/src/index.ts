/**
 * dsh-tunnel-loopback — host half (Node).
 *
 * Half ini TIDAK melakukan fix apa pun; fix-nya ada di browser half
 * (src/client/index.ts). Host half ada karena dua alasan:
 *
 * 1. Row komposisi tanpa host half tidak pernah masuk client roster —
 *    dsh-client-modules hanya memuat row yang host fiber-nya hidup.
 * 2. Pemeriksa urutan: fix hanya bekerja kalau row ini terdaftar SEBELUM
 *    baris-baris @deepseek-ai/dsh-web-app di komposisi (urutan baris =
 *    urutan registrasi plugin browser). Kalau `dsh plugin add` menaruh
 *    bundle ini di akhir daftar, client half akan aktif terlambat dan
 *    fix menjadi no-op diam-diam — di sini kita berteriak di log.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Subset entry Loader yang kita baca untuk cek urutan. */
interface EntryOptions {
  id?: string
  name?: string
}
interface LoaderEntry {
  options?: EntryOptions
}
interface LoaderLike {
  entries(): LoaderEntry[]
}

export const name = 'dsh-tunnel-loopback'

/** Id baris di cordis.patch.yml bundle ini. */
const SELF_ROW_ID = 'tunnel-loopback'
/** Id baris yang membaca `connection.isLoopback` dan wajib aktif setelah kita. */
const GATE_ROW_IDS = ['connection', 'ui-settings']

export function apply(ctx: Context) {
  const loader = ctx.get('loader') as LoaderLike | undefined
  if (loader === undefined) return

  const ids: string[] = []
  for (const entry of loader.entries()) ids.push(entry.options?.id ?? '')

  const selfIndex = ids.indexOf(SELF_ROW_ID)
  const gateIndexes = GATE_ROW_IDS.map((id) => ids.indexOf(id))

  if (selfIndex < 0 || gateIndexes.some((index) => index < 0)) {
    ctx.logger.warn(
      `dsh-tunnel-loopback: urutan komposisi tidak bisa diverifikasi (baris ${SELF_ROW_ID} atau ${GATE_ROW_IDS.join('/')} tidak ditemukan) — cek dsh --profile web --dump-config`,
    )
    return
  }
  if (gateIndexes.some((index) => index < selfIndex)) {
    ctx.logger.warn(
      'dsh-tunnel-loopback: baris ini terdaftar SETELAH connection/ui-settings — ' +
        'fix persistensi settings TIDAK akan aktif. Pindahkan bundle ini ke ' +
        'posisi SEBELUM @deepseek-ai/dsh-web-app di dsh.profile.bundles lalu restart.',
    )
    return
  }
  ctx.logger.info(
    'dsh-tunnel-loopback: urutan komposisi OK — browser half akan memaksa connection.isLoopback (persistensi settings via tunnel/proxy)',
  )
}
