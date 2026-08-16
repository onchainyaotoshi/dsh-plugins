# dsh-git-state — catatan untuk agent

Strip status git untuk Web UI DeepSeek Harness. **Baca ini sebelum ngoding di
paket ini.** Dokumentasi user-facing ada di `README.md`; file ini berisi
pengetahuan teknis & lesson learned KHUSUS paket ini.

## Apa ini

Satu baris di atas composer (slot `conversation.input.dock`) yang menampilkan
status git workspace aktif: branch, ahead/behind vs upstream, jumlah perubahan
uncommitted, stash, worktree lain, PR open. Klik strip → panel detail.
Auto-refresh 30 dtk. Tujuan: menghilangkan "blank state" — tanpa buka terminal,
pemilik langsung tahu apakah workspace-nya ada uncommitted/stash/worktree/PR.

## Arsitektur & seam

```
src/index.ts          # host half (Node): route HTTP GET /plugins/dsh-git-state/api/state
src/client/index.tsx  # browser half: slot conversation.input.dock (order -10)
cordis.patch.yml      # layer: - insert: [{ id: git-state, name: dsh-git-state }]
```

- **Host half** (`inject: ['webServer','shell','workspaceRegistry','fs']`):
  satu route exact yang mengembalikan status git SEMUA workspace terdaftar.
  Eksekusi via seam `shell` (`ctx.shell.resolve(request)` → `run(spec)`;
  `ShellRunResult { exitCode, timedOut, aborted, stdout: { text, truncated },
  stderr }`; request `{ command, workdir, timeoutMs, stdoutMaxBytes }` — command
  jalan sebagai `bash -c`). Perintah: `rev-parse --abbrev-ref HEAD` /
  `--short HEAD` / `@{upstream}`, `rev-list --left-right --count <up>...HEAD`
  (kiri=behind, kanan=ahead), `status --porcelain=v1` (XY: X=index,
  Y=worktree), `stash list`, `worktree list --porcelain` (blok dipisah baris
  kosong; blok pertama = checkout UTAMA, BUKAN current; baris `branch
  refs/heads/x` / `detached`), `gh pr list --state open --json ...`
  (best-effort → null). Memo per path workspace TTL 5 dtk + dedup in-flight
  (request tumpang tindih berbagi satu jalan, bukan menggandakan). Timeout per
  perintah 6 dtk.
- **Browser half** (`inject: ['slots','sessions']`): registrasi WAJIB lewat
  `ctx.slots.inject` (anti-race); slot kind list wajib `options.id`
  (`'git-state'`), `order: -10` (render ascending; occupant bawaan todo=0,
  goal=10, queue=20 → kita paling atas). Workspace aktif dicocokkan dari
  `sessions.list` (SnapshotStore; cwd canonical ↔ workspace.path, pola
  dsh-file-explorer); override manual via tab bertahan sampai sesi berganti.
  Poll `setInterval` 30 dtk di useEffect (cleanup wajib).
- **Deteksi worktree aktif** (18 Aug 2026): `git worktree list` TIDAK
  menandai checkout yang sedang dipakai — blok pertama SELALU checkout utama
  (dibuktikan: dijalankan dari 5 worktree camis hasilnya sama). Sinyal
  sebenarnya: (1) riwayat `workdir` panggilan bash sesi — host baca event
  `tool/code-dispatch-start` → `data.arguments.workdir` via
  `ctx.get('sessionQuery').readSession(id)` (OPSIONAL, leaf field saja,
  scan dari ekor cap 20 hit, memo TTL 5 dtk; client kirim `?session=<id>` =
  id sesi tab itu → multi-tab dengan worktree berbeda aman); (2) scan
  `/proc` (readlink cwd tiap pid) → `inUse` (proses hidup: dev server dll).
  Prioritas client: riwayat sesi → cwd sesi → linked `inUse` → utama.
  Strip menampilkan branch/sync/perubahan checkout AKTIF, bukan root.
  Tag "dikerjakan sesi lain" via cwd sesi lain yang dikirim CLIENT
  (SnapshotStore live, `snap.byId[id].cwd`) di param `others`=`id|cwd;...`
  — server map ke worktree, TANPA readSession (lihat Lesson learned 16 Aug
  2026). Sinyal = "sesi X sedang di worktree Y sekarang" (current cwd, bukan
  riwayat bash); sinyal proses hidup tetap dari /proc (`inUse`). Kalau
  `sessionQuery` absen → degradasi halus (tanpa riwayat sesi peminta), fitur
  git lain tetap jalan.
