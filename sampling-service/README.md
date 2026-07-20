# sampling-service — layanan Random Sampling (Python/FastAPI)

Menyediakan menu **Random Sampling** di dashboard. Membungkus engine metodologi
sampling wilayah (MFD/BPS) sebagai API HTTP JSON agar dipanggil frontend React
lewat proxy backend Node.

## Asal engine
`sampling_engine.py` **di-vendor** dari aplikasi Streamlit `Asisten_random_sampling`
(engine metodologi otoritatif — alokasi proporsional + largest-remainder +
stratifikasi Kota/Desa + PPS + jaminan cakupan). Jangan edit logika di sini;
bila engine diperbarui di sumber, salin ulang file ini.

## Keamanan (PENTING)
- **Tanpa auth** dan **tanpa port ke host**. Hanya diakses backend Node
  (JWT + role admin/supervisor) via network internal Docker (`sampling:8000`).
- JANGAN ekspos port 8000 ke internet.
- MFD **tidak** dibundel (diunggah saat dipakai). Yang dibundel hanya referensi
  DPT/Penduduk per provinsi (`data/referensi_provinsi.csv`, non-PII, bisa
  ditimpa lewat unggahan).

## Endpoint
| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | Health check (dipakai Docker healthcheck) |
| POST | `/inspect` | Unggah MFD → daftar provinsi/kab + status DPT/Penduduk (isi form) |
| POST | `/preview` | Pratinjau alokasi titik per wilayah **tanpa** seleksi acak (cepat, tanpa Excel) |
| POST | `/run` | Jalankan sampling (MFD + `config` JSON) → ringkasan/tabel + 2 Excel (base64) |
| GET | `/template/mfd` | Unduh template MFD (Excel) |
| GET | `/template/reference` | Unduh template referensi DPT/Penduduk (Excel) |

`config` (form field, JSON string): `scope` (NASIONAL/PROVINSI/KABUPATEN),
`scope_filter[]`, `unit` (DESA/KABUPATEN), `n_total`, `cluster_size`,
`weights{PENDUDUK,DPT,MFD}`, `stratify_ur`, `min_per_unit`, `pps`, `seed`.

`/preview` dan `/run` menerima `config` yang sama. Alokasi bersifat deterministik
(tak bergantung `seed`), jadi angka `/preview` **sama persis** dengan alokasi
hasil `/run` — yang butuh `seed` hanyalah desa mana yang akhirnya terpilih.

## Jalankan lokal (dev)
```bash
pip install -r requirements.txt
uvicorn main:app --port 8000
```

## Docker
Dibangun otomatis oleh CI → `ghcr.io/populicenter/survey-sampling`. Di produksi
ikut `docker compose` (service `sampling`).
