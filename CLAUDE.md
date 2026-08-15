# dsh-plugins — catatan untuk agent (DSH / Claude Code)

Monorepo plugin DeepSeek Harness. **Baca ini sebelum ngoding di repo ini.**

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
    src/index.ts          # host half (Node): route HTTP list/read/raw/workspaces
    src/client/index.tsx  # browser half: seat details (kolom layout kanan) + sidebar.footer.action
    cordis.patch.yml      # layer: - insert: [{ id: file-explorer, name: dsh-file-explorer }]
  tunnel-loopback/        # paksa connection.isLoopback=true di client (tunnel/proxy)
    src/index.ts          # host half: marker + pemeriksa urutan komposisi
    src/client/index.ts   # browser half: flip isLoopback sebelum settings bind
    cordis.patch.yml      # layer: - insert: [{ id: tunnel-loopback, name: dsh-tunnel-loopback }]
```

## Konvensi

- Nama paket: dsh-<kata> (unscoped). Nama = id plugin = id modul browser.
- Build: pnpm install (sekali) → pnpm build (tsdown; preset bersama tsdown.client.ts).
- Bundle client wajib eksternal semua @deepseek-ai/* (purity gate).
- Bundle client WAJIB punya shim CJS di banner/footer preset (tsdown.client.ts):
  `var module = { exports: {} }; var exports = module.exports;` (banner) +
  `return module.exports;` (footer). Tanpa shim: "exports is not defined" saat
  materialisasi (kejadian nyata 15 Aug 2026). JANGAN dihapus.
- **Register slot UI WAJIB lewat `ctx.slots.inject(namaSlot, () => ctx.slots.register(...))`**
  — JANGAN register langsung di apply(). Register langsung = race dengan deklarasi
  slot oleh ui-layout/ui-sidebar → error "slot is not declared" (kejadian nyata
  15 Aug 2026).
- **Slot ber-kind `list` WAJIB `options.id`** (identitas entry di ledger list)
  — tanpa id → error `list slot "..." requires options.id` (kejadian nyata
  15 Aug 2026).
- **UI plugin WAJIB token `--dsw-*` + pola shell** (pelajaran 15 Aug 2026):
  panel pertama file-explorer pakai warna hardcoded + emoji → kelihatan asing.
  Pakai CSS variables theme-aware (body / body[data-ds-dark-theme]; referensi
  nilai: dsh-client-ui-theme/lib/styles/design-platform.css): bg
  `--dsw-alias-bg-base/layer-1/2`, border `--dsw-alias-border-l1/l2`, teks
  `--dsw-alias-label-primary/secondary/tertiary`, hover
  `--dsw-alias-interactive-bg-hover`, font shorthand `--dsw-font-*`, kode
  `--dsw-font-markdown-code-block` + `--dsw-alias-markdown-code-block[-banner]`,
  shadow `--dsw-shadow-lv3`. Pola shell: row radius 8px + hover, icon-button
  28px (radius 8px; di header panel pakai 999px kayak close DetailsPanel
  bawaan), icon 16px feather-style SVG (currentColor). Hover/focus
  TIDAK bisa dinyatakan di inline style → inject satu `<style>` scoped lewat
  ctx.effect (return disposer hapus elemen). JANGAN emoji sebagai icon UI.
- **Workspace aktif sesi = `ctx.sessions.list`, tanpa endpoint baru** (pelajaran
  15 Aug 2026): bentuk `SessionListState { ids, byId, current, phase }` dengan
  `byId[id].cwd` = path canonical; SnapshotStore kompatibel
  `useSyncExternalStore(list.subscribe, list.getSnapshot)`. Cocokkan cwd ke
  `workspace.path` (registri host) di sisi client → auto-select workspace aktif,
  override manual bertahan sampai sesi berganti. Kalau dsh di-upgrade, cek ulang
  bentuk SessionListState ini dulu.
- **Petakan error `FsError.code` di route HTTP, jangan andalkan bentuk sendiri**
  (pelajaran 15 Aug 2026): klik file biner (gambar) → `ctx.fs.readText` melempar
  FsError `FS_NOT_TEXT` ("binary file") → tanpa pemetaan jadi 500 "internal-error".
  sendError WAJIB petakan: FS_NOT_TEXT → 415 `binary-file`, FS_TOO_LARGE → 413,
  FS_NOT_FOUND → 404, FS_PERMISSION_DENIED/FS_SANDBOX_DENIED → 403. Preview biner
  (gambar) lewat route /raw: `ctx.fs.readBytes` + Content-Type dari ekstensi +
  batas ukuran terpisah — TETAP lewat resolveInside (containment wajib sama).
- **Panel yang "memakan layout" WAJIB seat `details`, bukan `shell.overlay`**
  (keputusan pemilik, 18 Aug 2026): `shell.overlay` itu layer `position:absolute;
  inset:0` di atas grid — anak-anaknya TIDAK BISA mendorong layout (chat tidak
  terdorong, bukan salah CSS). Kolom kanan beneran = seat `details` (kind
  single, scope session) + `ctx.layout.openDetails()`/`closeDetails()`; default
  lebar 360px, clamp 300–520, ada drag handle. Konsekuensi yang DISETUJUI
  pemilik: seat ini menggantikan (shadow) panel "tool details" bawaan
  (`conversation.details.tool` milik ui-conversation/ui-tool) — jangan dianggap
  bug. Catatan implementasi: register dengan `priority: -1` — slot `single`
  MENOLAK register di priority yang sama dengan occupant (throw "already has a
  registration at priority 0", kejadian nyata 18 Aug 2026); yang menang = nilai
  priority TERENDAH (lowest renders). Panggil openDetails di useEffect occupant
  (scope sesi), BUKAN di apply — `layout` bisa belum "wired" sebelum root entry
  mount (error "layout: panel actions not wired"); bungkus try/catch. Verifikasi
  occupancy lewat Inspect provider (Slots.listSubTree root "details").
- **Skill `restart-dsh` kembar** (18 Aug 2026): `.dsh/skills/restart-dsh/SKILL.md`
  (dibaca DSH; terverifikasi live — watcher filesystem provider langsung publish
  ke katalog sesi) + `.claude/skills/restart-dsh/SKILL.md` (dibaca Claude Code).
  Konten SAMA, edit dua-duanya. Isinya: restart `dsh.service` dari dalam turn
  agent — detached + sleep (jangan matikan turn sendiri), `sudo -n systemctl`
  scope system (`systemctl --user` gagal di shell agent), verifikasi MainPID
  baru, sesi persist jadi aman, client-only = cukup build + refresh.
- Tambah plugin baru: salin packages/file-explorer → ganti nama + isi → otomatis
  masuk workspace (packages/*). Perbarui daftar di bagian "Struktur".
- **Plugin yang butuh aktif LEBIH AWAL dari baris dsh-web-app (pelajaran
  18 Aug 2026 — dsh-tunnel-loopback)**: urutan AKTIVASI client = urutan
  REGISTRASI fiber = urutan import modul, dan import menunggu jaringan — posisi
  row di komposisi saja TIDAK cukup. Dua hal yang membuatnya deterministik:
  (1) `dsh.client.immediately = true` → shell me-prefetch bundle SEBELUM boot
  plugin (baris `prefetchImmediateTier` di shell), jadi import resolve instan
  dan fiber terdaftar paling awal; (2) letakkan bundle SEBELUM
  `@deepseek-ai/dsh-web-app` di `dsh.profile.bundles` — `dsh plugin add`
  menaruh bundle baru di AKHIR, wajib dipindah manual. `insert` di
  cordis.patch.yml tidak punya kontrol posisi (selalu append). Host half
  dsh-tunnel-loopback memverifikasi urutan lewat `ctx.loader.entries()` dan
  berteriak di log kalau salah. Catatan: row tanpa host half TIDAK masuk
  client roster (client-modules mengecek `entry.fiber !== void 0`), jadi
  plugin client-only tetap butuh host half minimal (marker).
- Test di VPS: dsh plugin --profile web add ./packages/<nama> → verifikasi
  dsh --profile web --dump-config → restart dsh SEKALI di jeda antar turn
  (sesi persist, jangan restart saat ada agent lagi kerja).
- Iterasi UI: pnpm watch + refresh browser (produksi tanpa HMR — endpoint no-cache).
- Versi dsh target: 0.1.0-rc.6 — seam ctx.fs / ctx.webServer / ctx.workspaceRegistry /
  seat details + ctx.layout (openDetails/closeDetails) + sidebar.footer.action
  diverifikasi di versi ini; kalau dsh di-upgrade, cek ulang seam-nya dulu.
- Publish: build dulu, lalu pnpm --filter <paket> publish --access public.
  User lain: dsh plugin --profile web add <nama> + restart.
- **PRIVASI (wajib, pasca-insiden 15 Aug 2026): repo ini PUBLIK.** Jangan pernah
  menulis nama asli, email pribadi, path absolut /home/..., atau identitas VPS ke
  file repo ini. Identitas git = noreply (onchainyaotoshi@users.noreply.github.com),
  sudah diset repo-lokal — jangan diubah ke email pribadi. Sebelum push: audit
  grep + git log (lihat aturan lengkap di CLAUDE.md workspace utama).
- **Disiplin belajar: SETIAP insiden/error yang makan waktu → tambah baris
  pelajaran di file ini SEBELUM commit fix-nya.** Inilah "progressive learning"
  repo ini — tanpa baris baru, kesalahan yang sama bisa terulang di sesi baru.
