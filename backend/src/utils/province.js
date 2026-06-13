'use strict';

/**
 * normalizeProvince — samakan ejaan province_name ke bentuk kanonik (huruf
 * besar, tanpa prefix administratif) agar target & data aktual bisa di-join.
 * Cerminan dari frontend (data/provinceCentroids.js).
 */
const ALIAS = {
  'DI YOGYAKARTA': 'YOGYAKARTA',
  'DAERAH ISTIMEWA YOGYAKARTA': 'YOGYAKARTA',
  'DKI JAKARTA': 'JAKARTA',
  'BANGKA BELITUNG': 'KEPULAUAN BANGKA BELITUNG',
  'KEP BANGKA BELITUNG': 'KEPULAUAN BANGKA BELITUNG',
  'KEP RIAU': 'KEPULAUAN RIAU',
  NTB: 'NUSA TENGGARA BARAT',
  NTT: 'NUSA TENGGARA TIMUR',
};

function normalizeProvince(name) {
  if (!name) return '';
  let s = String(name).toUpperCase().trim();
  s = s
    .replace(/^PROVINSI\s+/, '')
    .replace(/^PROV\.?\s+/, '')
    .replace(/^DAERAH ISTIMEWA\s+/, '')
    .replace(/^DAERAH KHUSUS IBUKOTA\s+/, '')
    .replace(/^DKI\s+/, '')
    .replace(/^D\.?\s*I\.?\s+/, '')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIAS[s] || s;
}

module.exports = { normalizeProvince };
