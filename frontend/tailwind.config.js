import plugin from 'tailwindcss/plugin.js';
import { brand, ink, positive, warning, negative, info, surface, darkBg, darkFg, darkBorder } from './src/theme/palette.js';

// ── Token warna: palette.js → variabel CSS → kelas Tailwind ─────────────────────
// Nama kelas lama tidak berubah. Tiga tabel karena token yang sama berarti lain:
//   --bg-*  latar   : bg, accent, gradien, ring-offset
//   --fg-*  isi     : text dan semua yang diturunkan dari theme.colors (placeholder,
//                     fill, stroke, caret, decoration, outline, warna shadow)
//   --bd-*  garis   : border, divide (otomatis ikut borderColor), ring
// Di mode terang ketiganya bernilai sama dengan palette.js: render identik.
const SCALES = { brand, ink, positive, warning, negative, info };
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (role, name) => Object.fromEntries(SHADES.map((n) => [n, token(`${role}-${name}-${n}`)]));

// Alias nama kelas lama → skala palet (pemetaan sama seperti sebelumnya):
//   primary, accent, orange      → oranye Populi (satu warna aksi, web & APK)
//   gray, slate                  → netral tinta
//   green, emerald               → positif
//   amber, yellow                → peringatan (oker)
//   red, rose                    → negatif (krimson)
//   blue, indigo, violet, purple,
//   sky, cyan, teal              → info (satu biru tinta — tanpa warna pelangi)
const family = (role) => {
  const b = scale(role, 'brand'), k = scale(role, 'ink'), p = scale(role, 'positive');
  const w = scale(role, 'warning'), n = scale(role, 'negative'), i = scale(role, 'info');
  return {
    primary: b, accent: b, orange: b,
    gray: k, slate: k,
    green: p, emerald: p,
    amber: w, yellow: w,
    red: n, rose: n,
    blue: i, indigo: i, violet: i, purple: i, sky: i, cyan: i, teal: i,
    // Latar layar TPD. Dulu krem #faf6f0; kini netral agar kontras di lapangan.
    cream: token(`${role}-ink-50`),
  };
};
const bgFamily = { ...family('bg'), white: token('bg-white') };

const themeVars = plugin(({ addBase }) => {
  const light = {};
  const night = {};
  for (const [role, table] of [['bg', darkBg], ['fg', darkFg], ['bd', darkBorder]]) {
    for (const [name, values] of Object.entries(SCALES)) {
      for (const n of SHADES) {
        const key = `--${role}-${name}-${n}`;
        light[key] = toRgb(values[n]);
        // Yang sama dengan terang tak ditulis ulang (mis. bg-primary-600 tetap solid).
        if (table[name][n].toLowerCase() !== values[n].toLowerCase()) night[key] = toRgb(table[name][n]);
      }
    }
  }
  light['--bg-white'] = '255 255 255';
  night['--bg-white'] = toRgb(surface.card);
  // Garis tipis & bayangan: tinta di terang; putih tipis + hitam di gelap.
  light['--hairline'] = toRgb(ink[900]);
  night['--hairline'] = '255 255 255';
  light['--shade'] = toRgb(ink[900]);
  night['--shade'] = '0 0 0';

  addBase({
    ':root': { ...light, colorScheme: 'light' },
    // Cetak selalu terang: teks terang di kertas putih tak terbaca.
    '@media not print': {
      // colorScheme wajib: 126 field tanpa kelas bg-* bergantung pada warna bawaan browser.
      'html.dark': { ...night, colorScheme: 'dark' },
      // Modal naik satu tingkat tanpa mengubah 22 lokasi bg-white.
      'html.dark .shadow-lg, html.dark .shadow-xl, html.dark .shadow-2xl': { '--bg-white': toRgb(surface.raised) },
      // Spesifisitas 0: kelas bg-* tetap menang. Menyamakan input polos dengan permukaan.
      ':where(html.dark) :where(input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="color"], :disabled), select:not(:disabled), textarea:not(:disabled))': {
        backgroundColor: 'rgb(var(--bg-white))',
      },
    },
  });
});

/** @type {import('tailwindcss').Config} */
export default {
  // Menghasilkan `html.dark .x` polos, tanpa :is()/:where(). Hanya untuk pengecualian langka.
  darkMode: ['variant', 'html.dark &'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  // WAJIB: selektor ber-kelas di addBase bersifat on-demand. Tanpa ini seluruh blok
  // html.dark terbuang diam-diam bila kata `dark` tak muncul sebagai kandidat di content.
  safelist: ['dark'],
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
      // colors = tabel isi: properti yang tidak ditimpa di bawah otomatis tertutup,
      // termasuk yang belum dipakai hari ini (fill-*, stroke-*, dst.).
      // bg-paper / text-paper-ink: selalu putih + tinta (kanvas TTD, knob, panel brand).
      // white & black TIDAK dipetakan di sini: text-white dan border-white tetap putih.
      colors: { ...family('fg'), paper: { DEFAULT: '#ffffff', ink: ink[900] } },
      backgroundColor: bgFamily,
      accentColor: family('bg'),
      gradientColorStops: bgFamily,
      // divide-* ikut otomatis: divideColor bawaan = theme('borderColor').
      borderColor: { ...family('bd'), DEFAULT: token('bd-ink-200') },
      // DEFAULT dua baris ini SENGAJA tanpa <alpha-value>: Tailwind 3.4.4 tidak
      // mengolahnya di jalur nilai bawaan. Dengan <alpha-value>, warna ring bawaan
      // jatuh ke biru dan ring-offset bocor literal sehingga SEMUA ring hilang.
      ringColor: { ...family('bd'), DEFAULT: 'rgb(var(--bd-info-500))' },
      ringOffsetColor: { ...bgFamily, DEFAULT: 'rgb(var(--bg-white))' },
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
        DEFAULT: '0 0 0 1px rgb(var(--hairline) / 0.09)',
        md: '0 0 0 1px rgb(var(--hairline) / 0.09)',
        lg: '0 0 0 1px rgb(var(--hairline) / 0.08), 0 4px 12px rgb(var(--shade) / 0.08)',
        xl: '0 0 0 1px rgb(var(--hairline) / 0.08), 0 8px 24px rgb(var(--shade) / 0.12)',
        '2xl': '0 0 0 1px rgb(var(--hairline) / 0.08), 0 12px 32px rgb(var(--shade) / 0.16)',
      },
    },
  },
  plugins: [themeVars],
};
