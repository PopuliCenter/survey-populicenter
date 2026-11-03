# Media → MinIO (Object Storage) — Runbook Migrasi

Memindahkan penyimpanan media responden (foto, audio wawancara, tanda tangan)
dari **disk lokal** ke **MinIO** (S3-compatible) — menutup pelanggaran 12-factor
faktor 4 (backing service). Setelah ini backend menjadi benar-benar stateless
untuk media: bisa di-scale, dan kehilangan disk container ≠ kehilangan media.

> 🔒 **Prinsip aman:** migrasi ini **opt-in & reversibel**. Kode punya
> **fallback dua arah** — mode `s3` tetap membaca file lama dari disk; mode
> `disk` tetap membaca objek yang terlanjur di MinIO. Disk **tidak dihapus**
> oleh migrasi, jadi selalu ada jaring pengaman.

## Arsitektur

- MinIO berjalan di **stack ini sendiri** (`docker-compose.yml`), bukan menyandar
  ke MinIO tetangga (survei online) — supaya isolasi tetap utuh.
- Di-bind **127.0.0.1 saja** (port host 9100/9101); backend & worker mengaksesnya
  via network internal Docker (`minio:9000`). Tidak pernah ke internet.
- Driver dipilih env **`MEDIA_STORAGE`**: `disk` (default) atau `s3`.
- Kunci objek = path persis seperti tersimpan di DB (`uploads/photos/2026-.../x.jpg`)
  → **kolom DB tidak perlu diubah**, migrasi tak menyentuh Postgres.

## Langkah (urut — jangan lompat)

### 0 · Tambah kredensial ke `.env` server (WAJIB — deploy gagal tanpa ini)
`docker-compose.yml` kini mewajibkan dua variabel (dipakai server MinIO **dan**
sebagai access/secret key backend):
```
MINIO_ROOT_USER=<user kuat, mis. populi-media>
MINIO_ROOT_PASSWORD=<password kuat & panjang>
```
Opsional (ada default): `MINIO_BUCKET=survey-media`.
⚠️ Password ini rahasia — **jangan** commit ke repo, taruh hanya di `.env` server.

### 1 · Deploy kode + nyalakan MinIO (MASIH mode disk — no-op perilaku)
```bash
cd /var/www/survey-populicenter && git pull
docker compose up -d --build backend worker    # bawa kode driver + entrypoint
docker compose up -d minio                      # nyalakan MinIO (idle, belum dipakai)
docker compose ps                               # minio Up; backend/worker healthy
```
Pada titik ini `MEDIA_STORAGE` masih `disk` → **perilaku persis seperti sebelumnya**.
Upload/penyajian/ekspor semua lewat disk. MinIO hanya siaga.

### 2 · Migrasikan berkas disk → MinIO (idempoten, tak menghapus disk)
```bash
docker compose exec backend node scripts/migrate-media-to-minio.cjs --check   # pratinjau
docker compose exec backend node scripts/migrate-media-to-minio.cjs           # eksekusi
docker compose exec backend node scripts/migrate-media-to-minio.cjs --check   # verifikasi
```
Target: `--check` terakhir menampilkan **"Perlu diunggah: 0"** +
**"✅ aman flip MEDIA_STORAGE=s3"**. Aman diulang bila terputus di tengah.

### 3 · Flip ke MinIO
Di `.env` server: `MEDIA_STORAGE=s3`, lalu:
```bash
docker compose up -d backend worker    # recreate dgn env baru
```

### 4 · Verifikasi END-TO-END (jangan lewati)
- Buka dashboard → buka satu respons **lama** → **foto/audio/tanda tangan tampil**
  (ini menguji fallback: file lama masih di disk, dibaca via fallback). ✅
- Isi **satu respons baru** dari APK/web dengan media → submit → buka di dashboard
  → media tampil (ini menguji jalur tulis+baca MinIO murni). ✅
- Ekspor ZIP satu survei → buka → folder `media/` berisi berkas. ✅

