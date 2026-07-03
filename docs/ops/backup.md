# Backup & Manajemen Penyimpanan — Populi Survey

Panduan menjaga server tidak penuh + backup keamanan (disaster recovery).
Aplikasi berjalan di Docker Compose (backend, postgres, redis, nginx) di VPS.

---

## 1. Reclaim disk otomatis (WAJIB diaktifkan)

File media (foto/audio/tanda tangan) di `uploads/` **tidak** ikut terhapus oleh
reaper terjadwal kecuali diaktifkan. Sejak versi ini, **cleanup/hapus survei
sudah menghapus file fisik langsung**. Sebagai jaring pengaman tambahan, aktifkan
juga reaper berkala untuk membersihkan file yatim (mis. sisa proses gagal):

Di env worker (`docker-compose.yml` service worker atau `.env`):
```
MEDIA_REAPER_ENABLED=true
MEDIA_REAPER_AGE_HOURS=48        # hapus file yatim yang lebih tua dari 48 jam
MAINTENANCE_INTERVAL_MIN=60      # jalan tiap 60 menit
```
Reaper hanya menghapus file yang **tak dirujuk** respons/jawaban mana pun — aman.

---

## 2. Backup otomatis (pg_dump DB + tar media) via cron

Buat skrip `/opt/populi/backup.sh` di VPS:

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/populi
mkdir -p "$DEST"

# --- 1. Dump database (via container postgres) ---
# Ganti nama service/db/user sesuai docker-compose.yml Anda.
docker compose -f /var/www/survey-populicenter/docker-compose.yml \
  exec -T postgres pg_dump -U postgres web_survey_platform \
  | gzip > "$DEST/db-$STAMP.sql.gz"

# --- 2. Arsipkan media uploads ---
tar -czf "$DEST/media-$STAMP.tar.gz" \
  -C /var/www/survey-populicenter/backend uploads

# --- 3. Retensi lokal: simpan 7 hari terakhir ---
find "$DEST" -name 'db-*.sql.gz'    -mtime +7 -delete
find "$DEST" -name 'media-*.tar.gz' -mtime +7 -delete

# --- 4. (Disarankan) Kirim off-site ke storage murah ---
# Pasang rclone (https://rclone.org), konfigurasi remote 'b2'/'s3'/'wasabi'.
# rclone copy "$DEST/db-$STAMP.sql.gz"    remote:populi-backup/db/
# rclone copy "$DEST/media-$STAMP.tar.gz" remote:populi-backup/media/

echo "[backup] selesai: $STAMP"
```

Jadwalkan harian jam 02:00 (crontab):
```
0 2 * * * /opt/populi/backup.sh >> /var/log/populi-backup.log 2>&1
```

> **Penting:** backup di server yang SAMA tidak melindungi dari kegagalan disk.
> Aktifkan langkah #4 (off-site) — Backblaze B2 / Wasabi / S3 sangat murah.

### Restore (ringkas)
```bash
# DB:
gunzip -c db-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose exec -T postgres psql -U postgres web_survey_platform
# Media:
tar -xzf media-YYYYMMDD-HHMMSS.tar.gz -C /var/www/survey-populicenter/backend
```

---

## 3. Arsip per survei (dari dashboard)

Untuk mengarsipkan **satu survei** sebelum menghapusnya (melegakan disk tanpa
kehilangan data), gunakan laman **Penyimpanan** di sidebar admin → **Unduh Arsip
(ZIP)** (berisi data respons + foto + suara), lalu **Hapus**. Cocok untuk survei
yang sudah selesai.

---

## 4. Pantauan

Ukuran disk `uploads/` + status DB/Redis dapat dilihat di laman **Status Sistem**
(sidebar admin). Cek berkala; bila mendekati penuh, arsipkan & hapus survei lama.
