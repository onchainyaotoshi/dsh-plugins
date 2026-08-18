# dsh-copy-link-sesi — catatan untuk agent

Plugin deep-link sesi untuk Web UI DeepSeek Harness: menu **"Salin link"** di
baris sesi sidebar + buka sesi dari URL `?session=<id>`. **Baca ini sebelum
ngoding di paket ini.** Dokumentasi user-facing ada di `README.md`.

## Apa ini

- **Menu "Salin link"** di baris sesi (persis di bawah "Archive session"):
  menyalin deep link `<origin><path>?session=<sessionId>` ke clipboard.
- **Deep-link opener**: saat halaman dimuat dengan `?session=<id>`, sesi itu
  dibuka otomatis begitu terdaftar di daftar sesi; parameter lalu dibersihkan
  dari URL (one-shot — reload tidak melompat balik ke sesi lama). Sesi yang
  tidak dikenal diabaikan setelah 15 detik.

## Arsitektur & seam

```
src/index.ts          # host half: verifikasi patch (warn kalau marker hilang)
src/client/index.tsx  # browser half: deep-link opener (service `sessions`)
scripts/apply-patch.mjs # pasang/cek patch menu di bundle dsh-client-ui-workspace
cordis.patch.yml      # - insert: [{id: copy-link-sesi, name: dsh-copy-link-sesi}]
```

- **TIDAK ada seam untuk menu baris sesi di 0.1.0-rc.6** (lesson learned
  bawah): `sessionMenuItems` di-hardcode di `SessionNodeItem`
  (`dsh-client-ui-workspace`), slot `sidebar.workspaces` hanya punya satu child
  `directoryFlow`. Satu-satunya cara item menu masuk ke HoverCard itu = patch
  bundle `lib/client.js` instalasi global dsh.
- Patch = 2 sisipan: (1) item `copy-link` di ujung array `sessionMenuItems`
  (label literal `"Salin link"`, icon `IconLinkOutline16` dari
  `dsh-client-ui-primitives` — namespace import bundle sudah mencakupnya), (2)
  cabang `if (id === "copy-link")` di handler `onSelect` yang memanggil
  `navigator.clipboard?.writeText(...)?.catch(() => {})` (clipboard butuh
  secure context — domain publik HTTPS aman). Marker komentar
  `dsh-copy-link-sesi:menu` untuk idempotensi + verifikasi.
- Bundle di-serve persis dari file disk (hash file = hash yang di-serve),
  rev = sha1 pendek isi file dihitung saat boot → setelah patch, **restart dsh
  sekali** supaya boot manifest memakai rev baru.
- Host half verifikasi: `createRequire(ctx.baseUrl)` + `require.resolve`
  paket target (pola sama dengan `dsh-client-modules`) → baca `lib/client.js`
  → cek marker. Gagal = log warn, tidak pernah error boot.
- Client half: inject `sessions` (dsh-client-runtime); `list.subscribe` +
  `getSnapshot().ids` menunggu sesi target terdaftar, lalu `sessions.open(id)`
  (idempoten per kontrak runtime). `history.replaceState` membersihkan param.

## Lesson learned

- **Menu baris sesi tidak punya seam (rc.6)** — jangan buang waktu mencari
  slot; satu-satunya jalan item menu = patch bundle. Upgrade dsh = bundle
  diganti → patch hilang → jalan `scripts/apply-patch.mjs` (anchor dicek,
  gagal loud kalau versi berubah) lalu restart.
- Label menu hardcoded `"Salin link"` (bukan via i18n `t()`) — sengaja,
  patch tidak boleh menyentuh mekanisme locale bundle.
- Jangan pernah menaruh path absolut di file paket ini (repo publik) —
  skrip memakai `npm root -g`.

## Verifikasi

```sh
pnpm --filter dsh-copy-link-sesi build        # host + client bundle
node scripts/apply-patch.mjs --check          # 0 = patch terpasang, 1 = belum
node scripts/apply-patch.mjs                  # pasang (idempoten)
# setelah restart dsh:
curl -sS http://127.0.0.1:3080/plugins/@deepseek-ai/dsh-client-ui-workspace/client.js \
  | grep -c 'dsh-copy-link-sesi:menu'         # 1 = patch terserve
curl -sS http://127.0.0.1:3080/plugins/dsh-copy-link-sesi/client.js   # 200
curl -sS http://127.0.0.1:3080/ | grep -o 'dsh-copy-link-sesi[^}]*}'  # row boot manifest
```

Uji browser: (1) hover baris sesi → menu ⋯ → "Salin link" → paste → buka;
(2) buka `https://<domain>/?session=<id>` langsung → sesi terbuka, param
hilang dari URL setelah dimuat.
