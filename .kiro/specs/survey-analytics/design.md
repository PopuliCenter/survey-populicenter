# Desain: Modul Analisis Statistik Survei

Status: DRAFT untuk direview · Target: admin & supervisor
Terkait: dashboard kelengkapan data, halaman "Analisis" per survei.

---

## 1. Tujuan & Ruang Lingkup

### Tujuan
1. **Kelengkapan data** di dashboard — memantau seberapa lengkap pengisian (menjawab kebutuhan "menyesuaikan jumlah pertanyaan yang diisi").
2. **Analisis statistik per survei** — distribusi jawaban tiap pertanyaan dengan kualitas riset: persentase, rata-rata, **margin of error (MoE) + confidence interval (CI)**.
3. **Cross-tabulation** — tabulasi silang dua pertanyaan + uji asosiasi.

### Termasuk (in-scope)
- Statistik deskriptif per pertanyaan (jumlah, %, mean, median, SD, sebaran).
- MoE + CI 95% untuk proporsi (**Wilson score**) dan rata-rata (t-interval).
- **FPC opsional**: bila `population_size` survei diisi, MoE dikoreksi populasi terbatas.
- Cross-tab: tabel kontingensi (row%/col%/total%), **Chi-square**, **Cramér's V**, peringatan expected-cell < 5.
- Filter: rentang tanggal, TPD.
- Ekspor hasil (Excel) — fase 2.

### Di luar lingkup (sekarang)
- **Pembobotan (weighting)** & design effect — disiapkan titik ekstensinya, belum diimplementasi.
- Analisis teks lanjutan (NLP) untuk pertanyaan teks — fase lanjutan (cukup hitung terisi + daftar jawaban).
- Fisher's exact test penuh (hanya peringatan + saran; opsional fase 2).

---

## 2. Catatan Metodologi (PENTING)

Pengumpulan data berbasis **kuota/penugasan TPD**, bukan *simple random sampling* (SRS).
MoE/CI klasik mengasumsikan SRS dari populasi besar; pada quota sampling, error sebenarnya
bisa **lebih besar** (ada *design effect* > 1). Maka:

- Semua MoE/CI **diberi label**: _"Asumsi acak sederhana. Pada quota sampling, margin sebenarnya dapat lebih besar."_
- Bila `population_size` diisi → terapkan **FPC** = `√((N − n) / (N − 1))` pada standard error.
- Titik ekstensi `designEffect` (default 1.0) disiapkan di lapisan perhitungan; jika nanti
  pembobotan ditambahkan, `SE_efektif = SE × √(designEffect)`.

---

## 3. Akses & Navigasi

- Halaman **/analytics** (atau `/analysis`) → role **admin, supervisor** (viewer TIDAK).
- Item sidebar baru "Analisis" (ikon `chart`) untuk admin & supervisor di `Layout.jsx`.
- Endpoint backend: `requireRole(['admin', 'supervisor'])`.

---

## 4. Perubahan Data

### 4.1 Migrasi: kolom populasi survei (opsional FPC)
Tambah kolom `population_size` di tabel `surveys`:

```js
// migrations/2026xxxx-add-survey-population-size.js
queryInterface.addColumn('surveys', 'population_size', {
  type: Sequelize.INTEGER,
  allowNull: true, // null = populasi besar / tidak diketahui (tanpa FPC)
});
```
- Model `Survey`: tambah field `population_size`.
- UI: input "Ukuran Populasi (opsional)" di Survey Builder/edit, dengan keterangan
  "Isi bila ingin margin of error dikoreksi populasi terbatas".

Tidak ada perubahan skema lain — `answers.answer_value` & `answers.answer_json` sudah cukup.

---

## 5. Definisi Statistik (akan diimplementasi sebagai util murni + unit test)

File baru: `backend/src/utils/statistics.js` (fungsi murni, tanpa dependency berat;
opsi pakai `jstat` untuk distribusi — lihat §8).

### 5.1 Base-N per pertanyaan
`n_q` = jumlah responden (dalam filter) yang **menjawab** pertanyaan `q`
(punya `answer_value` non-kosong, atau `answer_json` tidak kosong).
> Semua statistik & denominator persentase memakai `n_q`, BUKAN total responden,
> karena skip logic & pertanyaan dilewati membuat denominator berbeda.

### 5.2 Proporsi (pilihan)
Untuk opsi dengan jumlah `x` dari `n`:
- `p = x / n`
- **MoE (Wald, 95%)** = `z · √(p(1−p)/n)`, `z = 1.96`
- **CI 95% (Wilson score)** — interval utama (akurat untuk n kecil / p ekstrem):
  ```
  denom  = 1 + z²/n
  center = (p + z²/(2n)) / denom
  half   = (z / denom) · √( p(1−p)/n + z²/(4n²) )
  CI = [center − half, center + half]
  ```
