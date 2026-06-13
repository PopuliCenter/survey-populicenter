# Menyematkan Hasil Survei di WordPress / Elementor

Panduan untuk tim website **populicenter.org** menampilkan hasil survei (grafik +
peta sebaran) dari sistem survei (risetcenter.com) ke dalam halaman WordPress.

Data yang ditampilkan **hanya agregat** (distribusi jawaban, jumlah responden,
sebaran per provinsi) — tidak ada jawaban individual, identitas, nomor telepon,
atau lokasi GPS responden. Aman untuk publik.

---

## 1. Dapatkan kode embed

1. Admin membuka dashboard survei → menu **Laporan & Ekspor**.
2. Pilih survei yang ingin ditampilkan.
3. Di kartu **Publikasi Hasil ke Publik**, klik **Publikasikan hasil**.
4. Setelah tayang, klik **Salin** pada kotak *Cuplikan embed*. Kode yang disalin
   berbentuk seperti ini (slug menyesuaikan survei):

   ```html
   <iframe
     src="https://risetcenter.com/embed/results/nama-survei"
     width="100%" height="800"
     style="border:0;width:100%"
     loading="lazy"
     title="Hasil Survei"></iframe>
   ```

> Setiap survei punya **slug** (URL) sendiri. Bila ada responden baru, admin cukup
> klik **Perbarui snapshot** — kode embed tidak berubah, angka di website otomatis
> ikut terbarui setelah cache habis (maks. ±5 menit).

---

## 2. Tempel di Elementor

1. Edit halaman dengan Elementor.
2. Seret widget **HTML** ke tempat yang diinginkan.
3. Tempel kode `<iframe>` di atas ke dalam widget HTML.
4. **Update / Publish** halaman.

Alternatif tanpa Elementor: di editor Gutenberg gunakan blok **HTML Kustom**, lalu
tempel kode yang sama.

---

## 3. (Opsional) Auto-resize tinggi iframe

Halaman embed mengirim tinggi kontennya ke halaman induk lewat `postMessage`,
sehingga iframe bisa menyesuaikan tinggi otomatis (tanpa scrollbar dalam).

Tambahkan **satu** widget HTML berisi skrip berikut **di mana saja pada halaman
yang sama** (cukup sekali per halaman). Beri iframe sebuah `id`, lalu rujuk di skrip:

```html
<!-- iframe dengan id -->
<iframe
  id="hasil-survei"
  src="https://risetcenter.com/embed/results/nama-survei"
  width="100%" height="800"
  style="border:0;width:100%"
  loading="lazy"
  title="Hasil Survei"></iframe>

<!-- skrip auto-resize -->
<script>
  window.addEventListener('message', function (e) {
    // Terima hanya dari origin sistem survei
    if (e.origin !== 'https://risetcenter.com') return;
    var data = e.data || {};
    if (data.type === 'populi-embed-height' && data.height) {
      var f = document.getElementById('hasil-survei');
      if (f) f.style.height = (data.height + 20) + 'px';
    }
  });
</script>
```

Jika ada **beberapa** embed di satu halaman, beri tiap iframe `id` unik dan
cocokkan dengan `data.slug` yang dikirim (mis. `data.slug === 'nama-survei'`).

---

## 4. Catatan teknis

- **Domain framing:** server hanya mengizinkan iframe dari `populicenter.org` dan
  subdomainnya (`*.populicenter.org`). Bila website memakai domain/subdomain lain,
  minta tim sistem survei menambahkannya di `frame-ancestors` (file `nginx-common.conf`,
  blok `location /embed/`).
- **HTTPS wajib:** sematkan selalu lewat `https://` agar tidak diblokir mixed-content.
- **Naratif/analisis** ditulis langsung di WordPress (di atas/bawah iframe). Embed
  hanya menyajikan visualisasi data.
- **Belum muncul / masih data lama?** Tunggu ±5 menit (cache) atau minta admin klik
  **Perbarui snapshot**. Bila halaman embed menampilkan "tidak ditemukan", berarti
  survei tersebut sedang **dicabut** dari publik.

---

## 4b. Embed monitoring klien (link privat)

Selain hasil publik, ada embed **monitoring** untuk klien memantau *capaian vs
target* random sampling (total & per provinsi), diperbarui berkala (±15 menit).

- Admin mengaktifkannya di **Laporan & Ekspor → Target Sampling per Provinsi →
  Aktifkan monitoring**, lalu menyalin **tautan privat bertoken** atau cuplikan iframe.
- Tautannya berbentuk `https://risetcenter.com/embed/monitor/<token-rahasia>`.
- **Bersifat privat** — token tidak bisa ditebak. Hanya bagikan ke klien terkait,
  jangan tayangkan di halaman publik.
- Capaian per provinsi hanya muncul bila survei punya pertanyaan wilayah
  (`indonesia_region`) dan target per provinsi sudah diisi admin. Jika tidak,
  hanya capaian total yang tampil.

Cara menyemat sama seperti embed hasil (widget HTML + skrip auto-resize), cukup
ganti `src` dengan tautan monitoring.

---

## 5. API publik (untuk integrasi lanjutan)

Bila tim website ingin merender sendiri (tanpa iframe), tersedia API JSON publik
(CORS terbuka, tanpa login):

| Endpoint | Keterangan |
|---|---|
| `GET https://risetcenter.com/public/results` | Daftar survei yang dipublikasikan |
| `GET https://risetcenter.com/public/results/{slug}` | Snapshot agregat satu survei |
| `GET https://risetcenter.com/public/monitor/{token}` | Snapshot monitoring (capaian vs target) — link privat |

Contoh isi snapshot: `response_count`, `questions[]` (tiap pertanyaan punya
`distribution[]` berisi `{ label, count, pct }`), dan `map.regions[]`
(`{ name, count }` per provinsi).
