# Akses Reviewer (App access) + Release Notes

Aplikasi **Survei Populi Center** punya **login wall** dan **tanpa pendaftaran
mandiri**. Reviewer Google **tidak bisa masuk sendiri** → Anda WAJIB memberi
**akun demo** di Play Console, atau app **ditolak**.

---

## 🚨 Tiga jebakan yang membuat reviewer TERJEBAK (paling sering bikin ditolak)

Reviewer sering menjalankan app di **emulator/perangkat data center** — sering
**tanpa GPS nyata, tanpa mikrofon, tanpa kamera**. Kalau app memaksa itu, reviewer
tak bisa menyelesaikan alur → app dinilai rusak → **ditolak**.

| # | Jebakan | Wajib disetel |
|---|---|---|
| 1 | **Kunci Perangkat** — akun demo terikat ke HP Anda → reviewer ditolak login | Manajemen TPD → akun demo → **Reset Perangkat** (chip 🔒 HP hilang) **dan** survei Demo → **Kunci Perangkat = Nonaktif** |
| 2 | **GPS Wajib** — emulator tak dapat fix → tombol Simpan **terblokir** | Survei Demo → **Lokasi GPS = Opsional** (jangan Wajib) |
| 3 | **Audio/Foto/Tanda tangan Wajib** — reviewer menolak izin → submit gagal | Survei Demo → **semua Opsional** (jangan Wajib) |

> Setelah reset perangkat, **jangan login akun demo dari HP Anda** — nanti terikat lagi.

---

## 1 · Buat akun TPD demo + survei "Demo"

Lewat dashboard admin (`populicenter.com`):

**Akun:**
| Field | Isi |
|-------|-----|
| Nama | `Reviewer Google` |
| Email | `reviewer@populicenter.org` |
| Password | (password kuat khusus review) |
| Peran | **surveyor (TPD)** |

**Survei "Demo":**
- Status **aktif**, beberapa pertanyaan contoh, **kuota kecil** (mis. 5).
- Tugaskan ke akun reviewer + beri beberapa **nomor kuesioner**.
- **Field Tools** (Survei → Pengaturan Field Tools) — setel seperti ini:

| Field Tool | Setelan untuk survei Demo |
|---|---|
| Kunci Perangkat | **Nonaktif** |
| Lokasi GPS | **Opsional** |
| Rekaman Audio | **Opsional** |
| Pengambilan Foto | **Opsional** |
| Tanda Tangan | **Opsional** |

- Pastikan akun **tetap aktif** selama masa review (jangan dinonaktifkan).
- Akun ini hanya melihat survei Demo → **tidak menyentuh data responden asli**.

---

## 2 · Play Console → App content → **App access**

Pilih **"All or some functionality is restricted"** → tambah satu entri:

- **Nama**: `Login petugas (TPD)`
- **Username**: `reviewer@populicenter.org`
- **Password**: *(password akun demo)*
- **Instruksi** — tempel apa adanya:

```
Aplikasi ini hanya untuk petugas survei terotorisasi. Akun dibuat oleh admin —
tidak ada pendaftaran mandiri. Gunakan akun demo di atas.

LANGKAH:
1. Buka aplikasi. Di layar "Masuk", isi email dan password di atas, lalu tekan
   tombol "Masuk".
2. Muncul halaman "Daftar Survei". Pilih survei bernama "Demo".
3. Tekan "Mulai Isi" (atau pilih salah satu Nomor Kuesioner yang berstatus
   "Belum diisi").
4. Isi pertanyaan, lalu tekan "Simpan Data Responden" di bagian bawah.
5. Selesai — muncul halaman konfirmasi bahwa data tersimpan.

CATATAN:
- Aplikasi dapat meminta izin Lokasi, Kamera, dan Mikrofon. Pada survei "Demo"
  semuanya OPSIONAL — Anda boleh MENOLAK izin tersebut dan tetap dapat
  menyelesaikan serta menyimpan kuesioner.
- Aplikasi mendukung mode offline: bila tanpa jaringan, data disimpan di
  perangkat dan otomatis terkirim saat kembali online.
- Tidak ada pembelian dalam aplikasi dan tidak ada iklan.
```

---

## 3 · Jalur permintaan hapus data (App content → Data deletion)

Tidak ada hapus-akun in-app (akun dikelola admin), jadi nyatakan jalur kontak:

```
Permintaan penghapusan akun/data diajukan melalui dukungan:
Email: info@populicenter.org
WhatsApp: +62 812-9206-8362
Kebijakan Privasi: https://populicenter.com/kebijakan-privasi.html
```

---

## 4 · Release notes (siap salin)

**Rilis pertama** — Closed testing & Production (maks. 500 karakter):
```
Rilis pertama Survei Populi Center.

• Pengisian kuesioner survei langsung dari ponsel.
• Mode offline: data tersimpan di perangkat saat tanpa sinyal dan otomatis
  tersinkron saat kembali online.
• Tunda & lanjutkan kuesioner tanpa kehilangan jawaban maupun rekaman.
• Penanda lokasi GPS, foto bukti, rekaman audio, dan tanda tangan responden
  (bila diaktifkan admin).
• Pemantauan kuota dan progres penugasan.
```

**Contoh untuk rilis berikutnya** (sesuaikan isinya):
```
• Perbaikan penyimpanan data saat mode offline.
• Peningkatan stabilitas sinkronisasi.
• Perbaikan tampilan status pengiriman data.
```

> Tulis dalam bahasa **id-ID** (bahasa default listing). Hindari istilah teknis
> internal (nama file, kode error) — reviewer & pengguna tidak memerlukannya.

---

## 5 · Cek terakhir sebelum submit

- [ ] Akun demo **aktif**, password benar, **tidak** terikat perangkat (🔒 HP hilang)
- [ ] Survei "Demo" **aktif**, Field Tools semuanya **Opsional**, Kunci Perangkat **Nonaktif**
- [ ] Akun demo punya **kuota + nomor kuesioner** tersedia (kalau kuota habis,
      reviewer tak bisa mengisi → dianggap rusak)
- [ ] Server `populicenter.com` **online & stabil** selama review — reviewer
      benar-benar menjalankan app. **Jangan deploy berisiko saat masa review.**
- [ ] Rate-limit login tidak memblokir percobaan wajar reviewer
- [ ] Coba sendiri: **login akun demo di HP bersih → isi 1 kuesioner sampai
      tersimpan**, dengan **semua izin ditolak** (simulasi kondisi reviewer)
