import { brand, ink, positive, warning, negative, info } from './src/theme/palette.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // ── Skala teks ──────────────────────────────────────────────────────────
      // Sebelumnya ada 39 pemakaian ukuran sembarang (text-[10px]/text-[11px])
      // yang tersebar tanpa aturan. Satu langkah bernama membuatnya disengaja
      // dan konsisten. 10px dinaikkan ke 11px — di bawah itu teks sulit dibaca,
      // terlebih di layar HP.
      //
      // Skala yang dipakai aplikasi (jangan mengarang ukuran baru):
      //   2xs  11px  → meta/keterangan kecil (timestamp, satuan, catatan kaki)
      //   xs   12px  → label, badge, teks pendamping
      //   sm   14px  → teks isi & sebagian besar kontrol (ukuran kerja utama)
      //   base 16px  → teks isi yang perlu menonjol
      //   lg   18px  → judul kartu/bagian
      //   xl   20px  → judul bagian besar
      //   2xl  24px  → JUDUL HALAMAN (h1) — seragam di seluruh dashboard
      //
      // ── Bobot huruf (hierarki) ──────────────────────────────────────────────
      //   bold      → judul halaman (h1) & judul modal/dialog
      //   semibold  → judul bagian di dalam kartu (h2/h3)
      //   medium    → label formulir, header tabel, sel identitas baris
      //   normal    → teks isi (jangan disetel; ini bawaan)
      // Teks isi TIDAK perlu ditebalkan. Menebalkan semuanya menghapus hierarki.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      // ── Warna ───────────────────────────────────────────────────────────────
      // Nilai ada di src/theme/palette.js (dijaga tes kontras). Nama class Tailwind
      // sengaja dipertahankan — ribuan pemakaian ikut berubah dari satu tempat:
      //   primary, accent, orange      → oranye Populi (satu warna aksi, web & APK)
      //   gray, slate                  → netral tinta
      //   green, emerald               → positif
      //   amber, yellow                → peringatan (oker)
      //   red, rose                    → negatif (krimson)
      //   blue, indigo, violet, purple,
      //   sky, cyan, teal              → info (satu biru tinta — tanpa warna pelangi)
      colors: {
        primary: brand,
        accent: brand,
        orange: brand,
        gray: ink,
        slate: ink,
        green: positive,
        emerald: positive,
        amber: warning,
        yellow: warning,
        red: negative,
        rose: negative,
        blue: info,
        indigo: info,
        violet: info,
        purple: info,
        sky: info,
        cyan: info,
        teal: info,
        // Latar layar TPD. Dulu krem #faf6f0; kini netral agar kontras di lapangan.
        cream: ink[50],
      },
      fontFamily: {
        // Dibundel (lihat src/index.css) agar tampil sama saat offline di APK.
        sans: ['"Libre Franklin"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      // ── Sudut: tegas, bukan membulat di mana-mana. rounded-full tetap untuk
      // titik status, avatar, dan bar progres.
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.1875rem',
        md: '0.25rem',
        lg: '0.25rem',
        xl: '0.375rem',
        '2xl': '0.375rem',
        '3xl': '0.5rem',
      },
      // ── Bayangan: permukaan dibedakan garis tipis, bukan elevasi. Hanya elemen
      // yang benar-benar melayang (menu, modal) yang mendapat bayangan.
      boxShadow: {
        sm: '0 0 0 0 transparent',
        DEFAULT: '0 0 0 1px rgb(26 25 23 / 0.09)',
        md: '0 0 0 1px rgb(26 25 23 / 0.09)',
        lg: '0 0 0 1px rgb(26 25 23 / 0.08), 0 4px 12px rgb(26 25 23 / 0.08)',
        xl: '0 0 0 1px rgb(26 25 23 / 0.08), 0 8px 24px rgb(26 25 23 / 0.12)',
        '2xl': '0 0 0 1px rgb(26 25 23 / 0.08), 0 12px 32px rgb(26 25 23 / 0.16)',
      },
    },
  },
  plugins: [],
};
