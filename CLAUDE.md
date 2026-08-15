# dsh-plugins — catatan untuk agent (DSH / Claude Code)

Monorepo plugin DeepSeek Harness milik firman. **Baca ini sebelum ngoding di repo ini.**

## Keputusan terkunci (jangan diubah tanpa konfirmasi pemilik)

- **15 Aug 2026 — Topologi: SATU monorepo ini untuk SEMUA plugin** (opsi B).
  Satu plugin = satu paket npm di packages/*. JANGAN bikin repo terpisah per plugin,
  JANGAN bikin plugin di luar workspace ini. ADR lengkap: docs/decisions/.
- **15 Aug 2026 — Format paket**: dual-half — dsh.bundle (cordis.patch.yml dengan
  satu row name: <paket>) + dsh.client kalau ada UI (exports["./client"]).
  Satu row melayani host half DAN browser roster sekaligus.
- **15 Aug 2026 — Security boundary file-explorer**: semua route API panel wajib
  containment check dalam workspace terdaftar (ctx.fs.contains) — 403 di luar root.
  Boundary ini WARISAN wajib untuk plugin lain yang menyentuh filesystem.

## Struktur

```
packages/
  file-explorer/          # panel tree file + viewer source code
    src/index.ts          # host half (Node): route HTTP list/read/workspaces
    src/client/index.tsx  # browser half: slot shell.overlay + sidebar.footer.action
    cordis.patch.yml      # layer: - insert: [{ id: file-explorer, name: dsh-file-explorer }]
```

## Konvensi

- Nama paket: dsh-<kata> (unscoped). Nama = id plugin = id modul browser.
- Build: pnpm install (sekali) → pnpm build (tsdown; preset bersama tsdown.client.ts).
- Bundle client wajib eksternal semua @deepseek-ai/* (purity gate).
- Bundle client WAJIB punya shim CJS di banner/footer preset (tsdown.client.ts):
  `var module = { exports: {} }; var exports = module.exports;` (banner) +
  `return module.exports;` (footer). Tanpa shim: "exports is not defined" saat
  materialisasi (kejadian nyata 15 Aug 2026). JANGAN dihapus.
- Tambah plugin baru: salin packages/file-explorer → ganti nama + isi → otomatis
  masuk workspace (packages/*). Perbarui daftar di bagian "Struktur".
- Test di VPS: dsh plugin --profile web add ./packages/<nama> → verifikasi
  dsh --profile web --dump-config → restart dsh SEKALI di jeda antar turn
  (sesi persist, jangan restart saat ada agent lagi kerja).
- Iterasi UI: pnpm watch + refresh browser (produksi tanpa HMR — endpoint no-cache).
- Versi dsh target: 0.1.0-rc.6 — seam ctx.fs / ctx.webServer / ctx.workspaceRegistry /
  slot shell.overlay + sidebar.footer.action diverifikasi di versi ini; kalau dsh
  di-upgrade, cek ulang seam-nya dulu.
- Publish: build dulu, lalu pnpm --filter dsh-file-explorer publish --access public.
  User lain: dsh plugin --profile web add <nama> + restart.
