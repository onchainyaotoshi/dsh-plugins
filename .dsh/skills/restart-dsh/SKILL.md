---
name: restart-dsh
description: Restart service dsh (DeepSeek Harness) di host ini dengan aman DARI DALAM turn agent — untuk mengaktifkan perubahan host-side/komposisi, atau saat user minta "restart dsh"/"estart". Bisa dijalankan agen Claude Code maupun agen DSH.
---

# Restart dsh.service dengan aman dari dalam sesi agent

## Kapan skill ini dipakai

- Perubahan HOST half plugin (kode Node / route `ctx.webServer` / komposisi cordis / profile) baru aktif setelah restart — host half dimuat saat boot.
- Perubahan CLIENT half saja TIDAK butuh restart: build + hard-refresh browser (endpoint bundle client itu no-cache).
- User minta "bantu restart" / "estart".

## Fakta environment (verifikasi sendiri, jangan asumsi)

```bash
systemctl show dsh.service -p FragmentPath -p User -p ExecStart -p ActiveState -p MainPID
```

- Unit ini SYSTEM scope (`FragmentPath=/etc/systemd/system/dsh.service`), bukan user scope.
- `systemctl --user` GAGAL dari shell agent ("Failed to connect to bus: No medium found") — selalu pakai `sudo systemctl` (scope system).
- Cek sudo passwordless dulu: `sudo -n true`. Kalau gagal → berhenti, minta USER yang menjalankan `sudo systemctl restart dsh.service` di terminal sendiri.
- Ada juga unit `dsh-proxy.service` (proxy loopback terpisah) — JANGAN disentuh kecuali user minta.
- URL web GUI: ambil dari `env | grep DSH_WEB_URL` (biasanya http://127.0.0.1:3080).
- Sesi DSH persist (jsonl) → percakapan SELAMAT setelah restart; user cukup reload URL dan buka sesi lagi.

## Kenapa TIDAK boleh restart langsung di tengah turn

Restart = systemd membunuh seluruh cgroup dsh.service, termasuk proses agent yang sedang menjalankan perintah → turn mati di tengah. Solusi: jadwalkan restart **detached + delay** supaya turn selesai (pesan final terkirim & tersimpan) lebih dulu. Transaksi restart dimiliki systemd (bukan pemanggil), jadi meski proses pemanggil ikut terbunuh saat fase stop, unit tetap start lagi.

## Prosedur lengkap

1. Pastikan build bersih:
   ```bash
   pnpm build                                  # di root repo
   node --check packages/<paket>/lib/index.js  # syntax host bundle
   ```
2. Cek tidak ada agent lain yang lagi kerja (restart mematikan SEMUA sesi DSH di instance ini). Kalau user yang minta restart, itu perintah eksplisit — tetap jalan, tapi ingatkan.
3. Jadwalkan detached (+15 detik), log ke /tmp:
   ```bash
   setsid bash -c 'sleep 15; echo "[$(date -Iseconds)] restart" >> /tmp/dsh-restart.log; sudo -n systemctl restart dsh.service >> /tmp/dsh-restart.log 2>&1' </dev/null >/dev/null 2>&1 &
   ```
4. Langsung akhiri turn dengan pesan ke user: "GUI putus beberapa detik — normal. Reload <URL>, buka sesi lagi."
5. Verifikasi di turn berikutnya:
   ```bash
   systemctl show dsh.service -p ActiveState -p MainPID -p ExecMainStartTimestamp  # MainPID harus BERUBAH
   cat /tmp/dsh-restart.log
   ```

## Troubleshooting

- Unit tidak balik: `sudo systemctl status dsh.service -l --no-pager` lalu `sudo systemctl start dsh.service`.
- Komposisi/profile rusak (boot gagal): validasi SEBELUM restart dengan `dsh --profile web --dump-config` (pakai profile yang benar; lihat `ls ~/.dsh/profiles` — jangan tulis path absolut ke file repo).
- Error client `failed to apply loader entry … single slot "…" already has a registration at priority 0`: register slot single dengan `priority` lebih rendah dari occupant (lowest renders) — lihat pelajaran slot di CLAUDE.md repo.

## Catatan

Kembaran skill ini (untuk Claude Code): `.claude/skills/restart-dsh/SKILL.md` — kalau mengedit, update dua-duanya.
