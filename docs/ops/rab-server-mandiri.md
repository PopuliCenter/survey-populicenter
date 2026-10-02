# RAB & Spesifikasi Server Mandiri — Populi Center (target 6 aplikasi)

**Dokumen perencanaan pengadaan.** Disusun Okt 2026. Semua harga = **estimasi
pasar Indonesia 2026**, WAJIB divalidasi dengan *quotation* vendor sebelum
dipakai sebagai anggaran final. Angka dalam **juta Rupiah (jt)**.

> **Keputusan desain (sesuai arahan):** bandingkan **Colocation vs On-premise**,
> tingkat ketersediaan **1 server kuat + cold spare**, kelas hardware
> **Enterprise bergaransi** (rekomendasi — alasan di §3).

---

## 1. Ringkasan & rekomendasi (TL;DR)

| Skenario | CAPEX (sekali) | OPEX (/tahun) | TCO 3 tahun |
|---|---:|---:|---:|
| **A. Colocation (data center)** ✅ *rekomendasi* | ~**214 jt** | ~**33 jt** | ~**313 jt** |
| **B. On-premise (kantor)** | ~**273 jt** | ~**54 jt** | ~**435 jt** |
| *C. Sewa dedicated (tanpa beli HW)* | 0 | ~36–72 jt | ~110–220 jt |

**Rekomendasi: Colocation.** Untuk layanan publik yang dipakai TPD lapangan,
colocation memberi listrik redundan, pendingin, internet cepat & redundan, dan
keamanan fisik kelas data center — **lebih andal DAN lebih murah** daripada
membangun semua itu sendiri di kantor (on-premise).

> ⚠️ **Cek-realita jujur:** bila pendorong utamanya **biaya/kemudahan**,
> *menyewa* dedicated server (opsi C) jauh lebih murah & tanpa risiko hardware.
> **Memiliki** server (A/B) baru masuk akal bila pendorongnya **kedaulatan &
> kendali data** — mis. data survei/quick-count politik yang sensitif sebaiknya
> berada di tanah air, di bawah kendali penuh Yayasan. Putuskan ini dulu
> (lihat §6). RAB A & B di bawah mengasumsikan keputusan itu = **ingin memiliki**.

---

## 2. Dasar penghitungan kapasitas (sizing)

Fakta sekarang: **1 VPS (8 vCPU / 32 GB / 400 GB NVMe)** sudah menjalankan
**3 stack** (survei lapangan TPD, survei online, WA survei) — berjalan tapi
**ketat**. Target: **6 aplikasi** = ±2× beban sekarang + ruang tumbuh.

| Sumber daya | 3 app sekarang | Target 6 app (+headroom ~40%) | Alasan |
|---|---|---|---|
| **CPU** | 8 vCPU (ketat) | **≥16 core / 32 thread fisik** | Beban survei *bursty* (sinkron pagi), bukan sustained |
| **RAM** | 32 GB (ketat) | **128 GB ECC** | Tiap app = Postgres+Redis+Node+MinIO; sisanya page-cache DB/media |
| **Disk** | 400 GB (lega) | **~4–6 TB usable, redundan** | Media (foto/audio/ttd) tumbuh; ratusan ribu responden × 6 app |
| **Jaringan** | — | **2× 10GbE (min 1GbE)** | Sinkron media banyak TPD serentak |

Media per responden ±0,35 MB (foto 1280px q80 + ttd); DB ramping. Disk 4–6 TB
menampung skala nasional besar untuk keenam app bertahun-tahun.

---

## 3. Spesifikasi server yang direkomendasikan

**Kelas Enterprise bergaransi** — dipilih karena untuk 6 app produksi 24/7 yang
self-host, tiga hal ini menyelamatkan: **ECC RAM** (cegah korupsi data diam-diam),
**dual PSU hot-swap** (satu PSU mati tak padam), dan **remote management
iDRAC/iLO** (reboot/console dari jauh tanpa datang ke lokasi) + **garansi on-site**.

