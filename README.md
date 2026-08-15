# dsh-plugins

Monorepo plugin [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — kumpulan plugin DSH buatan komunitas.
Satu repo, banyak paket npm (opsi B — lihat [ADR topologi](docs/decisions/2026-08-15-plugin-monorepo-topology.md)).

## Daftar plugin

| Paket | Deskripsi |
|---|---|
| `dsh-file-explorer` | Panel tree file + viewer source code workspace aktif di Web UI |
| `dsh-tunnel-loopback` | Deployment tunnel/proxy: paksa `connection.isLoopback` di client supaya persistensi settings (tema/bahasa/welcome notice) hidup saat URL browser bukan loopback — WAJIB terdaftar sebelum `@deepseek-ai/dsh-web-app` di `dsh.profile.bundles` |

## Cara develop

```sh
pnpm install
pnpm build          # build semua paket (host half + client bundle)
pnpm watch          # watch client bundle (untuk iterasi UI)
```

## Cara test di VPS

```sh
cd dsh-plugins && pnpm build
dsh plugin --profile web add ./packages/file-explorer
dsh --profile web --dump-config | grep file-explorer   # layer harus muncul
sudo systemctl restart dsh                            # SEKALI, di jeda antar turn!
```

Catatan `dsh-tunnel-loopback`: setelah `dsh plugin add`, **pindahkan manual**
entrinya di `dsh.profile.bundles` ke posisi SEBELUM `@deepseek-ai/dsh-web-app`
(`dsh plugin add` menaruh bundle baru di akhir daftar). Kalau urutannya salah,
host half plugin memperingatkan di log dan fix tidak aktif.

Verifikasi HTTP:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/plugins/dsh-file-explorer/client.js   # 200
curl -sS 'http://127.0.0.1:3080/plugins/dsh-file-explorer/api/workspaces'                              # JSON daftar workspace
```

Iterasi UI berikutnya TANPA restart: `pnpm watch` + refresh browser
(bundle di-serve no-cache; di produksi row HMR di-omit).

## Publish

```sh
pnpm --filter dsh-file-explorer publish --access public
```

User lain tinggal: `dsh plugin --profile web add dsh-file-explorer` + restart dsh.

## Keamanan

Route API plugin ini **tidak** ikut pagar `/api` (method PRIVILEGED), jadi
satu-satunya pagar browser→filesystem adalah **containment workspace** di host
half (`ctx.fs.contains`). Jangan pernah melemahkan boundary ini di plugin
berikutnya, dan pastikan UI yang meng-ekspos route ini tetap di balik
autentikasi deployment (mis. Cloudflare Access).
