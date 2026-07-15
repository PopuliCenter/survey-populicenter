# Isolasi 3 Aplikasi di Satu VPS — Patch Stack Tetangga

Satu VPS (KVM 8: 8 vCPU / 32 GB) menjalankan **3 stack**: survei lapangan TPD
(repo ini), **survei online**, dan **WA survei**. Container & DB memang terpisah,
tapi **4 sumber daya ini milik bersama** dan bisa menularkan kegagalan:

| Pintu bersama | Gejala bila jebol | Penutupnya |
|---|---|---|
| **nginx** (satu pintu 80/443) | SEMUA app 522 — *sudah pernah terjadi* (conf `wa.risetcenter.com` rusak → nginx crash-loop, Jul 2026) | `nginx -t` sebelum reload; conf bermasalah diparkir `_disabled/` |
| **Disk** | Log liar memenuhi disk → Postgres SEMUA app gagal menulis | **Log rotation** (patch §1) — sudah terpasang di stack survei lapangan |
| **RAM host** | Stack tanpa `mem_limit` bocor → OOM-killer kernel membunuh proses acak (bisa Postgres app lain) | **mem_limit** (patch §1) |
| **CPU** | Satu app sibuk 8 core → app lain melambat | **cpus cap** (patch §2) — sudah terpasang di stack survei lapangan |

Stack **survei lapangan sudah berpagar** (log rotation + mem_limit + cpus, lihat
`docker-compose.yml` repo ini). Dokumen ini = patch untuk **dua tetangga**.

---

## 0 · Kenali dulu stack tetangganya

Di server, untuk **masing-masing** stack tetangga (mis. `/var/www/survei-wa` dan
folder survei online):

```bash
cd /var/www/<stack-tetangga>
docker compose config --services     # daftar nama service
docker stats --no-stream             # pemakaian RAM/CPU normal per container
```

Aturan menetapkan plafon: **mem_limit ≈ 2–3× pemakaian normal** (beri ruang
lonjakan, tapi tetap terkurung). Jangan menebak lebih kecil dari pemakaian
normal — container akan di-OOM-kill bolak-balik.

## 1 · Patch: log rotation + mem_limit

Tambahkan di **paling atas** `docker-compose.yml` tiap stack tetangga:

```yaml
# Rotasi log — tanpa ini log JSON Docker tumbuh tanpa batas dan bisa MEMENUHI
# DISK (disk = milik bersama 3 aplikasi; penuh = SEMUA Postgres tumbang).
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

Lalu pada **setiap service**, tambahkan dua baris (sesuaikan angka mem_limit
dengan hasil §0):

```yaml
services:
  app:                       # ← nama service asli stack tsb
    logging: *default-logging
    mem_limit: 1024m         # ≈ 2–3× pemakaian normal (docker stats)

  postgres:                  # bila stack punya DB sendiri
    logging: *default-logging
    mem_limit: 1024m

  # ulangi untuk semua service lain (redis, worker, dst.)
```

Patokan awal yang aman untuk stack ringan (silakan koreksi dari `docker stats`):
Node/PHP app `512m–1024m` · Postgres/MySQL `1024m` · Redis `256m` · lainnya `256m`.

## 2 · Patch: plafon CPU

Pada tiap service yang sama, tambahkan `cpus:` — total per stack tetangga
**maks ±2** agar survei lapangan (app puncak) tetap punya napas, dan sebaliknya:

```yaml
    cpus: 1        # app utama stack tsb
    cpus: 1        # database-nya
    cpus: 0.5      # service kecil (redis, cron, dsb.)
```

> `cpus` dan `mem_limit` adalah **plafon (ceiling), bukan reservasi** — saat
> tetangga idle, stack lain tetap bebas memakai core tsb. Jumlah plafon boleh
> melebihi 8; yang penting tak ada SATU stack yang bisa menyandera semuanya.

Pembagian terpasang di stack survei lapangan (total plafon 11 dari 8 core —
disengaja, karena ini ceiling): postgres 3 · backend 4 · worker 1.5 ·
redis 0.5 · nginx 2 (nginx melayani ketiga app).

## 3 · Terapkan (per stack, downtime singkat)

```bash
cd /var/www/<stack-tetangga>
cp docker-compose.yml docker-compose.yml.bak   # cadangkan dulu
# … edit sesuai §1–§2 …
docker compose config -q && echo OK            # validasi SEBELUM menerapkan
docker compose up -d                           # recreate → downtime beberapa detik
docker compose ps                              # semua Up?
docker stats --no-stream                       # kolom LIMIT sudah terisi?
```

⚠️ Catatan:
- Opsi `logging` hanya berlaku pada container yang **dibuat ulang** — `up -d`
  setelah edit sudah cukup (compose mendeteksi perubahan). Log lama ikut
  terpangkas saat recreate.
- **WA survei**: sesi WhatsApp umumnya tersimpan di volume → aman di-recreate,
  tapi lakukan di luar jam sibuk; sesi butuh beberapa detik untuk tersambung ulang.
- Jangan ubah dua stack sekaligus — satu-satu, verifikasi, baru lanjut.

## 4 · Verifikasi menyeluruh (setelah ketiga stack berpagar)

```bash
docker stats --no-stream    # semua container punya MEM LIMIT & terlihat wajar
df -h /                     # disk longgar
bash /var/www/survey-populicenter/scripts/ops-check.sh   # tetap ✅
```

## Batas kemampuan pendekatan ini (jujur)

Pagar ini menghilangkan mode kegagalan *"satu app menyeret yang lain lewat
RAM/disk/CPU"*. Yang **tidak** bisa dihilangkan selama masih satu mesin:
- **nginx bersama** tetap titik tunggal — disiplin `nginx -t` wajib selamanya.
- Kernel/host crash atau VPS ditangguhkan → semua mati bersama.
Isolasi sejati = pisah VPS (kandidat pertama: WA survei, karena polanya
long-running connection dan paling beda karakter bebannya).
