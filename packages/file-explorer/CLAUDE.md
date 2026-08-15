# dsh-file-explorer — catatan untuk agent

Panel tree file + viewer untuk Web UI DeepSeek Harness. **Baca ini sebelum
ngoding di paket ini.** Dokumentasi user-facing ada di `README.md`; file ini
berisi pengetahuan teknis & lesson learned KHUSUS paket ini (kalau paket
dipindah ke repo sendiri, file ini ikut).

## Arsitektur

```
src/index.ts          # host half (Node): route HTTP list/read/raw/workspaces
src/client/index.tsx  # browser half: seat details (kolom kanan) + sidebar.footer.action
cordis.patch.yml      # layer: - insert: [{ id: file-explorer, name: dsh-file-explorer }]
```

Satu row di `cordis.patch.yml` melayani host half DAN browser roster sekaligus.

### Host half — 4 route exact di `ctx.webServer` (`/plugins/dsh-file-explorer/api/*`)

| Route | Fungsi | Batas |
|---|---|---|
| `GET /workspaces` | daftar workspace terdaftar | — |
| `GET /list` | listing satu direktori | — |
| `GET /read` | isi satu file teks | 512 KiB (`MAX_READ_BYTES`) |
| `GET /raw` | preview biner (gambar) | 8 MiB (`MAX_RAW_BYTES`), Content-Type dari ekstensi (`MIME_BY_EXT`) |

### Security boundary — WAJIB, jangan dilemahkan

Semua akses file lewat `resolveInside()`: cek workspace terdaftar
(`ctx.workspaceRegistry`) lalu `ctx.fs.contains(root, target)` — di luar root
workspace = **403**. Client TIDAK pernah menggabung segmen path sendiri; host
menghitung path tiap entry di `/list`. Route ini **tidak** ikut pagar `/api`
(method PRIVILEGED), jadi containment ini satu-satunya pagar antara browser dan
filesystem host. UI yang meng-ekspos route ini wajib tetap di balik autentikasi
deployment. Boundary ini adalah WARISAN wajib untuk plugin lain yang menyentuh
filesystem.

## Seam dsh yang dipakai

`webServer` (register route exact), `fs` (resolve/contains/listDir/stat/
readText/readBytes), `workspaceRegistry`, `slots`, `layout`
(openDetails/closeDetails), `sessions.list`. Diverifikasi di dsh 0.1.0-rc.6 —
kalau dsh di-upgrade, cek ulang seam-nya dulu.

## Lesson learned (jangan diulang)

- **Register slot UI WAJIB lewat `ctx.slots.inject(namaSlot, () => ctx.slots.register(...))`**
  — JANGAN register langsung di apply(). Register langsung = race dengan
  deklarasi slot oleh ui-layout/ui-sidebar → error "slot is not declared"
  (kejadian nyata 15 Aug 2026).
- **Slot ber-kind `list` WAJIB `options.id`** (identitas entry di ledger list)
  — tanpa id → error `list slot "..." requires options.id` (kejadian nyata
  15 Aug 2026).
- **UI plugin WAJIB token `--dsw-*` + pola shell** (pelajaran 15 Aug 2026):
  versi awal panel ini pakai warna hardcoded + emoji → kelihatan asing.
  Pakai CSS variables theme-aware (body / body[data-ds-dark-theme]; referensi
  nilai: `dsh-client-ui-theme/lib/styles/design-platform.css`): bg
  `--dsw-alias-bg-base/layer-1/2`, border `--dsw-alias-border-l1/l2`, teks
  `--dsw-alias-label-primary/secondary/tertiary`, hover
  `--dsw-alias-interactive-bg-hover`, font shorthand `--dsw-font-*`, kode
  `--dsw-font-markdown-code-block` + `--dsw-alias-markdown-code-block[-banner]`,
  shadow `--dsw-shadow-lv3`. Pola shell: row radius 8px + hover, icon-button
  28px (radius 8px; di header panel pakai 999px kayak close DetailsPanel
  bawaan), icon 16px feather-style SVG (currentColor). Hover/focus TIDAK bisa
  dinyatakan di inline style → inject satu `<style>` scoped lewat ctx.effect
  (return disposer hapus elemen). JANGAN emoji sebagai icon UI.
- **Workspace aktif sesi = `ctx.sessions.list`, tanpa endpoint baru**
  (pelajaran 15 Aug 2026): bentuk `SessionListState { ids, byId, current,
  phase }` dengan `byId[id].cwd` = path canonical; SnapshotStore kompatibel
  `useSyncExternalStore(list.subscribe, list.getSnapshot)`. Cocokkan cwd ke
  `workspace.path` (registri host) di sisi client → auto-select workspace
  aktif, override manual bertahan sampai sesi berganti. Kalau dsh di-upgrade,
  cek ulang bentuk SessionListState ini dulu.
- **Petakan error `FsError.code` di route HTTP, jangan andalkan bentuk sendiri**
  (pelajaran 15 Aug 2026): klik file biner (gambar) → `ctx.fs.readText`
  melempar FsError `FS_NOT_TEXT` ("binary file") → tanpa pemetaan jadi 500
  "internal-error". `sendError` WAJIB petakan: FS_NOT_TEXT → 415 `binary-file`,
  FS_TOO_LARGE → 413, FS_NOT_FOUND → 404, FS_PERMISSION_DENIED /
  FS_SANDBOX_DENIED → 403. Preview biner lewat route `/raw`:
  `ctx.fs.readBytes` + Content-Type dari ekstensi + batas ukuran terpisah —
  TETAP lewat `resolveInside` (containment wajib sama).
- **Panel yang "memakan layout" WAJIB seat `details`, bukan `shell.overlay`**
  (keputusan pemilik, 18 Aug 2026): `shell.overlay` itu layer
  `position:absolute; inset:0` di atas grid — anak-anaknya TIDAK BISA mendorong
  layout (chat tidak terdorong, bukan salah CSS). Kolom kanan beneran = seat
  `details` (kind single, scope session) + `ctx.layout.openDetails()` /
  `closeDetails()`; default lebar 360px, clamp 300–520, ada drag handle.
  Konsekuensi yang DISETUJUI pemilik: seat ini menggantikan (shadow) panel
  "tool details" bawaan (`conversation.details.tool` milik
  ui-conversation/ui-tool) — jangan dianggap bug. Catatan implementasi:
  register dengan `priority: -1` — slot `single` MENOLAK register di priority
  yang sama dengan occupant (throw "already has a registration at priority 0",
  kejadian nyata 18 Aug 2026); yang menang = nilai priority TERENDAH (lowest
  renders). Panggil `openDetails` di useEffect occupant (scope sesi), BUKAN di
  apply — `layout` bisa belum "wired" sebelum root entry mount (error
  "layout: panel actions not wired"); bungkus try/catch. Verifikasi occupancy
  lewat Inspect provider (Slots.listSubTree root "details").

## Verifikasi

```sh
# di deployment, setelah `dsh plugin --profile web add` + restart dsh sekali
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/plugins/dsh-file-explorer/client.js   # 200
curl -sS http://127.0.0.1:3080/plugins/dsh-file-explorer/api/workspaces    # JSON daftar workspace
```

Iterasi UI: `pnpm watch` + refresh browser (produksi tanpa HMR — endpoint
no-cache).
