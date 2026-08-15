# dsh-plugins — catatan untuk agent (DSH / Claude Code)

Monorepo plugin DeepSeek Harness. **Baca ini sebelum ngoding di repo ini.**

## Keputusan terkunci (jangan diubah tanpa konfirmasi pemilik)

- **15 Aug 2026 — Topologi: SATU monorepo ini untuk SEMUA plugin** (opsi B).
  Satu plugin = satu paket npm di packages/*. JANGAN bikin repo terpisah per
  plugin, JANGAN bikin plugin di luar workspace ini. ADR lengkap:
  docs/decisions/.
- **15 Aug 2026 — Format paket**: dual-half — dsh.bundle (cordis.patch.yml
  dengan satu row name: <paket>) + dsh.client kalau ada UI
  (exports["./client"]). Satu row melayani host half DAN browser roster
  sekaligus.
- **15 Aug 2026 — Security boundary file-explorer**: semua route API panel
  wajib containment check dalam workspace terdaftar (ctx.fs.contains) — 403
  di luar root. Boundary ini WARISAN wajib untuk plugin lain yang menyentuh
  filesystem.

## Di mana dokumen berada

- **File ini (root)**: hanya konvensi & aturan yang berlaku LINTAS paket.
- **`packages/<nama>/CLAUDE.md`**: arsitektur, seam dsh, lesson learned, dan
  verifikasi KHUSUS satu plugin. Setiap plugin WAJIB punya satu. Template
  minimal: "Apa ini" / "Arsitektur & seam" / "Lesson learned" / "Verifikasi".
  Kalau plugin suatu hari dipindah ke repo sendiri, folder + CLAUDE.md-nya
  tinggal diangkat — ilmunya ikut.

## Struktur

```
packages/
  file-explorer/          # panel tree file + viewer source code
    src/index.ts          # host half (Node): route HTTP list/read/raw/workspaces
    src/client/index.tsx  # browser half: seat details (kolom kanan) + conversation.session.header.utilities
    cordis.patch.yml      # layer: - insert: [{ id: file-explorer, name: dsh-file-explorer }]
  dsh-tunnel-loopback/    # paksa connection.isLoopback=true di client (tunnel/proxy)
    src/index.ts          # host half: marker + pemeriksa urutan komposisi
    src/client/index.ts   # browser half: flip isLoopback sebelum settings bind
    cordis.patch.yml      # layer: - insert: [{ id: tunnel-loopback, name: dsh-tunnel-loopback }]
  dsh-git-state/          # strip status git (branch/perubahan/stash/worktree/PR) di atas composer
    src/index.ts          # host half (Node): route HTTP GET /plugins/dsh-git-state/api/state (git read-only)
    src/client/index.tsx  # browser half: slot conversation.input.dock (order -10, klik = panel detail)
    cordis.patch.yml      # layer: - insert: [{ id: git-state, name: dsh-git-state }]
```

Detail per plugin: `packages/file-explorer/CLAUDE.md` dan
`packages/dsh-tunnel-loopback/CLAUDE.md`.

## Konvensi lintas paket

- Nama paket: dsh-<kata> (unscoped). Nama = id plugin = id modul browser.
- Build: pnpm install (sekali) → pnpm build (tsdown; preset bersama
  tsdown.client.ts).
- Bundle client wajib eksternal semua @deepseek-ai/* (purity gate).
- Bundle client WAJIB punya shim CJS di banner/footer preset (tsdown.client.ts):
  `var module = { exports: {} }; var exports = module.exports;` (banner) +
  `return module.exports;` (footer). Tanpa shim: "exports is not defined" saat
  materialisasi (kejadian nyata 15 Aug 2026). JANGAN dihapus.
- **UI plugin wajib `ctx.slots.inject(...)`** (bukan register langsung di
  apply), **slot ber-kind `list` wajib `options.id`**, dan **wajib token
  `--dsw-*`** (theme-aware). Detail + kejadian nyata:
  `packages/file-explorer/CLAUDE.md`.
- **Skill `restart-dsh` kembar** (18 Aug 2026): `.dsh/skills/restart-dsh/SKILL.md`
  (dibaca DSH; terverifikasi live — watcher filesystem provider langsung
  publish ke katalog sesi) + `.claude/skills/restart-dsh/SKILL.md` (dibaca
  Claude Code). Konten SAMA, edit dua-duanya. Isinya: restart `dsh.service`
  dari dalam turn agent — detached + sleep (jangan matikan turn sendiri),
  `sudo -n systemctl` scope system (`systemctl --user` gagal di shell agent),
  verifikasi MainPID baru, sesi persist jadi aman, client-only = cukup build +
  refresh.
- Tambah plugin baru: salin packages/file-explorer → ganti nama + isi →
  otomatis masuk workspace (packages/*). WAJIB buat `CLAUDE.md` paket
  (template di atas) dan perbarui bagian "Struktur" di file ini.
- Test di VPS: dsh plugin --profile web add ./packages/<nama> → verifikasi
  dsh --profile web --dump-config → restart dsh SEKALI di jeda antar turn
  (sesi persist, jangan restart saat ada agent lagi kerja).
- Iterasi UI: pnpm watch + refresh browser (produksi tanpa HMR — endpoint
  no-cache).
- Versi dsh target: 0.1.0-rc.6 — seam yang dipakai tiap paket diverifikasi di
  versi ini (daftar lengkap per paket di CLAUDE.md paket masing-masing); kalau
  dsh di-upgrade, cek ulang seam-nya dulu.
- Publish: build dulu, lalu pnpm --filter <paket> publish --access public.
  User lain: dsh plugin --profile web add <nama> + restart.
- **PRIVASI (wajib, pasca-insiden 15 Aug 2026): repo ini PUBLIK.** Jangan pernah
  menulis nama asli, email pribadi, path absolut /home/..., atau identitas VPS
  ke file repo ini — termasuk CLAUDE.md per paket. Identitas git = noreply
  (onchainyaotoshi@users.noreply.github.com), sudah diset repo-lokal — jangan
  diubah ke email pribadi. Sebelum push: audit grep + git log (lihat aturan
  lengkap di CLAUDE.md workspace utama).
- **Disiplin belajar: SETIAP insiden/error yang makan waktu → tambah baris
  pelajaran SEBELUM commit fix-nya.** Catat di `CLAUDE.md` paket yang
  bersangkutan — lesson learned-nya ikut pindah kalau paket dipisah; ke file
  ini (root) hanya kalau berlaku lintas paket. Inilah "progressive learning"
  repo ini — tanpa baris baru, kesalahan yang sama bisa terulang di sesi baru.
