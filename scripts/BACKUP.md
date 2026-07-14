# Backup, Restore & Pemantauan — Populi Survey

Semua skrip berjalan di **VPS produksi**, dari root repo (`/var/www/survey-populicenter`).

> 🚨 **DUA backup, bukan satu.** Database dan media disimpan **terpisah**:
> - **Postgres** → jawaban, responden, user, survei
> - **Volume Docker `uploads`** → **foto, tanda tangan, dan REKAMAN AUDIO WAWANCARA**
>
> `pg_dump` **tidak** menyentuh media. Kalau hanya DB yang di-backup, kehilangan
> server = **seluruh rekaman wawancara lenyap** meski dump DB selamat.
> Jalankan **keduanya**.

| Skrip | Fungsi | Sifat |
|-------|--------|-------|
| `backup-db.sh` | Dump Postgres (`.dump`) + rotasi | Aman |
| `backup-media.sh` | Arsip volume `uploads` (`.tar.gz`) + rotasi | Aman |
| `verify-restore.sh` | **Uji** dump DB ke DB sementara, lalu hapus | Aman |
| `restore-media.sh --dry-run` | **Uji** arsip media tanpa menyentuh produksi | Aman |
| `ops-check.sh` | Cek disk, kesegaran backup, container | Aman |
| `restore-db.sh` | Pemulihan bencana → DB produksi | ⚠ Destruktif |
| `restore-media.sh` | Pemulihan bencana → volume media | ⚠ Destruktif |

## Pakai

```bash
cd /var/www/survey-populicenter

bash scripts/backup-db.sh              # → backups/web_survey_platform_YYYYmmdd_HHMMSS.dump
bash scripts/backup-media.sh           # → backups/uploads_YYYYmmdd_HHMMSS.tar.gz
bash scripts/ops-check.sh              # cek kesehatan (diam bila semua sehat)

# Uji (AMAN — tidak menyentuh produksi):
bash scripts/verify-restore.sh
bash scripts/restore-media.sh --dry-run backups/uploads_20260715_023000.tar.gz

# Pemulihan bencana (⚠ produksi):
bash scripts/restore-db.sh    backups/web_survey_platform_20260715_021500.dump
bash scripts/restore-media.sh backups/uploads_20260715_023000.tar.gz
```

## Jadwal cron (salin apa adanya)

```bash
crontab -e
```
```cron
MAILTO=info@populicenter.org

15 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-db.sh    >> /var/log/populi-backup.log 2>&1
30 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-media.sh >> /var/log/populi-backup.log 2>&1
0  4 * * *  cd /var/www/survey-populicenter && bash scripts/sync-offsite.sh >> /var/log/populi-backup.log 2>&1
0  7 * * *  cd /var/www/survey-populicenter && bash scripts/ops-check.sh
0  3 * * 0  cd /var/www/survey-populicenter && bash scripts/verify-restore.sh >> /var/log/populi-backup.log 2>&1
```

`ops-check.sh` sengaja **tanpa** redirect log: ia diam bila sehat, dan hanya
mencetak (→ cron mengirim email ke `MAILTO`) bila ada masalah.

## Salinan luar server (WAJIB)

Backup yang hanya ada di VPS **tidak melindungi dari VPS-nya sendiri hilang**
(disk rusak, akun ditangguhkan, salah `rm`). Pakai storage murah — Backblaze B2 /
Wasabi / S3 / bahkan `rsync` ke mesin lain.

Contoh dengan [rclone](https://rclone.org) (`rclone config` dulu, remote `b2`):

```bash
# scripts/sync-offsite.sh — buat sendiri sesuai remote Anda:
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/survey-populicenter
rclone copy backups/ b2:populi-backup/ --include 'web_survey_platform_*.dump' --include 'uploads_*.tar.gz'
touch /var/lib/populi-offsite-ok      # penanda untuk ops-check.sh
```

Lalu aktifkan pemantauannya:
```bash
# di crontab, sebelum ops-check.sh:
OFFSITE_MARKER=/var/lib/populi-offsite-ok
```

> ⚠️ File backup berisi **seluruh data responden**. Perlakukan sebagai rahasia:
> gunakan bucket **privat**, dan pertimbangkan enkripsi (`rclone crypt`).

## Konfigurasi (env, opsional)

| Env | Default | Keterangan |
|-----|---------|-----------|
| `BACKUP_RETENTION` | `14` | Jumlah backup terbaru yang disimpan |
| `BACKUP_DIR` | `./backups` | Lokasi berkas backup |
| `DISK_WARN_PCT` | `80` | Ambang peringatan disk (ops-check) |
| `BACKUP_MAX_AGE_H` | `30` | Backup dianggap basi bila lebih tua dari ini |
| `OFFSITE_MARKER` | *(kosong)* | Berkas penanda sinkron off-site |

## Kenapa uji-restore itu wajib

**Backup yang belum pernah diuji belum tentu backup.** Kegagalan paling berbahaya
bukan backup yang error (itu berisik dan ketahuan) — melainkan backup yang **sukses
tapi kosong**: berkas tercipta tiap hari, ukurannya wajar, dan Anda merasa aman
sampai hari Anda benar-benar butuh memulihkannya.

Karena itu `backup-media.sh` **menolak** menghasilkan arsip kosong bila volume
berisi berkas, dan `restore-media.sh` **menolak** memulihkan dari arsip kosong.
Jalankan `verify-restore.sh` mingguan (sudah ada di cron di atas).

## Pemantauan uptime (di luar server)

`ops-check.sh` berjalan **di dalam** server — kalau servernya mati, ia ikut mati
dan tak bisa memberi tahu siapa pun. Karena itu perlu pemantau **eksternal**:

- Daftarkan **`https://populicenter.com/health`** di UptimeRobot / Better Stack /
  Healthchecks.io (semuanya punya paket gratis).
- Interval 5 menit, notifikasi ke **email + WhatsApp/Telegram**.
- Endpoint itu mengembalikan `{"status":"ok"}` dan **tidak** butuh autentikasi.

Selama masa **review Play Store**, pemantau ini penting: reviewer Google benar-benar
menjalankan app terhadap server ini — server mati saat review = app ditolak.
