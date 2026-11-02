/**
 * palette.js — SATU sumber warna aplikasi (web & APK). Dipakai tailwind.config.js
 * dan grafik (chartTheme.js). Kontrasnya dijaga src/__tests__/palette.test.js.
 *
 * Arah: laporan riset, bukan templat dashboard. Satu warna brand (oranye logo
 * Populi #F36523) untuk aksi & sorotan; teks tinta di atas putih; garis tipis
 * menggantikan bayangan. Warna status sengaja diredam dan dijauhkan dari oranye:
 *   · merah digeser ke krimson  → tak tertukar dengan tombol utama
 *   · kuning digeser ke oker    → tak tertukar dengan oranye
 *   · ungu/biru/teal dst. dilebur ke satu "info" → tidak ada warna pelangi
 */

// Oranye logo. 500 = warna logo apa adanya (untuk bar & sorotan). Tombol/teks
// memakai 600 ke atas: putih di atas 500 hanya ±3:1, tak lolos AA untuk teks.
export const brand = {
  50: '#fef5f0',
  100: '#fde6da',
  200: '#fac9af',
  300: '#f6a67e',
  400: '#f3844f',
  500: '#f36523',
  600: '#c2440c',
  700: '#a5390a',
  800: '#832e0a',
  900: '#672509',
};

// Netral tinta: nyaris tanpa warna, sedikit hangat agar selaras dengan oranye.
// Sengaja BUKAN krem — latar krem menurunkan kontras di bawah terik matahari.
export const ink = {
  50: '#f7f7f6',
  100: '#efefed',
  200: '#e2e1de',
  300: '#cbc9c5',
  400: '#a3a19c',
  500: '#6d6b66',
  600: '#55534f',
  700: '#403e3b',
  800: '#2b2a27',
  900: '#1a1917',
};

export const positive = {
  50: '#f0f6f1',
  100: '#ddebe0',
  200: '#bdd8c3',
  300: '#8fbc9a',
  400: '#5c9a6d',
  500: '#3a7f4f',
  600: '#2c6b40',
  700: '#235634',
  800: '#1c4429',
  900: '#16351f',
};

export const warning = {
  50: '#fbf6e6',
  100: '#f5eac8',
  200: '#ebd793',
  300: '#ddbe5f',
  400: '#c9a437',
  500: '#a8841f',
  600: '#7f6410',
  700: '#65500c',
  800: '#4f3e0a',
  900: '#3f3108',
};

export const negative = {
  50: '#fbf1f2',
  100: '#f6dfe2',
  200: '#ecbfc5',
  300: '#de939d',
  400: '#cb6070',
  500: '#b5344a',
  600: '#9e2238',
  700: '#841a2e',
  800: '#6b1526',
  900: '#54111e',
};

export const info = {
  50: '#f1f4f7',
  100: '#e0e7ee',
  200: '#c3d0dc',
  300: '#98aec2',
  400: '#6c8aa5',
  500: '#4a6c8a',
  600: '#395873',
  700: '#2d475d',
  800: '#24394b',
  900: '#1c2d3b',
};

export default { brand, ink, positive, warning, negative, info };
