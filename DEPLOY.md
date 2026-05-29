# Deploy Populi Survey ke Production

## Langkah 1: Push ke GitHub

Di komputer lokal, buka terminal di folder project:

```bash
git init
git add .
git commit -m "Initial commit - Populi Survey Platform"
git branch -M main
git remote add origin https://github.com/PopuliCenter/survey-populicenter.git
git push -u origin main
```

Jika diminta login GitHub, gunakan Personal Access Token:
- GitHub → Settings → Developer Settings → Personal Access Tokens → Generate

## Langkah 2: Setup VPS

SSH ke VPS:
```bash
ssh root@187.127.114.159
```

Download dan jalankan deploy script:
```bash
curl -fsSL https://raw.githubusercontent.com/PopuliCenter/survey-populicenter/main/deploy.sh -o deploy.sh
bash deploy.sh
```

Script ini otomatis:
- Install Docker
- Clone repo
- Generate secrets (.env)
- Build semua container
- Jalankan migration database
- Seed admin default

## Langkah 3: Konfigurasi Domain (Opsional tapi Direkomendasikan)

1. Di DNS provider, tambahkan A record:
   - `survey.populicenter.com` → `187.127.114.159`

2. Di VPS, edit `.env`:
   ```bash
   cd /opt/survey-populicenter
   nano .env
   ```
   Ubah `FRONTEND_URL=https://survey.populicenter.com`

3. Restart:
   ```bash
   docker compose up -d --force-recreate backend nginx
   ```

## Langkah 4: Build APK Android

Di komputer lokal:

1. Edit `frontend/src/services/api.js` — default URL:
   ```
   return 'http://187.127.114.159:3000';
   ```
   Atau biarkan user input URL via Server Config.

2. Build:
   ```bash
   cd frontend
   npm run cap:build
   ```

3. Di Android Studio:
   - Build → Generate Signed Bundle/APK → APK
   - Buat keystore → Build release

4. Distribusi `app-release.apk` ke TPD

## Langkah 5: Update Deployment

Setelah ada perubahan code:

```bash
# Di komputer lokal
git add .
git commit -m "Update fitur XYZ"
git push origin main

# Di VPS
ssh root@187.127.114.159
cd /opt/survey-populicenter
bash deploy.sh update
```

### Update manual (langkah eksplisit) — direkomendasikan

`git pull` + rebuild image **TIDAK** otomatis menjalankan migrasi database.
Jika ada commit yang menambah migrasi (mis. tipe pertanyaan baru), Anda **wajib**
menjalankan migrasi, jika tidak akan muncul error 500 saat menyimpan data baru.

Urutan aman: **pull → build → migrate → restart**

```bash
cd /opt/survey-populicenter

# 1. Ambil kode terbaru
git pull

# 2. Build ulang image (backend, worker, nginx/frontend)
docker compose build

# 3. Jalankan migrasi database yang tertunda  ← LANGKAH YANG SERING TERLEWAT
docker compose run --rm backend npm run migrate

# 4. Restart semua container dengan image baru
docker compose up -d
```

Cek status migrasi (opsional):
```bash
docker compose exec backend npx sequelize-cli db:migrate:status
```

> Catatan: hanya frontend yang berubah? Cukup `docker compose up -d --build nginx`.
> Ada migrasi baru atau perubahan backend? Wajib lewat langkah 3 di atas.

## Troubleshooting

### Error 500 saat membuat pertanyaan tipe tertentu (mis. "Wilayah Indonesia")

Gejala: **membuat** pertanyaan dengan tipe baru → `Request failed with status code 500`,
tapi **mengedit** pertanyaan lain berhasil.

Penyebab: migrasi yang memperbarui CHECK constraint kolom `type` pada tabel
`questions` belum dijalankan, sehingga database menolak nilai tipe baru.

Perbaikan utama — jalankan migrasi:
```bash
cd /opt/survey-populicenter
docker compose run --rm backend npm run migrate
```

Verifikasi constraint sudah memuat tipe baru:
```bash
docker compose exec postgres psql -U surveyapp -d web_survey_platform \
  -c "\d+ questions" | grep questions_type_check
```

Fallback (jika status migrasi sudah "up" tapi tetap error — perbaiki constraint langsung):
```bash
docker compose exec postgres psql -U surveyapp -d web_survey_platform -c "ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check; ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN ('single_choice','multiple_choice','short_text','long_text','numeric_scale','date','photo','rating_scale','phone_number','unique_id','time','matrix','indonesia_region'));"
```

## Default Login

- Email: `admin@populicenter.com`
- Password: `Admin123!`
- **SEGERA ganti password setelah login pertama!**
