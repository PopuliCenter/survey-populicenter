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
RCLONE_REMOTE=b2:populi-backup
OFFSITE_MARKER=/var/lib/populi-offsite-ok
HC_PING_URL=https://hc-ping.com/GANTI-DENGAN-UUID-ANDA

15 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-db.sh      >> /var/log/populi-backup.log 2>&1
30 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-media.sh   >> /var/log/populi-backup.log 2>&1
0  4 * * *  cd /var/www/survey-populicenter && bash scripts/sync-offsite.sh   >> /var/log/populi-backup.log 2>&1
0  7 * * *  cd /var/www/survey-populicenter && bash scripts/ops-check.sh      >> /var/log/populi-ops.log 2>&1
0  3 * * 0  cd /var/www/survey-populicenter && bash scripts/verify-restore.sh >> /var/log/populi-backup.log 2>&1
```

> ⚠️ **Jangan andalkan `MAILTO` cron.** VPS umumnya **tidak punya MTA**, sehingga
> email cron tidak ke mana-mana dan peringatan tenggelam di berkas log yang tak
> pernah dibaca siapa pun. Pakai `HC_PING_URL` (lihat di bawah).

## Dead man's switch (Healthchecks.io — gratis)

`ops-check.sh` hidup **di dalam** server. Kalau server mati, cron dihapus, atau
skripnya sendiri tak pernah jalan, ia **tidak bisa mengeluh** — dan justru itulah
kegagalan paling berbahaya: senyap, dan baru ketahuan saat Anda butuh backup.

Solusinya adalah pemantau yang mengeluh **karena tidak dihubungi**:

1. Daftar di [healthchecks.io](https://healthchecks.io) (gratis) → buat check
   *"Populi ops-check"* → **Period 1 day**, **Grace 6 hours**.
2. Salin *ping URL*-nya → set `HC_PING_URL` di crontab (contoh di atas).
3. Hubungkan notifikasi ke **email + WhatsApp/Telegram**.

Hasilnya `ops-check.sh` menangkap dua kegagalan sekaligus:

| Kejadian | Yang terjadi | Anda tahu? |
|---|---|---|
| Disk penuh / backup basi / container mati | ping `/fail` | ✅ alarm segera |
| **Cron mati, skrip tak pernah jalan, server tumbang** | **tak ada ping sama sekali** | ✅ alarm dari Healthchecks |

Baris kedua itu **tidak mungkin** dideteksi oleh apa pun yang hidup di server ini —
dan itulah persis kegagalan yang sempat terjadi (cron backup DB tak pernah ada,
baru ketahuan seminggu kemudian).

## Salinan luar server (WAJIB) — `sync-offsite.sh`

Backup yang hanya ada di VPS **tidak melindungi dari VPS-nya sendiri hilang**
(disk rusak, akun ditangguhkan, salah `rm`). Skripnya sudah ada; yang perlu Anda
lakukan **sekali**:

1. Buat **bucket privat** di penyedia murah (Backblaze B2 / Wasabi / S3).
2. `apt install rclone` → `rclone config` → buat remote, mis. `b2`.
   ⚠️ **Kunci akses hanya Anda yang mengetik**, di dalam `rclone config`.
   Jangan pernah menaruhnya di skrip, `.env`, atau repo.
3. (Disarankan) Buat remote **`crypt`** di atasnya — berkas backup berisi
   **seluruh data responden**, jadi enkripsi at-rest sangat dianjurkan.
4. Uji:
   ```bash
   RCLONE_REMOTE=b2:populi-backup bash scripts/sync-offsite.sh
   ```

Skrip ini **gagal keras** bila `RCLONE_REMOTE` kosong, rclone belum ada, backup
belum lengkap, atau remote ternyata kosong setelah sinkron — sengaja, agar tidak
pernah "berhasil" tanpa benar-benar menyalin apa pun.

Setelah sukses, ia menyentuh `/var/lib/populi-offsite-ok`, dan `ops-check.sh`
akan memantau kesegarannya.

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
