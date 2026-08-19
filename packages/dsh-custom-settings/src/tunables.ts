/**
 * dsh-custom-settings — registri tunable.
 *
 * SUMBER TUNGGAL daftar setting kustom. Menambah setting baru = tambah SATU
 * entri di TUNABLES + rebuild (host half saja). Browser half render form
 * otomatis dari GET /api/tunables — client tidak perlu disentuh.
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * Batas atas setTimeout Node (2^31-1 ms — lebih besar dibulatkan ke 1 ms).
 * Sama dengan MAX_TIMER_DELAY_MS dari @deepseek-ai/dsh-timeout yang dipakai
 * dsh-code-runtime-worker-thread; sengaja di-hardcode + dikomentari supaya
 * tidak bergantung versi paket yang berbeda di registry (instalasi lokal
 * 0.1.0-rc.7 vs dist-tag npm 0.0.1-rc.1 — mismatch).
 */
export const MAX_TIMER_DELAY_MS = 2147483647

export interface TunablePreset {
  label: string
  value: number
}

export interface Tunable {
  /** Key field di namespace settings `custom-settings` (kebab/lowercase safe). */
  id: string
  /** Key di object config service target (default = id). */
  configKey?: string
  /** Label pendek di UI. */
  label: string
  /** Deskripsi inline (satu-dua kalimat, bahasa Indonesia). */
  description: string
  /** Tooltip lengkap saat hover ikon info. */
  tooltip: string
  min: number
  max: number
  default: number
  /** Satuan tampilan input. */
  unit?: string
  /** Preset cepat (nilai dalam ms). */
  presets?: TunablePreset[]
  /** true = butuh restart dsh; false (default) = berlaku live tanpa restart. */
  restart?: boolean
  /** Terapkan nilai ke runtime. Dipanggil saat boot & setiap nilai berubah. */
  apply(ctx: Context, value: number): void
}

/** Face service codeRuntime (loose — kebenaran runtime ada di dsh). */
interface CodeRuntimeLike {
  config?: Record<string, unknown>
}

export const TUNABLES: Tunable[] = [
  {
    id: 'runCodeMaxWallMs',
    configKey: 'maxWallMs',
    label: 'Batas waktu run_code (maxWallMs)',
    description: 'Berapa lama satu eksekusi run_code boleh berjalan sebelum dihentikan.',
    tooltip:
      'Di preset code, exit_plan_mode berjalan di dalam run_code dan batas ini ikut menghitung waktu kamu membaca plan. Default dsh 600.000 ms (10 menit): lebih dari itu run dibunuh dan approval hangus. Naikkan agar membaca plan tidak terpotong. Berlaku langsung ke run berikutnya, tanpa restart. Berlaku juga untuk semua eksekusi run_code lain.',
    min: 1,
    max: MAX_TIMER_DELAY_MS,
    default: 3_600_000,
    unit: 'ms',
    presets: [
      { label: '10 menit', value: 600_000 },
      { label: '1 jam', value: 3_600_000 },
      { label: '6 jam', value: 21_600_000 },
    ],
    restart: false,
    apply(ctx, value) {
      // cordis TIDAK membekukan config plugin (diverifikasi rc.7): mutasi
      // object config ini langsung dipakai run berikutnya
      // (setTimeout(..., this.config.maxWallMs) di setiap run()).
      const runtime = (ctx as unknown as { get<T>(key: string): T | undefined })
        .get<CodeRuntimeLike>('codeRuntime')
      if (runtime?.config) runtime.config.maxWallMs = Math.round(value)    },
  },
]