- **Keamanan (warisan wajib dari file-explorer)**: route tidak ikut pagar
  `/api`; satu-satunya pagar = hanya perintah read-only dengan path dari
  `workspaceRegistry` (client tidak pernah mengirim path). Jangan pernah
  tambah perintah tulis (commit/stash pop/checkout) tanpa konfirmasi pemilik.
- Versi dsh target: 0.1.0-rc.6 (seam `shell`, `workspaceRegistry`,
  `sessions.list`, slot `conversation.input.dock` diverifikasi live via
  Inspect provider 18 Aug 2026).

## Lesson learned (jangan diulang)

- **Route plugin yang dipoll TIDAK boleh menjenuhkan event loop dsh**
  (kejadian 16 Aug 2026, insiden produksi — situs tak kebuka): `/api/state`
  dipoll client tiap 30 dtk × tiap tab. Tiap request cold (memo TTL 5 dtk <
  poll 30 dtk) dulu menjalankan 9× `readSession` penuh (sesi peminta + 8 sesi
  lain) + ~20+ subproses git per workspace seri + `readdirSync('/proc')`+
  `readlinkSync` per pid di main thread, TANPA dedup in-flight (memo baru
  di-set setelah `collectRepo` selesai). Request menumpuk → event loop jenuh
  → memori merayap 2.4G→3.3G → SEMUA endpoint (termasuk `/` dan
  `llm.providers`) timeout. Gejala khas: cloudflared `Incoming request ended
  abruptly: context canceled` pada `/plugins/dsh-git-state/api/state`;
  `systemctl status dsh` CPU >100% terus naik + memori ikut naik. Fix wajib
  untuk route yang dipoll: (1) dedup in-flight — bagikan **promise** bukan
  nilai (map terpisah, hapus saat settle); (2) memo TTL saja tidak cukup
  kalau TTL < interval poll (tiap poll tetap cold) — dedup in-flight yang
  mencegah stacking; (3) potong beban per request: `readSession` hanya sesi
  peminta, bukan scan 8 sesi lain; (4) I/O sinkron (`readdirSync`/
  `readlinkSync` /proc) memblok main thread → ganti `node:fs/promises` async;
  (5) `/api/state` bukan method PRIVILEGED, tidak ikut pagar `/api`, jadi
  beban di sini langsung tembus ke host — wajib hemat. (6) Tag "dikerjakan
  sesi lain" cukup dari cwd sesi lain yang dikirim client (SnapshotStore
  live, param `others`) — 0 readSession; jangan scan transkrip host utk
  sinyal ini. Verifikasi: 8 request
  concurrent harus berbagi satu jalan (~40ms), bukan 8× menggantung; bandingkan
  CPU/mem sebelum-sesudah di `systemctl status dsh`.
- **Komentar blok JANGAN memuat `*/`** (kejadian 18 Aug 2026): docstring
  `scan /proc/*/cwd ...` memutus komentar di tengah (`*/` dari path /proc)
  → sisa teks jadi kode → rolldown PARSE_ERROR yang menyesatkan (error
  pertama menyalahkan em-dash, padahal itu korban komentar putus). Kalau
  menulis glob berisi `*` + `/` di komentar blok, tulis ulang kalimatnya
  atau pakai komentar baris `//`.
- **`git worktree list` TIDAK menandai current** (18 Aug 2026): blok pertama
  SELALU checkout utama dari mana pun dijalankan; tidak ada penanda
  "worktree yang sedang dipakai" di output git. Jangan ulangi asumsi lama
  (blok pertama = aktif) — tag "aktif" wajib dari sinyal sesi/proses
  (lihat bagian Arsitektur). Kasus pemilik: kerja via bash `cd` ke worktree
  linked → sinyal ada di log sesi (workdir tool call), bukan di git.
