# Uji Beban — Simulasi Hari-H Survei (k6)

Membuktikan (bukan menebak) bahwa server sanggup menangani **10 survei/wilayah
berjalan serentak**: gelombang login pagi, lalu ratusan TPD menyetor data +
media bersamaan.

> 🚨 **STAGING / LOKAL SAJA — DILARANG KERAS ke produksi.**
> Uji beban menulis ribuan respons sintetis dan bisa mengganggu TPD sungguhan.
> Skrip k6 **menolak berjalan** bila `BASE_URL` mengandung `populicenter.com`.

---

## 0 · Siapkan target (sekali)

Dua pilihan target:

- **Lokal (paling mudah):** jalankan stack compose di PC — `docker compose up -d`
  → target `http://localhost`.
- **VPS staging:** clone repo di VPS terpisah (JANGAN produksi), salin `.env`
  dengan DB kosong, `docker compose up -d && docker compose exec backend npm run migrate`.

> ⚠️ **Lokal ≠ hardware KVM 8.** Menjalankan compose di PC mensimulasikan STACK
> (software), **bukan** CPU/RAM VPS. Hasil mencerminkan hardware PC Anda:
> - PC ≥ 8 core & ≥ 8 GB bebas → `mem_limit`/`cpus` di compose (plafon sama
>   dengan VPS) membuat hasilnya **proksi yang wajar** untuk KVM 8.
> - PC lebih lemah → hasil **pesimistis** (lebih buruk dari produksi) — kalau
>   lolos di PC lemah, di VPS pasti lebih lega. Aman sebagai batas bawah.
> Untuk angka yang benar-benar setara VPS, jalankan di VPS **staging** (bukan prod).

> 🛡️ **Media kini ke MinIO** (MEDIA_STORAGE=s3). Upload memakai `memoryStorage` →
> tiap upload menahan file penuh di RAM sesaat sebelum di-PUT ke MinIO. Saat load
> test, **pantau RAM backend** (`docker stats`): 300 upload serentak ≈ ~390 MB
> buffer transient (plafon 2 GB). Bila RAM backend mendekati plafon atau ada
> restart (OOM), itu temuan penting — kabari. Uji juga jalur BACA (dashboard buka
> media) setelahnya; k6 hanya menulis.

Karena semua VU k6 berasal dari **satu IP generator**, pagar login lapis-2
(per-IP, default 100/15 mnt) akan menolak login ke-101 — di lapangan nyata tiap
TPD punya IP sendiri. Untuk uji kapasitas dari satu generator, longgarkan di
`.env` target lalu `docker compose up -d backend`:

```env
LOGIN_IP_RATE_LIMIT_MAX=100000
```

(Biarkan limiter lain apa adanya — justru itu yang ingin ikut teruji.)

## 1 · Seed data uji

```bash
docker compose exec -e LOADTEST_CONFIRM=1 backend node scripts/loadtest-seed.cjs
# knob: LT_SURVEYS=10 LT_TPD=300 LT_QUOTA=30
```

> 🛡️ **Gerbang anti-produksi.** Seeder MENOLAK jalan tanpa `LOADTEST_CONFIRM=1`,
> dan **menolak lagi** bila DB berisi data nyata (survei non-`[LOADTEST]` atau
> respons) kecuali `LOADTEST_ALLOW_NONEMPTY=1` juga diset. Ia mencetak
> **DB_NAME@DB_HOST** sebelum jalan — **pastikan itu staging, bukan produksi.**
> `--cleanup` tak butuh gerbang (hanya menghapus data ber-marker).

Hasil: 10 survei `[LOADTEST] Wilayah 01–10` (3 pertanyaan: nomor kues +
pilihan + teks; semua field tools **opsional**, kunci perangkat **off**),
300 akun `tpd0001@loadtest.local` … (password `LoadTest#2026`), kuota 30/TPD.

## 2 · Pasang & jalankan k6

k6 = satu binary, dari [k6.io](https://k6.io/docs/get-started/installation/)
(Windows: `winget install k6 --source winget`).

```bash
# Skenario penuh: 300 TPD, login wave 2 mnt, puncak 10 mnt, dengan media
k6 run -e BASE_URL=http://localhost scripts/loadtest/k6-survey-day.js

# Variasi:
k6 run -e BASE_URL=http://IP-STAGING -e TPD=300 -e STEADY=15m -e MEDIA=1 \
  -e PHOTO_KB=400 -e AUDIO_KB=900 scripts/loadtest/k6-survey-day.js
```

Alur tiap VU = persis app TPD: `login → GET /surveys → GET /surveys/:id →
/responses/start → (wawancara 3–8 dtk) → /responses/check-unique →
/upload/photo + /upload/audio → /responses/submit`.

## 3 · Membaca hasil

**Lulus** bila ringkasan akhir k6 menunjukkan:

| Metrik | Ambang (threshold di skrip) |
|---|---|
| `http_req_failed` | **< 1%** |
| `submit_duration p(95)` | **< 800 ms** |
| `upload_duration p(95)` | **< 3 s** |
| `rate_limited_429` | kecil & bisa dijelaskan (lihat catatan IP di atas) |

Sambil berjalan, pantau di server target:

```bash
docker stats                      # CPU/RAM per container — plafon baru terpakai?
docker compose logs -f backend | grep -v 200   # hanya error yang lewat
```

**Interpretasi:** 300 TPD × kuota 30 ≈ 9.000 respons potensial; skenario 10 mnt
biasanya menuntaskan 3–6 rb submit + 6–12 rb upload ≈ **5–15 req/dtk berkelanjutan**
— melebihi hari puncak nyata survei 1.200 responden (±2–3 req/dtk). Bila ambang
hijau, KVM 8 terbukti longgar untuk 10 survei serentak.

## 4 · Bersihkan

```bash
docker compose exec backend node scripts/loadtest-seed.cjs --cleanup
```

Menghapus semua data bertanda `[LOADTEST]` / `@loadtest.local`
(answers → responses → quotas → questions → surveys → users). Media sintetis
di volume uploads tidak dirujuk lagi — worker maintenance yang membersihkannya.

## Batasan yang jujur

- Generator tunggal ≠ 300 jaringan seluler: latensi/putus-nyambung dunia nyata
  tidak tersimulasi — tapi justru itu sudah ditangani mode offline app.
- Payload media sintetis (bytes acak) — server tidak memvalidasi isi berkas,
  jadi jalur I/O tetap teruji penuh.
- Uji dari `http://localhost` melewati Cloudflare & TLS; angka produksi akan
  sedikit lebih tinggi latensinya, bukan lebih rendah.
