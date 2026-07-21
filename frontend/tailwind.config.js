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
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Aksen hangat (oranye/coral) untuk pengalaman isi-survei (surveyor).
        accent: {
          50: '#fff5ed',
          100: '#ffe8d4',
          200: '#fecda9',
          300: '#fdac72',
          400: '#fb8138',
          500: '#f96316',
          600: '#ea4c0c',
          700: '#c23a0c',
          800: '#9a3012',
          900: '#7c2912',
        },
        // Latar krem hangat untuk layar surveyor.
        cream: '#faf6f0',
      },
    },
  },
  plugins: [],
};