| Komponen | Spesifikasi target | Catatan |
|---|---|---|
| **Model** | Dell **PowerEdge R7615** (1-soket EPYC) / HPE **ProLiant DL345 Gen11**; versi tower **PowerEdge T560** untuk on-prem tanpa rak | Single-socket EPYC = nilai terbaik |
| **CPU** | 1× AMD **EPYC 9124** (16c/32t) atau **EPYC 8324P** (Siena, hemat daya) | Cukup untuk 6 app + headroom |
| **RAM** | **128 GB** ECC DDR5 (4× 32 GB), slot sisa untuk upgrade | |
| **Disk OS+DB (panas)** | 2× **1,92 TB NVMe** U.2, **RAID-1** | DB cepat, mirror |
| **Disk media** | 2× **3,84 TB** SSD, **RAID-1** (atau 4× RAID-10) | Media tumbuh, redundan |
| **Boot** | 2× M.2 (BOSS) **mirror** | OS terpisah dari data |
| **NIC** | 2× **10GbE** (min 2× 1GbE) | |
| **PSU** | **Dual**, hot-swap, redundan | |
| **Manajemen** | **iDRAC9 Enterprise** / iLO6 | Wajib untuk self-host |
| **Garansi** | **3–5 tahun on-site NBD** (ProSupport) | |
| **Estimasi harga** | **~130–190 jt** (titik ~**155 jt**) | Validasi quotation Dell/HPE Indonesia / SI lokal |

**Alternatif hemat (white-box):** Supermicro barebone + EPYC 8024P/Ryzen,
128 GB ECC, NVMe → **~55–85 jt** (potong ~70–80 jt), **tapi** tanpa garansi
on-site & dukungan terbatas. Layak bila ada teknisi internal yang sanggup
menangani kegagalan hardware sendiri.

**"Cold spare" (sesuai pilihan):** kit suku cadang kritis (1× NVMe, 1× PSU,
1× DIMM) + garansi NBD, **plus** — saran — **pertahankan VPS Hostinger lama
sebagai DR hangat** selama 6–12 bln transisi (sudah dibayar, bisa jadi target
pemulihan darurat). Opsi lebih kuat: server standby penuh (+~155 jt).

---

## 4. RAB Skenario A — Colocation (data center) ✅

**CAPEX (sekali beli)**

| No | Item | Qty | Est. satuan (jt) | Total (jt) |
|---|---|---:|---:|---:|
| 1 | Server enterprise (spesifikasi §3) | 1 | 155 | 155 |
| 2 | Kit suku cadang kritis (NVMe+PSU+DIMM) — *cold spare* | 1 | 20 | 20 |
| 3 | Rail kit rak + aksesori | 1 | 3 | 3 |
| 4 | Pengantaran + instalasi fisik di IDC | 1 | 5 | 5 |
| 5 | Jasa migrasi data + setup Docker/stack | 1 | 10 | 10 |
| | **Subtotal** | | | **193** |
| | Kontingensi 11% | | | 21 |
| | **TOTAL CAPEX (Colo)** | | | **~214 jt** |

**OPEX (berulang)**

| Item | Est. /bulan | /tahun |
|---|---:|---:|
| Sewa rak 1–2U + daya ~2A + bandwidth (via Cloudflare → modest) | ~2,5 jt | 30 jt |
| Cloudflare Pro (opsional, keamanan/performa) | ~0,25 jt | 3 jt |
| **Total OPEX (Colo)** | **~2,75 jt** | **~33 jt** |

> Keuntungan colo: **tanpa** beli UPS/AC/jaringan redundan — semua disediakan DC.

---

## 5. RAB Skenario B — On-premise (kantor)

**CAPEX (sekali beli)**

| No | Item | Qty | Est. satuan (jt) | Total (jt) |
|---|---|---:|---:|---:|
| 1 | Server enterprise (tower **T560** disarankan) | 1 | 155 | 155 |
| 2 | Kit suku cadang kritis — *cold spare* | 1 | 20 | 20 |
| 3 | **UPS online** 3 kVA + baterai (runtime 20–30 mnt) | 1 | 20 | 20 |
| 4 | Rak server 12–15U + PDU | 1 | 8 | 8 |
| 5 | **AC inverter 1 PK** khusus (24/7) + instalasi | 1 | 8 | 8 |
| 6 | Router/firewall (MikroTik CCR / mini pfSense) | 1 | 6 | 6 |
| 7 | Managed switch 10G/1G | 1 | 4 | 4 |
| 8 | Kabel, grounding, instalasi listrik khusus | 1 | 6 | 6 |
| 9 | Jasa instalasi + migrasi + setup | 1 | 15 | 15 |
| | **Subtotal** | | | **242** |
| | Kontingensi 13% (on-prem lebih tak pasti) | | | 31 |
| | **TOTAL CAPEX (On-prem)** | | | **~273 jt** |

