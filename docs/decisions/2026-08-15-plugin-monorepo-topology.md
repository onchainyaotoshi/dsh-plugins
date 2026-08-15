# ADR 2026-08-15 — Topologi repo plugin: monorepo pribadi (opsi B)

**Status:** Diterima (diputuskan pemilik, 15 Aug 2026).

## Konteks

Firman mau membuat beberapa plugin DSH (dimulai dari dsh-file-explorer — panel
tree file workspace) dan mempublikasikannya agar bisa dipakai orang lain. Tiga pola
repo dipertimbangkan:

- **A — satu plugin satu repo**: simpel, independen penuh, tapi config build
  (tsdown dll) terduplikasi di tiap repo dan sulit berbagi kode antar plugin.
- **B — satu monorepo pribadi** (pnpm workspace, packages/*): tambah plugin =
  tambah folder; preset build bersama; publish tetap per paket npm.
- **C — fork monorepo upstream** (deepseek-ai/deepseek-harness): tooling terlengkap
  (preset build + pnpm dev:web HMR + test suite), tapi harus jaga sinkronisasi
  fork dan plugin ter-couple ke versi dsh tertentu.

## Keputusan

**Opsi B.** Satu repo /home/firman/dsh-plugins/ (di luar workspace agent
/home/firman/deepseek-harness) berisi semua plugin pribadi.

## Konsekuensi

- Runtime DSH tidak kenal repo — dia hanya kenal paket npm bernama yang
  di-install ke profil (dsh.profile.bundles). Satu repo boleh menghasilkan
  banyak paket npm; publish per paket dengan pnpm --filter <nama> publish.
- Instalasi lokal di VPS: dsh plugin --profile web add ./packages/<nama>
  (pnpm link + append bundle otomatis, tanpa edit cordis.patch.yml manual).
- Instalasi oleh orang lain: lewat npm registry (paket prebuilt). Jalur
  github: untuk monorepo tidak direkomendasikan (pnpm install paket root repo,
  bukan subfolder) — catat di README kalau mau mendukungnya.
- Satu pnpm install membangun semua plugin; preset tsdown.client.ts di root
  dipakai bersama.

## Rekam jejak keputusan

- Opsi A ditolak: duplikasi boilerplate build per repo.
- Opsi C ditolak: overkill untuk kasus ini; bisa ditinjau ulang kalau ada rencana
  kontribusi balik ke upstream.
- Keputusan ini juga dirangkum di CLAUDE.md workspace
  (/home/firman/deepseek-harness/CLAUDE.md) agar sesi agent DSH di workspace
  utama ikut tahu tanpa harus membuka repo ini.
