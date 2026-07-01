> **Sumber asal:** disalin dari `PopuliCenter/wwwpc-PC` (`docs/ops/vps-multi-app-nginx.md`),
> disalin ke repo ini (`survey-populicenter`) karena repo ini **ADALAH** stack
> yang menjalankan edge nginx bersama (`survey-populicenter-nginx-1`) yang
> dibahas di dokumen ini — `docker-compose.yml`/`docker-compose.override.yml`
> di root repo ini persis yang dimaksud di §2 & §3 di bawah. Kalau dokumen ini
> diperbarui, perbarui juga salinannya di `wwwpc-PC` dan `blastWA_surveionline`.

# VPS Bersama: Edge Nginx Multi-Aplikasi (risetcenter.com)

> **Konteks:** Satu VPS (Hostinger) menjalankan **beberapa aplikasi terpisah**
> (masing-masing Docker Compose sendiri), berbagi **satu nginx edge** yang
> memegang port 80/443. Dokumen ini adalah peta arsitektur + panduan langkah
> demi langkah untuk menambah aplikasi baru **tanpa mematikan aplikasi lain**
> (insiden ini pernah terjadi — lihat bagian Riwayat Insiden di bawah).

## 1. Peta arsitektur

```
Internet → Cloudflare (DNS + SSL) → VPS:80/443
                                        │
                                        ▼
                    container "survey-populicenter-nginx-1"
                    (edge nginx bersama, SATU-SATUNYA yang publish port 80/443)
                    stack: /var/www/survey-populicenter/ (app lama/base-populicenter)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
         server_name              server_name          server_name
      risetcenter.com          survei.risetcenter    wa.risetcenter
      www.risetcenter.com      .com (conf sendiri)   .com (conf sendiri)
      "_" (catch-all)                │                     │
            │                        ▼                     ▼
            ▼                 survei_frontend:80     wa_frontend:80
   nginx-common.conf          (proxy /api internal    (proxy internal
   → backend:3000             ke survei_backend)      ke wa_backend)
   (API app LAMA sendiri,
   BUKAN app survei kita!)
```

**Penting:** `nginx.service` di **host** (systemd) **mati/tidak dipakai**
(`inactive (dead)`). Seluruh routing HTTP/HTTPS untuk SEMUA domain di VPS ini
ditangani oleh **satu container** `survey-populicenter-nginx-1`, bagian dari
stack aplikasi lama, BUKAN reverse proxy khusus (bukan Nginx Proxy Manager/
Traefik/dsb).

## 2. Inventaris saat ini

| Domain | Diproxy ke | Compose stack | Lokasi compose |
|---|---|---|---|
| `risetcenter.com`, `www.risetcenter.com` | `backend` (app lama) via `nginx-common.conf` | survey-populicenter | `/var/www/survey-populicenter/` |
| `survei.risetcenter.com` | `survei_frontend:80` | aplikasi-survei-web-online (`wwwpc-PC`) | `/var/www/online-survei/` |
| `wa.risetcenter.com` | `wa_frontend:80` | app WhatsApp (`blastWA_surveionline`) | `/var/www/survei-wa/` (deploy asal) |

File kunci di `/var/www/survey-populicenter/` (host, di-*bind mount* ke
container edge nginx):

| File host | Mount ke container | Isi |
|---|---|---|
| `docker-compose.yml` | — | Stack ASLI app lama (nginx, backend, worker, postgres, redis). **Publish port 80/443 di sini.** |
| `docker-compose.override.yml` | — | **Tempat menambah vhost baru** tanpa mengubah `docker-compose.yml`. Compose **menggabung** (bukan menimpa) `volumes:` berdasarkan path tujuan di container — jadi aman menambah baris baru di sini. |
| `nginx.conf` | `/etc/nginx/conf.d/default.conf` | Server block `risetcenter.com`/catch-all `_` (app lama). Dimuat **paling awal** (alfabetis) → jadi *implicit default server*. |
| `nginx-common.conf` | `/etc/nginx/nginx-common.conf` | Rute API **app lama saja** (`/auth`, `/surveys`, `/responses`, dst. — mirip nama tapi BUKAN app survei kita!). Jangan bingung. |
| `certs/origin.pem`, `certs/origin.key` | `/etc/nginx/certs/` | **Cloudflare Origin Certificate**, SAN `*.risetcenter.com`, berlaku 15 tahun. Dipakai bersama oleh SEMUA subdomain. |
| `wa.risetcenter.com.conf` | `/etc/nginx/conf.d/wa.risetcenter.com.conf` | Vhost WA — mandiri, proxy semua path ke `wa_frontend:80`. |
| `survei.risetcenter.com.conf` | `/etc/nginx/conf.d/survei.risetcenter.com.conf` | Vhost survei — mandiri, proxy semua path ke `survei_frontend:80`. |