- **FPC** (bila `N` diketahui & `N > n`): kalikan komponen `p(1−p)/n` dengan `(N−n)/(N−1)`
  sebelum akar (baik untuk Wald MoE maupun term varians Wilson — pendekatan wajar).
- **Pilihan ganda (multiple_choice):** basis = **% dari responden** (bukan dari total pilihan);
  total antar-opsi bisa > 100%. Diberi catatan eksplisit di UI.
- **allow_other:** jawaban "lainnya" dikelompokkan ke kategori `__other__` (label "Lainnya"),
  daftar teksnya bisa diperluas di bawah grafik.

### 5.3 Rata-rata (numerik / rating)
- `mean`, `median`, `sd` (sample SD, pembagi n−1), `min`, `max`.
- **CI 95% mean** = `mean ± t(0.975, n−1) · (sd / √n)` (×FPC bila ada).
- Sebaran ditampilkan sebagai histogram (rating: per nilai skala).

### 5.4 Cross-tabulation (kategorikal × kategorikal)
Variabel yang valid sebagai dimensi: `single_choice`, `rating_scale`/`numeric_scale`
(dikelompokkan per nilai), `indonesia_region` (per level: provinsi/kab/dst),
`multiple_choice` (sebagai baris multi, dengan catatan). Teks/foto/tanda tangan TIDAK.

- Tabel kontingensi `O[i][j]`, total baris/kolom/grand.
- Tampilkan **count + row% + col% + total%** (toggle).
- **Chi-square independence:**
  ```
  E[i][j] = (rowTotal_i × colTotal_j) / grandTotal
  χ² = Σ (O−E)² / E
  df = (r−1)(c−1)
  p  = 1 − CDF_chi2(χ², df)
  ```
- **Cramér's V** = `√( χ² / (n · min(r−1, c−1)) )` (kekuatan asosiasi 0–1).
- **Peringatan validitas:** bila ada sel `E < 5` (dan/atau >20% sel) → tampilkan peringatan
  "uji chi-square kurang andal; pertimbangkan menggabungkan kategori / Fisher's exact (2×2)".

### 5.5 Edge cases
- `n = 0` → tampilkan "Belum ada jawaban".
- `n < 30` → CI tetap dihitung tapi diberi label "n kecil, interpretasikan hati-hati".
- Opsi tunggal (variasi 0) → MoE = 0, beri catatan.
- Crosstab dengan satu dimensi kosong → pesan ramah.

---

## 6. API Backend

Prefix baru `/analytics` (router `backend/src/routes/analytics.js`), semua
`requireRole(['admin','supervisor'])`. Filter query: `start_date`, `end_date`, `surveyor_id`.

### 6.1 Kelengkapan data (dashboard)
`GET /analytics/surveys/:id/completeness` →
```json
{
  "totalResponses": 320,
  "avgCompletionPct": 92.4,
  "questions": [
    { "question_id": "...", "text": "Usia", "answered": 318, "answerRatePct": 99.4 }
  ],
  "mostSkipped": [ { "question_id": "...", "text": "Catatan", "answerRatePct": 41.2 } ]
}
```
> Bisa juga diringkas ke dashboard utama (kartu "kelengkapan" + 3 paling dilewati).

### 6.2 Ringkasan per pertanyaan
`GET /analytics/surveys/:id/summary` →
```json
{
  "survey": { "id": "...", "title": "...", "population_size": 5000 },
  "n_responses": 320,
  "confidence": 0.95,
  "assumptionNote": "Asumsi acak sederhana...",
  "questions": [
    {
      "question_id": "...", "text": "Pilihan partai", "type": "single_choice",
      "n": 312,
      "options": [
        { "value": "A", "label": "Partai A", "count": 140,
          "pct": 44.9, "moe": 5.5, "ci": [39.5, 50.4] }
      ]
    },
    {
      "question_id": "...", "text": "Usia", "type": "numeric_scale",
      "n": 318, "mean": 37.2, "median": 36, "sd": 11.4,
      "ciMean": [35.9, 38.5], "min": 17, "max": 78,
      "distribution": [ { "bucket": "17-25", "count": 60 } ]
    }
  ]
}
```

### 6.3 Cross-tabulation
`GET /analytics/surveys/:id/crosstab?row=<qid>&col=<qid>&level=province` →
```json
{
  "row": { "question_id": "...", "text": "Gender", "categories": ["L","P"] },
  "col": { "question_id": "...", "text": "Pilihan", "categories": ["A","B","C"] },
  "table": [[40,55,20],[60,35,30]],
  "rowTotals": [115,125], "colTotals": [100,90,50], "grandTotal": 240,
  "chiSquare": 12.34, "df": 2, "pValue": 0.0021,
  "cramersV": 0.23,
  "lowExpectedCells": 0,
  "warning": null
}
```