- **Perubahan bundle client TIDAK menyebar ke tab yang sudah terbuka**
  (kejadian 18 Aug 2026): bundle dimuat SEKALI saat page boot; pindah
  workspace di sidebar = navigasi SPA internal yang TIDAK me-load ulang
  script — tab yang di-boot sebelum rebuild terus menampilkan versi lama
  sampai halamannya di-reload PENUH. Gejala khas: satu workspace terlihat
  versi baru, workspace lain (di tab lama) tampak versi lama — padahal
  server hanya punya satu bundle. Solusi paling tegas: restart dsh → semua
  tab kehilangan koneksi → dipaksa reload total serempak. Jangan buang waktu
  menyalahkan cache browser.
- **Rebuild produksi saat browser aktif → "failed to import loader entry"**
  (kejadian 18 Aug 2026): tsdown menulis `lib/client.js` di tempat; watcher
  client-modules dsh bisa melihat file SETENGAH JADI → rev baru dengan bundle
  terpotong → browser melempar "bundle script ... failed to load" (log dsh
  tetap bersih, endpoint setelah build selesai 200 + shim utuh). Bukan
  kerusakan permanen — recovery = hard refresh (`Ctrl+Shift+R`). Sebelum
  menyimpulkan bundle rusak, cek dulu: `curl -sS -o /dev/null -w '%{http_code}'
  http://127.0.0.1:3080/plugins/dsh-git-state/client.js` (200) + shim banner/
  footer + `node --check lib/client.js`. Kalau semua OK, tinggal refresh.
  Idealnya rebuild client dilakukan saat pemilik tidak sedang membuka GUI.
- **Lebar strip WAJIB ikut geometri shell**: pakai `--dsh-composer-side-clearance`
  (16px) + `--dsh-composer-card-max-width` (780px) dari root conversation —
  `width:calc(100% - 2*var(--dsh-composer-side-clearance,16px));
  max-width:var(--dsh-composer-card-max-width,780px); margin:0 auto`.
  Tanpa ini strip mepet tepi kolom sementara composer ada margin.
- **`conversation.composer.dock` TOLAK elemen interaktif**: kontrak slot itu
  eksplisit — "Anything the user must click belongs in the tool row instead"
  (`input.left`/`.right`). Strip ini butuh klik (expand + refresh), jadi WAJIB
  di `conversation.input.dock` (khusus konten yang butuh baris sendiri,
  interaktif boleh). Jangan pindah ke composer.dock.
- **Parsing `worktree list --porcelain`**: blok pertama = checkout utama,
  dipisah baris KOSONG (jangan split `\n\n` buta — baris kosong
  rangkap bisa muncul). `branch refs/heads/x` strip prefix `refs/heads/`;
  detached ditandai baris `detached`. Bentuk diverifikasi live di host ini
  (checkout utama + 4 worktree linked).
- **`gh pr list` best-effort**: tanpa gh/auth atau parse gagal → `prs: null`
  (chip PR disembunyikan), JANGAN jadikan error global yang menenggelamkan
  info git lain yang valid.
- **Jangan restart dsh sembarangan** (18 Aug 2026): deployment ini punya sesi
  lain yang aktif; perubahan yang butuh restart (install plugin baru) wajib
  berhenti di titik "tinggal restart" dan menunggu aba-aba pemilik.

## Verifikasi

```sh
# di deployment, SETELAH dsh di-restart
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/plugins/dsh-git-state/client.js   # 200
curl -sS http://127.0.0.1:3080/plugins/dsh-git-state/api/state | head -c 500                      # JSON workspace
```

Bandingkan nilai strip dengan CLI: `git -C <ws> status --porcelain=v1`,
`git stash list`, `git worktree list`, `git rev-list --left-right --count
origin/... ...HEAD`, `gh pr list`. Iterasi UI: `pnpm watch` + refresh browser
(produksi tanpa HMR — endpoint no-cache).

Mockup desain (pratinjau statis interaktif): `design/ui-preview.html`.