## 3. Panduan: menambah aplikasi baru (app ke-4, dst.)

### Syarat aplikasi baru
1. **JANGAN** publish port 80/443 sendiri di `docker-compose.yml` app baru.
   Cukup `expose: "80"` (internal) pada container frontend-nya.
2. Container frontend app baru harus join **network eksternal `web`**
   (sudah ada, jangan dibuat ulang):
   ```yaml
   services:
     frontend:
       expose: ["80"]
       networks:
         - app_network   # internal app baru sendiri
         - web           # supaya bisa dijangkau edge nginx
   networks:
     web:
       external: true
   ```
3. Idealnya, frontend app baru punya **nginx internal sendiri** yang
   mem-proxy `/api` ke backend-nya (pola yang sudah dipakai `survei_frontend`
   dan `wa_frontend`) — supaya edge nginx cukup teruskan SEMUA path apa
   adanya, tanpa perlu tahu detail rute app.

### Langkah di edge nginx (`/var/www/survey-populicenter/` — repo ini)

1. **Buat file vhost baru**, mandiri, pola sama seperti `wa.risetcenter.com.conf`:
   ```bash
   cat > /var/www/survey-populicenter/<subdomain>.risetcenter.com.conf <<'EOF'
   server {
       listen 80;
       listen [::]:80;
       listen 443 ssl;
       listen [::]:443 ssl;
       server_name <subdomain>.risetcenter.com;

       ssl_certificate     /etc/nginx/certs/origin.pem;
       ssl_certificate_key /etc/nginx/certs/origin.key;

       client_max_body_size 12m;
       resolver 127.0.0.11 valid=30s;
       set $app_upstream <nama_container_frontend>;

       location / {
           proxy_pass http://$app_upstream:80;
           proxy_http_version 1.1;
           proxy_set_header Host              $host;
           proxy_set_header X-Real-IP         $remote_addr;
           proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header Upgrade           $http_upgrade;
           proxy_set_header Connection        "upgrade";
           proxy_read_timeout 120s;
       }
   }
   EOF
   ```

2. **Tambah SATU baris** di `docker-compose.override.yml` (JANGAN ganti
   baris lain, JANGAN edit `docker-compose.yml` dasar):
   ```yaml
   services:
     nginx:
       volumes:
         - ./wa.risetcenter.com.conf:/etc/nginx/conf.d/wa.risetcenter.com.conf:ro
         - ./survei.risetcenter.com.conf:/etc/nginx/conf.d/survei.risetcenter.com.conf:ro
         - ./<subdomain>.risetcenter.com.conf:/etc/nginx/conf.d/<subdomain>.risetcenter.com.conf:ro   # BARU
       networks:
         - default
         - web
   networks:
     web:
       external: true
   ```

3. **Preview dulu** sebelum apply — pastikan SEMUA mount lama + baru muncul
   (jangan percaya asumsi/komentar, verifikasi langsung):
   ```bash
   cd /var/www/survey-populicenter
   docker compose config | grep -A 20 "^  nginx:"
   ```

4. **Recreate HANYA service nginx** (bukan `docker compose up -d` tanpa target,
   untuk menghindari efek tak terduga ke service lain):
   ```bash
   docker compose up -d nginx
   docker exec survey-populicenter-nginx-1 nginx -t
   ```

