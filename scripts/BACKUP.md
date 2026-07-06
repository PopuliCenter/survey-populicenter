# Backup & Restore Database — Populi Survey

Backup PostgreSQL (`web_survey_platform`) dari container Docker, dengan rotasi
otomatis dan uji-restore yang aman. Semua skрip berjalan di **VPS produksi**.

| Skрip | Fungsi | Sifat |
|-------|--------|-------|
| `backup-db.sh` | Buat backup `.dump` + rotasi (simpan N terbaru) | Aman |
| `verify-restore.sh` | **Uji** backup ke DB sementara, sanity-check, hapus | Aman |
| `restore-db.sh` | **Pemulihan bencana** ke DB produksi | ⚠ Destruktif |

Format backup: `pg_dump -Fc` (custom, terkompресi, bisa di-restore selektif).
Koneksi lewat socket lokal di dalam container → **tidak butuh password**.

## Pakai

```bash
cd /opt/survey-populicenter        # root repo (ada docker-compose.yml)

bash scripts/backup-db.sh          # → backups/web_survey_platform_YYYYmmdd_HHMMSS.dump
bash scripts/verify-restore.sh     # uji backup terbaru (AMAN, ke DB sementara)
bash scripts/restore-db.sh backups/web_survey_platform_20260706_021500.dump   # ⚠ produksi
```

## Jadwalkan backup harian (cron)

```bash
crontab -e
# Backup tiap 02:15, uji-restore tiap Minggu 03:00:
15 2 * * *   cd /opt/survey-populicenter && bash scripts/backup-db.sh    >> /var/log/populi-backup.log 2>&1
0  3 * * 0   cd /opt/survey-populicenter && bash scripts/verify-restore.sh >> /var/log/populi-backup.log 2>&1
```

## Konfigurasi (opsional, via env)

| Env | Default | Keterangan |
|-----|---------|-----------|
| `BACKUP_RETENTION` | `14` | Jumlah backup terbaru yang disimpan |
| `BACKUP_DIR` | `./backups` | Lokasi file backup |
| `PG_SERVICE` | `postgres` | Nama service di compose |
| `DB_NAME` / `DB_USER` | `web_survey_platform` / `surveyapp` | Sesuai compose |

## Penting untuk keandalan

- **Salin backup ke luar VPS** (S3/object storage/rsync ke mesin lain). Backup
  yang hanya ada di server yang sama tidak melindungi dari kehilangan server.
  Contoh sinkron harian ke S3-compatible:
  ```bash
  0 4 * * *  aws s3 sync /opt/survey-populicenter/backups s3://NAMA-BUCKET/db/ --delete
  ```
- **Uji restore** rutin (`verify-restore.sh`) — backup yang tak pernah diuji
  belum tentu bisa dipulihkan.
- File `.dump` **tidak** masuk git (lihat `.gitignore`). Perlakukan sebagai
  data rahasia (berisi seluruh isi DB).
