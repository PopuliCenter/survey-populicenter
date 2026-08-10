# Metodologi Random Sampling — Populi Center

Panduan rumus & prosedur di balik fitur **Random Sampling** (menu dashboard →
microservice `sampling-service`). Dokumen ini menjelaskan **apa** yang dihitung
engine dan **bagaimana mereproduksinya manual di Excel** sebagai verifikasi /
panduan. Rumus di sini identik dengan [`sampling-service/sampling_engine.py`](../sampling-service/sampling_engine.py).

> Prinsip: **area sampling multistage** berbasis MFD (Master File Desa) BPS.
> Setiap responden lapangan tetap bisa ditelusuri ke titik (desa) dan wilayah
> primernya, dan hasil bisa **direplikasi** lewat *random seed*.

---

## 1. Kerangka sampel (sampling frame)

Sumber: **MFD** — 1 baris = 1 desa/kelurahan. Kolom wajib:

| Kolom | Arti |
|---|---|
| `NMPROP` | Nama provinsi |
| `NMKAB` | Nama kabupaten/kota |
| `NMKEC` | Nama kecamatan |
| `NMDESA` | Nama desa/kelurahan |
| `UR` | **1 = Perkotaan**, **2 = Perdesaan** |

Opsional (menambah metode yang bisa dipakai):
- `DPT`, `PENDUDUK` **per provinsi** (file referensi) → basis alokasi.
- `DPT`/`PENDUDUK` **per baris desa** → syarat **PPS Sistematik self-weighting**.

---

## 2. Struktur bertingkat (multistage)

```
Tahap 1  Alokasi jumlah TITIK ke unit primer  (provinsi / kab / kec sesuai cakupan)
Tahap 2  Di tiap unit primer → stratifikasi Kota/Desa (UR) → pilih DESA (titik)
Tahap 3  Tiap titik diisi cluster_size responden (mis. 10)
```

**Jumlah titik** yang harus dipilih:

```
n_titik = CEILING( n_total / cluster_size )
```

Contoh: `n_total = 1200`, `cluster_size = 10` → **n_titik = 120**.
Titik terakhir dipangkas otomatis bila `n_titik × cluster_size` melebihi
`n_total`, sehingga total responden **persis** = `n_total`.

**Parameter (config generator):**

| Field | Arti |
|---|---|
| `scope` | `NASIONAL` (alokasi antar provinsi) · `PROVINSI` (antar kab) · `KABUPATEN` (antar kecamatan) |
| `scope_filter[]` | Daftar wilayah pembatas (mis. provinsi terpilih) |
| `unit` | `DESA` (titik akhir = desa) · `KABUPATEN` (titik akhir = kab/kota) |
| `n_total` | Target responden (unit DESA) / jumlah kab (unit KABUPATEN) |
| `cluster_size` | Responden per titik |
| `weights` | Bobot basis alokasi `{PENDUDUK, DPT, MFD}` |
| `stratify_ur` | Pisah Kota/Desa (default Ya) |
| `min_per_unit` | Jaminan minimum titik per unit primer |
| `method` | `proportional` · `sqrt` · `pps_systematic` |
| `seed` | Kunci reproduksibilitas |

---

## 3. Ukuran wilayah (size measure)

Sebelum alokasi, tiap unit primer `u` diberi **ukuran** `size(u)` — bisa
gabungan beberapa basis (Penduduk, DPT, jumlah desa MFD) dengan bobot.

Untuk tiap basis `b` (yang datanya tersedia):

```
share_b(u) = nilai_b(u) / Σ_u nilai_b(u)          (pangsa wilayah u di basis b)
```

Bobot dinormalisasi ke jumlah 1:

```
w_b* = w_b / Σ_b w_b
```

Ukuran gabungan:

```
size(u) = Σ_b  w_b* × share_b(u)         →  Σ_u size(u) = 1
```

