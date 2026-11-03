/**
 * chartTheme.js — warna & gaya grafik (Recharts/Leaflet), satu sumber dengan
 * palette.js. Grafik memakai satu warna + penekanan, bukan warna berbeda per
 * bagian; warna kategori hanya untuk grafik yang memang butuh membedakan seri.
 *
 * CHART, CATEGORICAL, STATUS = hex tetap: dipakai src/public/* yang selalu terang.
 * CHART_THEMED, AXIS_TICK, TOOLTIP_PROPS = var(): dashboard, ikut tema tanpa render ulang.
 */
import { brand, ink, positive, warning, negative, info } from './palette';

export const CHART = {
  grid: ink[200],
  axis: ink[500],
  label: ink[700],
  bar: brand[500],
  barMuted: ink[300],
};

// Urutan dipilih agar seri bersebelahan tetap terbedakan (termasuk buta warna).
export const CATEGORICAL = [
  brand[500], info[500], positive[500], warning[400],
  negative[500], info[300], ink[400], positive[300],
];

export const STATUS = {
  good: positive[500],
  normal: info[500],
  warn: warning[400],
  none: ink[400],
};

export const CHART_THEMED = {
  grid: 'rgb(var(--bd-ink-200))',
  axis: 'rgb(var(--fg-ink-500))',
  label: 'rgb(var(--fg-ink-700))',
  bar: brand[500],
  barMuted: 'rgb(var(--bg-ink-300))',
};

export const AXIS_TICK = { fontSize: 12, fill: CHART_THEMED.axis };

// Recharts memberi latar #fff bila backgroundColor tak disetel, dan warna item #000
// bila <Bar> tak punya fill (kasus <Cell>). Keduanya wajib ditimpa.
export const TOOLTIP_PROPS = {
  contentStyle: {
    fontSize: 12,
    borderRadius: 4,
    boxShadow: 'none',
    border: '1px solid rgb(var(--bd-ink-200))',
    backgroundColor: 'rgb(var(--bg-white))',
    color: 'rgb(var(--fg-ink-900))',
  },
  itemStyle: { color: 'rgb(var(--fg-ink-900))' },
  cursor: { fill: 'rgb(var(--hairline) / 0.05)' },
};