### 5 · (NANTI, setelah beberapa hari yakin) Pangkas disk
Disk sengaja **dibiarkan** sebagai cadangan. Setelah yakin (mis. 1–2 minggu +
sudah ada di backup MinIO), boleh kosongkan `uploads/photos|audio|signatures`
di volume. **Jangan buru-buru** — selama fallback dua arah aktif, keduanya aman.

## Rollback (bila ada masalah di langkah 3–4)
Set `MEDIA_STORAGE=disk` lagi → `docker compose up -d backend worker`. File yang
sudah terunggah ke MinIO tetap terbaca (fallback), file lama di disk juga. Nol
kehilangan data. Selidiki, lalu ulangi flip saat siap.

## ⚠️ Backup: sekarang ada DUA sumber → WAJIB `backup-minio.sh`
Setelah flip, media baru hidup di **volume `miniodata`**, bukan lagi `uploads`.
`backup-media.sh` (tar `uploads`) TIDAK mencakupnya. Penutupnya sudah ada:
**`scripts/backup-minio.sh`** — salin seluruh bucket → `backups/minio_*.tar.gz`,
memakai `backend/scripts/media-mirror.cjs` di dalam image backend kita sendiri.

Aktifkan SEBELUM survei masal:
```bash
# uji manual sekali
bash scripts/backup-minio.sh
# lalu tambah ke crontab (mis. 02:40, setelah backup-media 02:30):
40 2 * * *  cd /var/www/survey-populicenter && bash scripts/backup-minio.sh >> /var/log/populi-backup.log 2>&1
```
- QNAP menarik SELURUH `backups/`, jadi `minio_*.tar.gz` ikut ter-off-site **otomatis** (tanpa ubah cron QNAP).
- `ops-check.sh` kini memantau kesegaran `minio_*` **hanya bila** `MEDIA_STORAGE=s3`.
- Restore: `scripts/restore-minio.sh <arsip>` (atau `restore-media.sh` bila kembali
  ke mode disk — arsipnya kompatibel).

⚠️ **Baru setelah `backup-minio.sh` berjalan rutin**, langkah 5 (pangkas disk)
boleh dipertimbangkan. Sebelum itu, disk = satu-satunya salinan ter-backup untuk
media pra-migrasi.

## 🚨 Image MinIO sudah tak bisa ditarik lagi (sejak Okt 2026)
`minio/minio` dan `minio/mc` tidak lagi tersedia di Docker Hub (404) dan binary di
`dl.min.io` membalas 410. Akibatnya backup media berhenti 24 Okt–3 Nov 2026 begitu
image `minio/mc` lokal di VPS hilang; alat backup kini tak lagi memakai `mc`.

Yang harus diingat:
- **`minio/minio:latest` di server adalah salinan terakhir.** Selama container-nya
  ada, `docker image prune -a` tak menghapusnya. Jangan menjalankan prune setelah
  `docker compose down`, karena image yang tak terpakai ikut terhapus.
- **Jangan `docker compose pull` tanpa nama service**, karena akan gagal pada minio.
  Pakai bentuk baku `docker compose pull backend worker nginx`.
- `backup-minio.sh` mengarsipkan image ini ke `backups/image-minio-server_*.tar.gz`
  (ikut ditarik QNAP). Di server baru, muat dulu sebelum `docker compose up -d`:
  ```bash
  gunzip -c backups/image-minio-server_*.tar.gz | docker load
  ```
- Rencana jangka panjang: MinIO komunitas tak lagi menerima rilis image, jadi perlu
  keputusan pindah ke image lain atau penyimpanan S3 lain. Belum dikerjakan.

## Batasan yang diketahui (jujur)
- **Reaper media yatim** (`maintenance.js`) menyapu disk; di mode s3 ia no-op aman
  (tak salah hapus), tapi orphan di MinIO belum disapu otomatis → hanya menumpuk,
  tak berisiko data loss. Reaper berbasis `listObjects` = pekerjaan lanjutan.
- Konsol MinIO di `http://127.0.0.1:9101` (via SSH tunnel) untuk inspeksi manual.
