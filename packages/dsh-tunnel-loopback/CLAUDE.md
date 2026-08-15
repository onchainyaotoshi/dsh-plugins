# dsh-tunnel-loopback — catatan untuk agent

Plugin yang memaksa `connection.isLoopback = true` di client, untuk deployment
yang menyajikan Web UI lewat tunnel / reverse proxy. **Baca ini sebelum ngoding
di paket ini.** Dokumentasi user-facing (masalah yang dipecahkan, instalasi,
verifikasi efek, keamanan) ada di `README.md` — jangan diduplikasi; file ini
berisi pengetahuan teknis & lesson learned KHUSUS paket ini (kalau paket
dipindah ke repo sendiri, file ini ikut).

## Arsitektur

```
src/index.ts          # host half (Node): marker + pemeriksa urutan komposisi
src/client/index.ts   # browser half: inject ['connection'] → set isLoopback = true
cordis.patch.yml      # layer: - insert: [{ id: tunnel-loopback, name: dsh-tunnel-loopback }]
```

- **Host half TIDAK melakukan fix apa pun.** Fix ada di browser half. Host half
  ada karena dua alasan: (1) row komposisi tanpa host half TIDAK masuk client
  roster — `dsh-client-modules` hanya memuat row yang host fiber-nya hidup
  (`entry.fiber !== void 0`), jadi plugin client-only tetap butuh host half
  minimal (marker); (2) pemeriksa urutan lewat `ctx.loader.entries()` —
  berteriak di log kalau posisi bundle salah (lihat "Lesson learned").
- **Client half** `inject: ['connection']` → pada giliran aktivasinya set
  `isLoopback = true`, SEBELUM plugin settings mengikat scope-nya (theme,
  settings-general, settings-models, deliverables).
- `dsh.client.immediately = true` di package.json → shell me-prefetch bundle
  ini sebelum boot plugin, jadi fiber-nya terdaftar paling awal (tidak kalah
  balapan jaringan).

## Lesson learned (jangan diulang)

- **Urutan AKTIVASI client = urutan REGISTRASI fiber = urutan import modul**
  (pelajaran 18 Aug 2026): import modul menunggu jaringan, jadi posisi row di
  komposisi saja TIDAK cukup. Dua hal yang membuatnya deterministik:
  (1) `dsh.client.immediately = true` (prefetch sebelum boot, lihat di atas);
  (2) letakkan bundle SEBELUM `@deepseek-ai/dsh-web-app` di
  `dsh.profile.bundles` profil — `dsh plugin add` menaruh bundle baru di
  AKHIR daftar, WAJIB dipindah manual. `insert` di `cordis.patch.yml` tidak
  punya kontrol posisi (selalu append). Host half memverifikasi urutan lewat
  `ctx.loader.entries()` (id baris `tunnel-loopback` harus sebelum
  `connection`/`ui-settings`) dan memperingatkan di log kalau salah.
- **Tanpa host half, plugin client-only mati diam-diam**: row tanpa host fiber
  tidak pernah masuk client roster (lihat "Arsitektur"). Selalu pertahankan
  host half marker.

## Verifikasi urutan tanpa restart

```sh
dsh --profile web --dump-config | grep -n -B1 -A2 'dsh-tunnel-loopback\|dsh-client-connection'
# row tunnel-loopback harus muncul sebelum row connection
```

Setelah restart dsh sekali, cek log host half: harus muncul
`dsh-tunnel-loopback: urutan komposisi OK — ...`. Kalau muncul peringatan
"terdaftar SETELAH connection/ui-settings", pindahkan bundle ke posisi
sebelum `@deepseek-ai/dsh-web-app` di `dsh.profile.bundles` lalu restart.

Tes efek di browser: ganti tema ke Dark → reload → tema tetap Dark, dan konsol
menulis `dsh-tunnel-loopback: connection.isLoopback dipaksa true`.