> Contoh: `weights = {PENDUDUK:1, DPT:0, MFD:0}` → `size(u)` = pangsa penduduk
> murni. `weights = {PENDUDUK:0.5, DPT:0.5}` → rata-rata pangsa penduduk & DPT.

---

## 4. Tiga metode alokasi

### 4a. Proporsional + jaminan minimum (largest-remainder / Hamilton)

Membagi `n_titik` ke tiap unit sebanding `size(u)`, dijamin tiap unit dapat
minimal `min_per_unit`, dan **jumlahnya persis** `n_titik` (tak ada wilayah
ter-skip).

```
1.  base(u)  = min_per_unit                         (untuk semua u)
2.  sisa     = n_titik − min_per_unit × Jumlah_unit
3.  kuota(u) = sisa × size(u) / Σ size
4.  lantai(u)= FLOOR( kuota(u) )
5.  alloc(u) = base(u) + lantai(u)
6.  kurang   = sisa − Σ lantai(u)
7.  Urutkan unit menurut pecahan (kuota(u) − lantai(u)) DESC,
    beri +1 ke `kurang` unit teratas.
```

Bila `n_total < min_per_unit × Jumlah_unit` (target lebih kecil dari kebutuhan
minimum), minimum efektif diturunkan (dibagi rata) — supaya tetap valid.

**Kapan dipakai:** estimasi nasional yang ingin **mewakili populasi apa adanya**;
bobot analisis ≈ 1 (tanpa pembobotan pasca).

### 4b. Akar-kuadrat (√N) + bobot desain

Sama seperti 4a, **tetapi** ukuran untuk alokasi ditransformasi akar:

```
size_alloc(u) = √ size(u)
```

Efeknya **mengangkat wilayah kecil** secara halus (lawan dari proporsional yang
membuat provinsi kecil nyaris tak kebagian). Distorsi ini **disengaja** dan
dikoreksi saat analisis lewat kolom `BOBOT_DESAIN` (lihat §6).

**Kapan dipakai:** ingin **presisi antar-wilayah** (tiap provinsi punya cukup
sampel untuk diestimasi sendiri), bukan sekadar total nasional.

### 4c. PPS Sistematik (Probability Proportional to Size)

Metodologi ala BPS/SILOGNAS — **self-weighting** bila MFD membawa ukuran
per desa (`DPT`/`PENDUDUK` per baris).

```
1.  Urutkan desa secara GEOGRAFIS (kode BPS: KODEPROP,KAB,KEC,DESA).
    → "implicit stratification": desa bertetangga berdekatan di daftar.
2.  Ukuran kumulatif:  cum(i) = Σ_{j≤i} size_desa(j)
3.  Interval:          I = cum_total / n_titik
4.  Awalan acak:       start = RANDOM[0, I)
5.  Titik ke-k:        p_k = start + k × I      (k = 0,1,…,n_titik−1)
6.  Desa terpilih:     desa pertama yang cum(i) ≥ p_k   (searchsorted)
7.  Tiap titik → cluster_size responden.
```

- Peluang sebuah desa terpilih **∝ ukurannya**. Digabung jatah responden tetap
  per titik → **peluang tiap RESPONDEN sama** → **self-weighting** (bobot = 1,
  tanpa pembobotan pasca).
- Desa sangat besar bisa **terpilih lebih dari sekali** (jatah responden
  berlipat) — sah dalam PPS sistematik.
- Urutan sistematik menjamin sebaran antar wilayah, jadi **jaminan minimum
  tidak dipakai**.
- **Tanpa ukuran per desa** → fallback ke sistematik-geografis **berpeluang
  sama** (bukan self-weighting); `BOBOT_DESAIN` tingkat unit primer dihitung
  sebagai koreksi + peringatan diberikan.

**Kapan dipakai:** standar emas survei rumah tangga berskala; hasil bisa
dianalisis **tanpa** menimbang.

---

## 5. Stratifikasi Kota/Desa (UR)

