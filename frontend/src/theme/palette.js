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

// ── Mode gelap ───────────────────────────────────────────────────────────────
// Dipakai tailwind.config.js (variabel --bg-*, --fg-*, --bd-* di bawah html.dark).
// Tiga tabel karena level yang sama butuh nilai berbeda: gray-300 = #595752 sebagai
// latar, #8e8c86 sebagai teks, #77756f sebagai garis. Skala DILIPAT, bukan dicermin:
// semua teks terang (latar semuanya gelap kecuali solid), solid 600+ tetap gelap
// supaya text-white lolos. Hex di atas (skala terang) tidak berubah. Dijaga palette.test.js.
export const surface = {
  page: '#141312', // body, bg-gray-50, bg-cream
  card: '#1c1b19', // bg-white
  raised: '#232220', // bg-white di dalam .shadow-lg/.shadow-xl/.shadow-2xl (modal)
};

export const darkBg = {
  brand: { 50: '#35241a', 100: '#3b2519', 200: '#552f1c', 300: '#73391d', 400: '#f3844f', 500: '#f36523', 600: '#c2440c', 700: '#a5390a', 800: '#832e0a', 900: '#672509' },
  ink: { 50: '#141312', 100: '#292825', 200: '#2e2d2a', 300: '#595752', 400: '#73716c', 500: '#787570', 600: '#767470', 700: '#55534f', 800: '#45433f', 900: '#0e0d0c' },
  positive: { 50: '#232922', 100: '#273127', 200: '#2d3d2f', 300: '#364f3b', 400: '#5c9a6d', 500: '#559568', 600: '#2f7a49', 700: '#27663d', 800: '#1f5231', 900: '#183f26' },
  warning: { 50: '#2c271c', 100: '#342e1d', 200: '#40381f', 300: '#544823', 400: '#c9a437', 500: '#907212', 600: '#7f6410', 700: '#65500c', 800: '#4f3e0a', 900: '#3f3108' },
  negative: { 50: '#322424', 100: '#3e292a', 200: '#503033', 300: '#6c3b41', 400: '#d0697a', 500: '#c84b60', 600: '#bd3f55', 700: '#992d42', 800: '#7d2337', 900: '#631c2c' },
  info: { 50: '#252829', 100: '#2a2f32', 200: '#323a3f', 300: '#3e4b55', 400: '#6c8aa5', 500: '#587997', 600: '#4a6c8a', 700: '#395873', 800: '#2d475d', 900: '#24394b' },
};

export const darkFg = {
  brand: { 50: '#fef5f0', 100: '#fde6da', 200: '#fac9af', 300: '#f6a67e', 400: '#f3844f', 500: '#f36523', 600: '#f3844f', 700: '#f6a67e', 800: '#fac9af', 900: '#fde6da' },
  ink: { 50: '#f7f7f6', 100: '#efefed', 200: '#7d7b75', 300: '#8e8c86', 400: '#a3a19c', 500: '#a8a6a0', 600: '#bdbbb5', 700: '#d3d1cc', 800: '#e5e3df', 900: '#f2f1ee' },
  positive: { 50: '#f0f6f1', 100: '#ddebe0', 200: '#bdd8c3', 300: '#8fbc9a', 400: '#7fb28c', 500: '#86b793', 600: '#8fbc9a', 700: '#a5cbaf', 800: '#bdd8c3', 900: '#ddebe0' },
  warning: { 50: '#fbf6e6', 100: '#f5eac8', 200: '#ebd793', 300: '#ddbe5f', 400: '#ddbe5f', 500: '#d0ae49', 600: '#d8b957', 700: '#e2c877', 800: '#ebd793', 900: '#f5eac8' },
  negative: { 50: '#fbf1f2', 100: '#f6dfe2', 200: '#ecbfc5', 300: '#de939d', 400: '#d98793', 500: '#de939d', 600: '#e3a1aa', 700: '#e8b0b8', 800: '#ecbfc5', 900: '#f6dfe2' },
  info: { 50: '#f1f4f7', 100: '#e0e7ee', 200: '#c3d0dc', 300: '#98aec2', 400: '#8fa7bc', 500: '#93aabf', 600: '#98aec2', 700: '#adc0d0', 800: '#c3d0dc', 900: '#e0e7ee' },
};

export const darkBorder = {
  brand: { 50: '#41281b', 100: '#4d2c1b', 200: '#62331c', 300: '#c25421', 400: '#f3844f', 500: '#f36523', 600: '#f36523', 700: '#f3844f', 800: '#f6a67e', 900: '#fac9af' },
  ink: { 50: '#2b2a27', 100: '#2f2e2b', 200: '#33322f', 300: '#77756f', 400: '#8d8b85', 500: '#a5a39d', 600: '#bcbab4', 700: '#55534f', 800: '#45433f', 900: '#33322f' },
  positive: { 50: '#273127', 100: '#2a382c', 200: '#304434', 300: '#50835d', 400: '#6da57c', 500: '#7fb28c', 600: '#8fbc9a', 700: '#a5cbaf', 800: '#bdd8c3', 900: '#ddebe0' },
  warning: { 50: '#332e1d', 100: '#3b341e', 200: '#493f21', 300: '#8d752d', 400: '#c9a437', 500: '#d0ae49', 600: '#d8b957', 700: '#e2c877', 800: '#ebd793', 900: '#f5eac8' },
  negative: { 50: '#3e282a', 100: '#482d2f', 200: '#5c3439', 300: '#ba5967', 400: '#d0697a', 500: '#d98793', 600: '#de939d', 700: '#e3a1aa', 800: '#ecbfc5', 900: '#f6dfe2' },
  info: { 50: '#2a2f32', 100: '#2f353a', 200: '#374148', 300: '#607a91', 400: '#7595b0', 500: '#8fa7bc', 600: '#98aec2', 700: '#adc0d0', 800: '#c3d0dc', 900: '#e0e7ee' },
};

export default { brand, ink, positive, warning, negative, info };
