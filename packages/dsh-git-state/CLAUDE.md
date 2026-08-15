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
  kosong; blok pertama = checkout utama = current; baris `branch refs/heads/x`
  / `detached`), `gh pr list --state open --json ...` (best-effort → null).
  Memo per path workspace TTL 5 dtk. Timeout per perintah 6 dtk.
- **Browser half** (`inject: ['slots','sessions']`): registrasi WAJIB lewat
  `ctx.slots.inject` (anti-race); slot kind list wajib `options.id`
  (`'git-state'`), `order: -10` (render ascending; occupant bawaan todo=0,
  goal=10, queue=20 → kita paling atas). Workspace aktif dicocokkan dari
  `sessions.list` (SnapshotStore; cwd canonical ↔ workspace.path, pola
  dsh-file-explorer); override manual via tab bertahan sampai sesi berganti.
  Poll `setInterval` 30 dtk di useEffect (cleanup wajib).
- **Keamanan (warisan wajib dari file-explorer)**: route tidak ikut pagar
  `/api`; satu-satunya pagar = hanya perintah read-only dengan path dari
  `workspaceRegistry` (client tidak pernah mengirim path). Jangan pernah
  tambah perintah tulis (commit/stash pop/checkout) tanpa konfirmasi pemilik.
- Versi dsh target: 0.1.0-rc.6 (seam `shell`, `workspaceRegistry`,
  `sessions.list`, slot `conversation.input.dock` diverifikasi live via
  Inspect provider 18 Aug 2026).

## Lesson learned (jangan diulang)

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
- **Parsing `worktree list --porcelain`**: blok pertama = checkout utama
  (= current), dipisah baris KOSONG (jangan split `\n\n` buta — baris kosong
  rangkap bisa muncul). `branch refs/heads/x` strip prefix `refs/heads/`;
  detached ditandai baris `detached`. Bentuk diverifikasi live di host ini
  (checkout utama + 3 worktree linked).
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