Bila `stratify_ur = Ya`, alokasi titik `k` sebuah unit primer dibagi ke Kota
(UR=1) vs Desa (UR=2) **proporsional terhadap jumlah desa** kota/desa di unit
itu — memakai largest-remainder yang sama (§4a, minimum 0):

```
Titik_Kota = alokasi( k , sebanding jumlah desa UR=1 )
Titik_Desa = k − Titik_Kota
```

Di PPS sistematik, stratifikasi Kota/Desa **implisit** lewat urutan geografis
(tidak dialokasikan terpisah).

---

## 6. Bobot desain (design weight)

Dipakai analis di SPSS/R agar estimasi **tidak bias** walau alokasi menyimpang
dari proporsional (karena jaminan minimum atau √N). Per unit primer yang
kebagian titik:

```
BOBOT_DESAIN(u) =  share_populasi(u)  /  share_titik(u)

              =  ( pop(u) / Σ pop )  /  ( titik(u) / Σ titik )
```

- **Proporsional murni** → bobot ≈ **1** semua.
- **√N / minimum** → wilayah kecil yang di-*oversample* dapat bobot < 1;
  wilayah besar dapat bobot > 1. Rata-rata tertimbang ≈ 1.
- **PPS sistematik self-weighting** → bobot = **1** (tak perlu ditimbang).

> Aturan praktis: **selalu** pakai kolom `BOBOT_DESAIN` sebagai *weight* saat
> menghitung estimasi, kecuali metode PPS self-weighting.

---

## 7. Reproduksibilitas

- Semua seleksi acak memakai `numpy.random.default_rng(seed)`.
- **Alokasi bersifat deterministik** (tak bergantung seed) → angka `/preview`
  **persis sama** dengan `/run`. Yang dipengaruhi seed hanyalah **desa mana**
  yang akhirnya terpilih. Seed sama + data sama → hasil identik.

---

## 8. Reproduksi manual di Excel (panduan verifikasi)

> 📗 **File contoh berjalan:** [`docs/sampling/Contoh-Sampling-38-Provinsi.xlsx`](sampling/Contoh-Sampling-38-Provinsi.xlsx)
> — 38 provinsi (DPT & Penduduk asli), rumus hidup untuk Proporsional, √N, dan
> PPS Sistematik. Sheet **MFD** berisi sampel dummy; ganti dengan MFD BPS asli.

Contoh: **NASIONAL, proporsional**, `n_total = 1200`, `cluster_size = 10`,
basis = Penduduk. Maka `n_titik = 120`. (Hasil alokasi teratas: Jawa Barat 16,
Jawa Timur 13, Jawa Tengah 12 titik — total 120 titik = 1.200 responden.)

### Langkah A — Alokasi antar provinsi (largest-remainder)

Susun tabel provinsi + jumlah penduduk (kolom A = nama, B = penduduk). Misal 34
provinsi di baris 2–35.

| Sel | Rumus | Arti |
|---|---|---|
| `C2` | `=B2/SUM(B$2:B$35)` | `share(u)` — pangsa penduduk |
| `D2` | `=$G$1*C2` | `kuota(u)` = n_titik × share (taruh `n_titik` di `G1`, mis. 120) |
| `E2` | `=INT(D2)` | `lantai(u)` (=FLOOR) |
| `F2` | `=D2-E2` | pecahan sisa |

Salin C2:F2 ke seluruh baris. Lalu:

```
Kekurangan  = 120 − SUM(E2:E35)          →  di sel H1
```

Beri **+1** ke `Kekurangan` provinsi dengan **pecahan (kolom F) terbesar**:

| Sel | Rumus |
|---|---|
| `G2` | `=RANK(F2, F$2:F$35)` — peringkat pecahan (1 = terbesar) |
| `H2` | `=E2 + IF(G2 <= $H$1, 1, 0)` — **alokasi titik final** |