5. **Verifikasi dengan SNI yang benar** (⚠️ lihat gotcha #3 di bawah — `-H
   "Host:"` biasa TIDAK CUKUP untuk domain HTTPS/HTTP2):
   ```bash
   curl -sk --resolve <subdomain>.risetcenter.com:443:127.0.0.1 \
     https://<subdomain>.risetcenter.com/ -o /dev/null -w "HTTP: %{http_code}\n"
   ```
   Harus `200`. Lalu cek juga dari browser asli.

6. **Cek domain-domain LAIN masih hidup** (jangan cuma cek yang baru!):
   ```bash
   for d in risetcenter.com survei.risetcenter.com wa.risetcenter.com; do
     printf "%-28s " "$d"
     curl -sk --resolve "$d:443:127.0.0.1" "https://$d/" -o /dev/null -w "%{http_code}\n"
   done
   ```

## 4. Runbook troubleshooting: "app X tidak bisa diakses setelah instal app Y"

Jalankan berurutan:

```bash
# 1) Siapa pegang port 80/443? HARUS selalu survey-populicenter-nginx-1
sudo ss -ltnp | grep -E ':80|:443'
docker ps -a | grep -iE "nginx|proxy"

# 2) Semua container yang perlu dijangkau edge nginx masih di network "web"?
docker network inspect web --format '{{range .Containers}}{{println .Name}}{{end}}'
# Harus muncul: survey-populicenter-nginx-1, survei_frontend, wa_frontend, dst.
# Kalau ada yang HILANG dari daftar → reattach:
#   docker network connect web <nama_container>
#   docker exec survey-populicenter-nginx-1 nginx -s reload

# 3) Config vhost domain yang bermasalah masih ada & termuat?
docker exec survey-populicenter-nginx-1 grep -rl "<domain-bermasalah>" /etc/nginx/
# Kosong / hanya muncul di KOMENTAR file lain → vhost hilang, lihat §3.

# 4) Preview merge compose — pastikan volumes sesuai ekspektasi
cd /var/www/survey-populicenter && docker compose config | grep -A 20 "^  nginx:"

# 5) Syntax nginx OK?
docker exec survey-populicenter-nginx-1 nginx -t

# 6) Tes routing dgn SNI benar (lihat §5 gotcha #3)
curl -sk --resolve <domain>:443:127.0.0.1 https://<domain>/ | grep -o "<title>.*</title>"

# 7) Resource VPS (disk/RAM) — jangan lupa cek juga
free -h; df -h /; docker stats --no-stream
```

## 5. Gotcha yang WAJIB diingat

1. **Jangan pernah publish port 80/443 di compose app baru.** Hanya
   `survey-populicenter-nginx-1` yang boleh memegang port itu. Kalau app baru
   punya nginx/traefik/caddy bawaan, matikan publish port-nya dan pakai pola
   vhost mandiri di §3.
2. **`docker-compose.override.yml` menggabung `volumes:` berdasarkan path
   TUJUAN di container** (additive), bukan menimpa seluruh list — tapi
   **selalu verifikasi dengan `docker compose config`**, jangan percaya
   asumsi/komentar lama (ini persis penyebab insiden 1 Juli 2026 — komentar
   bilang "mount survei.conf tetap ada" padahal mount itu **tidak pernah ada**
   di `docker-compose.yml` dasar).
3. **`curl -H "Host: xxx" https://127.0.0.1/` BISA memberi `421 Misdirected
   Request` PALSU** untuk domain HTTPS/HTTP2 kalau SNI tidak diset — itu bukan
   berarti config salah. Selalu uji dengan `curl --resolve <domain>:443:127.0.0.1
   https://<domain>/` (SNI **dan** Host sama-sama benar). Browser asli tidak
   pernah kena masalah ini (selalu kirim SNI benar).
4. **Jangan hapus/recreate network `web`** (mis. lewat `docker compose down`
   pada project yang salah mendefinisikan `web` TANPA `external: true`) — ini
   akan memutus SEMUA app dari edge nginx sekaligus.
5. **`nginx-common.conf` di repo ini (app lama) BUKAN untuk app survei
   (`wwwpc-PC`)** — nama rutenya kebetulan mirip (`/surveys`, `/responses`,
   dst.) karena repo ini juga aplikasi survei (cikal-bakal `wwwpc-PC`), tapi
   proxy targetnya beda container. Jangan pernah edit file ini untuk
   keperluan app survei — buat vhost sendiri (§3).
6. **Disk VPS saat insiden ini: 74% terpakai (71G/96G).** Pantau berkala
   (`df -h /`) — jangan sampai penuh saat menambah app baru.

## 6. Riwayat insiden

**1 Juli 2026** — instalasi app WhatsApp (ketiga) menyebabkan
`survei.risetcenter.com` menyajikan aplikasi lama (`survey-populicenter`,
repo ini) alih-alih `survei_frontend`. Akar masalah: vhost
`survei.risetcenter.com.conf` ternyata **tidak pernah didaftarkan secara
persisten** di `docker-compose.yml`/`docker-compose.override.yml` — kemungkinan
sebelumnya sempat ditambal manual ke container yang berjalan (tidak persisten)
dan hilang saat container di-*recreate* untuk pasang app WA. Diperbaiki dengan
membuat `survei.risetcenter.com.conf` (mandiri, proxy ke `survei_frontend:80`)
dan mendaftarkannya via `docker-compose.override.yml` (lihat §3 sbg SOP ke depan).
