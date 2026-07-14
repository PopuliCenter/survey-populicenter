# Data Safety — jawaban form Play Console (siap salin)

Untuk **Play Console → App content → Data safety**.

⚠️ **Play membandingkan deklarasi ini dengan perilaku nyata app.** Daftar di bawah
sudah dicocokkan dengan izin & fitur yang benar-benar ada di kode (lokasi, kamera,
mikrofon, ID perangkat). Jangan kurangi tanpa menghapus fiturnya.

Konteks: petugas (TPD) mengumpulkan data **responden** (pihak ketiga), plus ada
data akun petugas itu sendiri.

---

## 1 · Pertanyaan pembuka

| Pertanyaan | Jawaban |
|---|---|
| Apakah app mengumpulkan atau membagikan jenis data pengguna yang diwajibkan? | **Ya** |
| Apakah semua data pengguna dienkripsi saat transit? | **Ya** (HTTPS/TLS) |
| Apakah Anda menyediakan cara bagi pengguna untuk meminta data dihapus? | **Ya** |
| URL kebijakan privasi | `https://populicenter.com/kebijakan-privasi.html` |
| Jalur permintaan hapus data | `info@populicenter.org` · WhatsApp +62 812-9206-8362 |

---

## 2 · Jenis data yang dikumpulkan

Untuk **setiap** baris di bawah, isian di Play Console:
- **Dikumpulkan (Collected)** = **Ya**
- **Dibagikan (Shared)** = **Tidak** — lihat catatan §4
- **Diproses sementara saja (Ephemeral)** = **Tidak** (data disimpan di server)
- **Wajib atau opsional** = **Wajib** (kecuali ditandai *opsional*)

| Kategori Play | Jenis data | Tujuan (pilih di Play) | Keterangan |
|---|---|---|---|
| **Lokasi** | Lokasi presisi | Fungsi aplikasi · Pencegahan kecurangan & keamanan | Titik GPS wawancara (verifikasi cakupan). **Foreground saja** — tidak ada pelacakan latar belakang. |
| **Info pribadi** | Nama | Fungsi aplikasi | Nama petugas; nama responden **bila** ditanyakan kuesioner. |
| **Info pribadi** | Alamat email | Fungsi aplikasi · Pengelolaan akun | Email akun petugas (dibuat admin). |
| **Info pribadi** | Nomor telepon | Fungsi aplikasi | *Opsional* — hanya bila kuesioner menanyakan kontak responden. |
| **Info pribadi** | Info pribadi lainnya | Fungsi aplikasi | Tanda tangan persetujuan responden (bila diaktifkan admin). |
| **Foto & video** | Foto | Fungsi aplikasi | Foto bukti wawancara (bila diaktifkan admin). |
| **Audio** | Rekaman suara | Fungsi aplikasi · Pencegahan kecurangan & keamanan | Rekaman wawancara untuk kendali mutu (bila diaktifkan admin). |
| **Aktivitas aplikasi** | Interaksi dalam app | Fungsi aplikasi · Analitik | Log pengisian & sinkronisasi (kendali mutu, deteksi anomali). |
| **ID perangkat** | ID perangkat | Pencegahan kecurangan & keamanan | Fitur **kunci perangkat**: satu akun petugas dikunci ke satu perangkat agar akun tak dipakai orang lain. |

---

## 3 · Praktik keamanan (centang di Play)

- ✅ **Data dienkripsi saat transit** (HTTPS/TLS).
- ✅ **Pengguna dapat meminta penghapusan data** (via kontak dukungan).
- ❌ Kebijakan Keluarga / ditujukan untuk anak → **Tidak** (target: dewasa 18+).

---

## 4 · Kenapa "Dibagikan = Tidak"

Data hanya diserahkan ke **Klien Riset** dalam bentuk **agregat/anonim** — bukan
transfer data pribadi individual ke pihak ketiga. Menurut definisi Play, itu
**bukan** "sharing". Penyedia infrastruktur (hosting) memproses data **atas
instruksi kami** dan juga tidak dihitung sebagai sharing.

> Bila suatu saat data pribadi individual benar-benar dikirim ke pihak ketiga,
> deklarasi ini **wajib** diubah menjadi "Dibagikan = Ya".

---

## 5 · Cek terakhir sebelum submit

- [ ] Izin di app (lokasi, kamera, mikrofon) **cocok** dengan tabel §2.
- [ ] **ID perangkat** ikut dideklarasikan (fitur kunci perangkat) — sering terlewat.
- [ ] **Audio** ikut dideklarasikan (rekaman wawancara) — sering terlewat.
- [ ] Kebijakan Privasi live & memuat jalur **hapus data**
      → sudah ada di `kebijakan-privasi.html` §9.