Cek: `=SUM(H2:H35)` harus **= 120**. (Bila ada `min_per_unit`, tambahkan dulu
`base = min` ke tiap provinsi, kurangi 120 dengan `min×34`, lalu jalankan
largest-remainder pada sisanya — persis §4a.)

Responden per provinsi: `=H2*10`.

### Langkah B — Bagi Kota/Desa dalam provinsi

Hitung jumlah desa UR=1 dan UR=2 per provinsi (COUNTIFS di frame MFD), lalu
ulangi largest-remainder Langkah A pada 2 kategori itu dengan target = titik
provinsi (`H2`).

```
Titik_Kota = ROUND( H2 × Ndesa_kota/(Ndesa_kota+Ndesa_desa) )   (lalu koreksi
Titik_Desa = H2 − Titik_Kota                                     agar jumlah pas)
```

### Langkah C — Pilih desa (titik) secara acak

Pada daftar desa satu provinsi+strata:

1. Kolom bantu acak: `=RAND()` di samping tiap desa.
2. **Urutkan** daftar menurut kolom acak (Data → Sort).
3. Ambil **N teratas** = `Titik_Kota` (atau `Titik_Desa`).

> Agar bisa direplikasi seperti seed: ganti `RAND()` dengan hash tetap, mis.
> `=MOD(SUMPRODUCT(CODE(MID(A2,ROW(INDIRECT("1:"&LEN(A2))),1))) * seed, 100000)`
> lalu urutkan menaik. (Engine memakai RNG numpy — Excel hanya untuk verifikasi
> pola, bukan angka identik.)

### Langkah D — Responden per titik

Isi `cluster_size` (mis. 10) ke tiap desa terpilih; kurangi titik terakhir bila
total > `n_total`.

### Variasi metode

- **√N:** di Langkah A ganti `C2` jadi `=SQRT(B2)/SUMSQRT` — yakni
  `=SQRT(B2)/SUM(√ semua)`. Praktis: buat kolom `=SQRT(B2)` dulu, lalu
  `share = SQRT(B2)/SUM(kolom √)`. Sisanya sama. Jangan lupa hitung
  `BOBOT_DESAIN` (§6).
- **PPS sistematik:** urutkan desa per kode BPS; kolom `cum = SUM($C$2:C2)`;
  `I = MAX(cum)/120`; `start = RAND()*I`; titik `p_k = start + (k)*I`; desa
  terpilih `=MATCH(p_k, cum, 1)+1` (cum menaik). Self-weighting → bobot 1.

---

## 9. Output engine (yang muncul di generator)

| Sheet / kolom | Isi |
|---|---|
| **Ringkasan** | Metode, cakupan, target vs terealisasi, cakupan provinsi/unit, seed |
| **Alokasi** | Titik & responden per unit primer × strata + `Bobot_Desain` |
| **Sampel** | Desa terpilih + `RESPONDEN` + `BOBOT_DESAIN` (pakai sebagai weight) |
| **Kerangka** | Rekap ala SILOGNAS SURNAS: DPT, Penduduk, Kota/Desa MFD, titik, responden, TPD, baris TOTAL |

`/preview` menampilkan **Alokasi** saja (cepat, tanpa seleksi acak, tanpa Excel);
`/run` menambah **Sampel** + 2 file Excel.

---

## 10. Ringkasan pemilihan metode

| Tujuan | Metode | Pembobotan analisis |
|---|---|---|
| Wakili total nasional apa adanya | **Proporsional** | ≈ 1 (praktis tanpa bobot) |
| Presisi tiap provinsi (kecil terangkat) | **√N + bobot** | **wajib** `BOBOT_DESAIN` |
| Standar survei RT, tanpa menimbang | **PPS Sistematik** (butuh ukuran per desa) | 1 (self-weighting) |

> Semua metode menjamin **tidak ada wilayah dalam cakupan yang ter-skip** dan
> total responden **persis** = `n_total`.
