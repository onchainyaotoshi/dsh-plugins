# dsh-custom-settings

Custom settings & runtime patches untuk DeepSeek Harness Web UI, dikelola dari
halaman **Settings → Custom Settings** (tab paling bawah).

## Fitur

- **Tunable `runCodeMaxWallMs`** — batas waktu eksekusi `run_code`. Default
  dsh 10 menit membuat approval plan mode hangus kalau plan dibaca lebih lama
  (exit_plan_mode berjalan di dalam run_code). Default plugin: **1 jam**,
  diubah kapan pun dari UI. Nilai **berlaku langsung tanpa restart** dan
  bertahan di `~/.dsh/settings.yaml`.
- **Cek versi dsh** — versi terpasang tampil otomatis; tombol "Cek versi
  terbaru" membandingkan dengan registry npm.
- **Upgrade sekali-klik** — saat ada versi baru: tombol Upgrade + dialog
  konfirmasi → `npm install -g @deepseek-ai/dsh@latest` → dsh restart otomatis
  (halaman reconnect sendiri, sesi agen aman).

## Pemasangan

```sh
dsh plugin --profile web add dsh-custom-settings
# lalu restart dsh sekali
```

## Pengembangan

Tambah setting baru = tambah satu entri di `src/tunables.ts` (host half),
rebuild — UI (form + deskripsi + tooltip) ter-render otomatis dari
`GET /api/tunables`. Lihat `CLAUDE.md` paket untuk arsitektur & lesson learned.
