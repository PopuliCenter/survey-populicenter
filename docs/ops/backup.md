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

## 2. Backup otomatis (DB + media) via cron

➜ **Panduan lengkap & skrip siap pakai: [`scripts/BACKUP.md`](../../scripts/BACKUP.md)**

Ringkasnya, jalankan **dua** backup — DB dan media itu terpisah:

```bash
cd /var/www/survey-populicenter
bash scripts/backup-db.sh       # Postgres  → backups/*.dump
bash scripts/backup-media.sh    # media     → backups/uploads_*.tar.gz
bash scripts/ops-check.sh       # cek disk + kesegaran backup + container
```

> 🚨 **Media TIDAK ada di database.** Foto, tanda tangan, dan **rekaman audio
> wawancara** ada di *named volume* Docker `uploads`. `pg_dump` tidak
> menyentuhnya. Backup DB saja = rekaman wawancara hilang bila server hilang.

> ⚠️ **Jangan** mencoba mengarsipkan media lewat path host seperti
> `tar -C /var/www/survey-populicenter/backend uploads` — path itu **tidak ada**.
> `uploads` adalah *named volume*, hanya bisa diakses **lewat container**
> (itulah yang dilakukan `backup-media.sh`). Perintah semacam itu akan
> menghasilkan arsip **kosong tanpa error** — rasa aman palsu yang berbahaya.

Jadwal cron lengkap (backup, off-site, uji-restore mingguan, cek harian) ada di
[`scripts/BACKUP.md`](../../scripts/BACKUP.md).

### Restore (ringkas)
```bash
bash scripts/restore-db.sh    backups/web_survey_platform_YYYYmmdd_HHMMSS.dump   # ⚠ destruktif
bash scripts/restore-media.sh backups/uploads_YYYYmmdd_HHMMSS.tar.gz             # ⚠ destruktif

# Uji dulu tanpa menyentuh produksi:
bash scripts/verify-restore.sh
bash scripts/restore-media.sh --dry-run backups/uploads_YYYYmmdd_HHMMSS.tar.gz
```

---

## 3. Arsip per survei (dari dashboard)

Untuk mengarsipkan **satu survei** sebelum menghapusnya (melegakan disk tanpa
kehilangan data), gunakan laman **Penyimpanan** di sidebar admin → **Unduh Arsip
(ZIP)** (berisi data respons + foto + suara), lalu **Hapus**. Cocok untuk survei
yang sudah selesai.

---

## 4. Pantauan

**Di dalam server** — `bash scripts/ops-check.sh` (jadwalkan harian via cron).
Memeriksa pemakaian disk, ukuran volume media, **kesegaran backup** (mendeteksi
cron backup yang diam-diam mati), dan kesehatan semua container. Ia **diam bila
sehat**, dan hanya mengirim email lewat cron bila ada masalah.

**Di luar server** — daftarkan `https://populicenter.com/health` di UptimeRobot /
Better Stack / Healthchecks.io (paket gratis cukup), interval 5 menit.
Ini wajib: kalau servernya mati, `ops-check.sh` ikut mati dan tak bisa
memberi tahu siapa pun.

**Di dashboard** — ukuran `uploads/` + status DB/Redis ada di laman **Status Sistem**
(sidebar admin). Bila mendekati penuh, arsipkan & hapus survei lama.