### 6.4 Implementasi & performa
- Agregasi via SQL `GROUP BY` pada `answers` (join `responses` untuk filter & exclude PENDING).
- Untuk JSONB (`multiple_choice`/`matrix`/`region`) → ekspansi di aplikasi atau `jsonb_array_elements`.
- **Caching**: hasil summary/crosstab di-cache di Redis dengan key
  `analytics:{surveyId}:{hash(filter)}`, TTL pendek (mis. 5–10 mnt) atau invalidasi
  saat ada response baru (statistik sudah ada `incrementResponseStats`).
- Pastikan hanya menghitung response valid (bukan `questionnaire_number LIKE 'PENDING-%'`).

---

## 7. UI Frontend

### 7.1 Halaman Analisis (`/analytics`)
- **Header**: pemilih survei + filter (tanggal, TPD) + tombol Ekspor.
- **Ringkasan atas**: N responden, tingkat kelengkapan, label asumsi MoE.
- **Daftar pertanyaan** (kartu per pertanyaan):
  - Pilihan → bar chart horizontal: label, %, dan **"± MoE"** + bound CI saat hover;
    tabel kecil count/%/CI di bawah.
  - Rating/numerik → kartu mean/median/SD + CI + histogram.
  - Matrix → stacked bar per baris.
  - Wilayah → top-N + pilih level.
  - Teks → jumlah terisi + lihat daftar jawaban.
- **Bagian Cross-tab** (terpisah di bawah): dua dropdown (baris/kolom) → tabel + toggle %/count
  + hasil uji (χ², p-value, Cramér's V) + peringatan validitas.
- Komponen chart: **recharts** (sudah dipakai).
- State kosong/n-kecil ditangani jelas.

### 7.2 Input populasi
- Field "Ukuran Populasi (opsional)" di Survey Builder/edit.
- Indikator di halaman analisis: "MoE dikoreksi populasi terbatas (N=5000)" bila terisi,
  atau "Asumsi populasi besar" bila kosong.

### 7.3 Sidebar
- Tambah item "Analisis" (admin & supervisor) di `NAV_ITEMS_BY_ROLE`.

---

## 8. Pustaka Statistik

Butuh distribusi **chi-square** (p-value) & **t** (nilai kritis CI mean).
Dua opsi:
- **A. Tanpa dependency** — implementasi fungsi murni di `statistics.js`
  (regularized lower incomplete gamma untuk chi-square CDF; t-quantile via
  aproksimasi / inversi). Lebih ringan, perlu unit test ketat.
- **B. `jstat`** (kecil, teruji) untuk `jStat.chisquare.cdf`, `jStat.studentt.inv`.

Rekomendasi: **B (jstat)** agar akurat & cepat, dibungkus di `statistics.js` supaya
mudah diganti. Tetap tulis unit test membandingkan hasil dengan nilai acuan R/scipy.

---

## 9. Pengujian
- Unit test `statistics.js`: proporsi+Wilson, MoE, FPC, mean CI, chi-square, Cramér's V
  diuji terhadap nilai acuan yang diketahui (mis. dari R/scipy).
- Unit test endpoint (mock model) seperti pola `responses.test.js`:
  base-N benar, exclude PENDING, filter diterapkan, bentuk JSON sesuai.
- Uji edge: n=0, n=1, opsi tunggal, expected-cell<5.

---

## 10. Rencana Implementasi Bertahap

**Fase 1 — Fondasi statistik & kelengkapan**
1. `statistics.js` + unit test (proporsi, Wilson, MoE, FPC, mean CI).
2. Migrasi `surveys.population_size` + model + input UI.
3. Endpoint `/analytics/surveys/:id/completeness` + kartu kelengkapan di dashboard.

**Fase 2 — Ringkasan per pertanyaan**
4. Endpoint `/summary` (semua tipe) + caching.
5. Halaman Analisis: pemilih survei, filter, kartu per pertanyaan + chart + CI.
6. Item sidebar "Analisis".

**Fase 3 — Cross-tab & uji**
7. chi-square/Cramér's V di `statistics.js` + unit test.
8. Endpoint `/crosstab` + UI builder crosstab + peringatan validitas.

**Fase 4 — Polish**
9. Ekspor (Excel/PDF) hasil analisis.
10. (Opsional, kemudian) pembobotan/design effect.

---

## 11. Keputusan yang Sudah Disepakati
- MoE: default populasi besar; **FPC otomatis bila `population_size` diisi** (opsional).
- Akses: **admin & supervisor**.
- Kedalaman: deskriptif + **MoE/CI (riset lanjutan)**; **cross-tab + chi-square + Cramér's V**.
- Pembobotan: di luar lingkup awal (titik ekstensi disiapkan).

## 12. Perlu Konfirmasi Saat Mulai Implement
- Nama rute final: `/analytics` vs `/analysis` (default: `/analytics`).
- Pustaka statistik: `jstat` (rekomendasi) vs implementasi murni.
- Lokasi input "Ukuran Populasi": Survey Builder vs halaman Analisis.