**OPEX (berulang)**

| Item | Est. /bulan | /tahun |
|---|---:|---:|
| Internet bisnis fiber + **IP statik** (primary) | ~2 jt | 24 jt |
| ISP kedua (failover 4G/5G atau fiber) | ~1 jt | 12 jt |
| Listrik (server+AC+jaringan ~1–1,3 kW, 24/7) | ~1,5 jt | 18 jt |
| **Total OPEX (On-prem)** | **~4,5 jt** | **~54 jt** |

> Risiko on-prem: **Anda** menanggung mati listrik, internet putus, pendingin
> rusak, keamanan fisik. Di Indonesia, **listrik & upload internet** adalah
> titik gagal utama untuk server yang melayani sinkron media ribuan TPD.

---

## 6. Perbandingan & keputusan

**TCO 3 tahun:** Colo ~313 jt · On-prem ~435 jt · Sewa dedicated ~110–220 jt.

| Kriteria | Colocation | On-premise | Sewa dedicated |
|---|---|---|---|
| CAPEX | Tinggi | Paling tinggi | **Nol** |
| TCO 3 th | Sedang | Tinggi | **Terendah** |
| Keandalan listrik/internet | **DC-grade** | Tanggungan sendiri (risiko) | DC-grade |
| Kendali & kepemilikan HW | **Penuh** | **Penuh** | Tidak (milik penyedia) |
| Kedaulatan data (tanah air) | **Ya** (pilih IDC Indonesia) | **Ya** | Tergantung lokasi penyedia |
| Beban operasional tim | Sedang | **Berat** | **Ringan** |

**Logika keputusan:**
1. **Pendorong = biaya/kemudahan** → **sewa dedicated** (Indonesian IDC/cloud),
   ~IDR 3–6 jt/bln, tanpa CAPEX & tanpa risiko hardware. Paling rasional bila tim kecil.
2. **Pendorong = kedaulatan & kendali data** (data survei/quick-count sensitif,
   wajib di tanah air & kendali penuh Yayasan) → **Colocation di IDC Indonesia**.
   Miliki hardware, di tanah air, andal. **Ini rekomendasi bila ingin "mandiri".**
3. **On-premise** hanya bila sudah punya ruang server layak + listrik/internet
   redundan + teknisi — jarang sepadan untuk layanan publik.

---

## 7. Catatan migrasi, prasyarat & risiko

- **Migrasi mudah:** stack sudah Docker Compose → *lift-and-shift*. Urutan:
  pulihkan DB (pg_restore) + media (dari backup/QNAP) → `docker compose up` →
  arahkan Cloudflare ke origin baru → jalankan migrasi DB (wajib, lihat
  [deploy ops runbook](../../MANUAL.md)).
- **Keamanan origin** (wajib, lihat `docs/ops/`): kunci origin hanya menerima
  Cloudflare (**Authenticated Origin Pulls mTLS**) — berlaku di colo maupun on-prem.
- **Backup tetap jalan:** QNAP kantor menarik tiap malam (topologi backup
  sekarang dipertahankan; untuk colo, pastikan rute QNAP→IDC aman).
- **Isolasi 6 app:** terapkan `mem_limit`/`cpus`/log-rotation per stack (pola di
  `docs/ops/multi-app-isolation.md`) agar satu app tak menjatuhkan lima lainnya.
- **Harga = estimasi** Okt 2026. Minta quotation: Dell/HPE Indonesia, Datascrip,
  Bhinneka Bisnis, atau System Integrator lokal; colo: Biznet Gio, DCI, NeutraDC,
  Indonesian Cloud, dsb.
- **Cold spare = pemulihan jam-an**, bukan detik. Bila butuh uptime lebih tinggi,
  naik ke 2 server HA (±2× biaya server) — bisa dibuat RAB terpisah bila perlu.

---

*Estimasi untuk perencanaan; angka final mengikuti quotation vendor.*
