# ADR 2026-08-17 — Plugin arsip sesi: derivatif ringan unarchive-only (opsi B)

**Status:** Diterima (17 Aug 2026)

## Konteks

- Chat yang tidak terpakai menumpuk di sidebar. Riset (dokumentasi upstream +
  paket terpasang rc.6) menyimpulkan: archive (soft-hide, reversibel) adalah
  praktik yang dianjurkan — sejalan prinsip append-only dsh.
- Aksi "Archive session" ternyata SUDAH built-in di UI rc.6 (row menu → RPC
  `workspace.archiveSession`, bukan privileged), dan UI menyembunyikan sesi
  terarsip otomatis (`archivedSessionIds`).
- Yang tidak ada: **unarchive** dan **delete** — tidak ada seam resmi sama
  sekali. Plugin komunitas MichengAI/dsh-archive-manager (Apache-2.0)
  mengimplementasikannya lewat subclass `WorkspaceRegistry` + fork seluruh
  WorkspaceBrowser/WorkspacePicker (bundle 148 KB tanpa src) + delete permanen
  yang menghapus direktori transkrip/spill (bedah dalam).

## Keputusan

1. **Derivatif ringan, bukan vendor mentah**: tulis ulang dari `src/` sesuai
   konvensi monorepo (tsdown + shim CJS + slots.inject), ambil pola subclass
   registry dari komunitas, TANPA fork UI dan TANPA delete permanen. Lisensi
   Apache-2.0 + kredit derivasi di README.
2. **Cakupan v1 = unarchive + halaman kelola** (keputusan pemilik). Delete
   permanen ditunda — prinsip append-only; bisa jadi v2 terpisah.
3. **Transport**: route HTTP sendiri `POST /plugins/dsh-session-archive/api/unarchive`
   (pola monorepo), bukan typert remote. Unarchive idempoten (retry-safe).
4. **Letak UI**: slot resmi `settings.section`, id `archived-sessions`,
   order 16 (setelah Plugins). Interaksi: dialog konfirmasi (permintaan
   pemilik, walau aksinya reversibel), busy-state, error inline.
5. **Pengecualian konvensi cordis.patch.yml**: `- {id: workspace, disabled: true}`
   + row insert kita — diperlukan untuk mengganti service inti `workspaceRegistry`
   dengan subclass. Posisi bundle di AKHIR `dsh.profile.bundles` justru benar
   (layer terakhir menang atas row default).
6. **git-state**: filter `archivedSessionIds` di tag "dikerjakan sesi lain"
   (host `sessions.list()` terbukti tidak memfilter arsip).

## Konsekuensi

- Kontrak semi-internal parent (`requireState/setState/enqueueOperation`,
  `[Service.init]`) bisa berubah saat dsh upgrade → checklist cek seam wajib
  (konvensi monorepo "Versi dsh target").
- Checkpoint `--dump-config` (row `workspace` disabled) WAJIB sebelum restart —
  salah = boot gagal keras "duplicate service" (bukan silent).
- State unarchive hanya menyentuh field global `archivedSessionIds`; tabel
  `workspaces` tidak tersentuh (slot `sessionIds` dipertahankan → restore posisi).
- Test suite komunitas tidak dibawa (cakupan kita jauh lebih kecil); verifikasi
  via E2E UI + round-trip RPC.

## Rekam jejak keputusan

- 2026-08-17: Riset internet + grep lokal (seam archive, plugin komunitas,
  konvensi monorepo). Mockup UI A–E lewat tunnel; pemilik memilih A + dialog
  konfirmasi. Implementasi + E2E lulus (unarchive 12→11→12, section Settings
  terdaftar, frame update otomatis).
