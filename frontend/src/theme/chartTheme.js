/**
 * chartTheme.js — warna & gaya grafik (Recharts/Leaflet), satu sumber dengan
 * palette.js. Grafik memakai satu warna + penekanan, bukan warna berbeda per
 * bagian; warna kategori hanya untuk grafik yang memang butuh membedakan seri.
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

export const AXIS_TICK = { fontSize: 12, fill: CHART.axis };
export const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 4, border: `1px solid ${ink[200]}`, boxShadow: 'none' };
