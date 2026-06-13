/**
 * Titik tengah (centroid) perkiraan tiap provinsi Indonesia untuk peta sebaran
 * berbentuk proporsional-simbol (lingkaran sebesar jumlah responden).
 *
 * Kunci sudah dinormalisasi (huruf besar, tanpa prefix administratif) agar
 * cocok dengan berbagai variasi penulisan province_name dari data wilayah.
 */
const PROVINCE_CENTROIDS = {
  ACEH: { lat: 4.7, lng: 96.7 },
  'SUMATERA UTARA': { lat: 2.5, lng: 99.0 },
  'SUMATERA BARAT': { lat: -0.7, lng: 100.6 },
  RIAU: { lat: 0.5, lng: 101.8 },
  JAMBI: { lat: -1.6, lng: 103.0 },
  'SUMATERA SELATAN': { lat: -3.3, lng: 104.0 },
  BENGKULU: { lat: -3.5, lng: 102.3 },
  LAMPUNG: { lat: -4.9, lng: 105.2 },
  'KEPULAUAN BANGKA BELITUNG': { lat: -2.7, lng: 106.5 },
  'KEPULAUAN RIAU': { lat: 1.1, lng: 104.4 },
  JAKARTA: { lat: -6.2, lng: 106.8 },
  'JAWA BARAT': { lat: -6.9, lng: 107.6 },
  'JAWA TENGAH': { lat: -7.3, lng: 110.0 },
  YOGYAKARTA: { lat: -7.8, lng: 110.4 },
  'JAWA TIMUR': { lat: -7.8, lng: 112.5 },
  BANTEN: { lat: -6.4, lng: 106.1 },
  BALI: { lat: -8.4, lng: 115.1 },
  'NUSA TENGGARA BARAT': { lat: -8.7, lng: 117.4 },
  'NUSA TENGGARA TIMUR': { lat: -8.7, lng: 121.1 },
  'KALIMANTAN BARAT': { lat: -0.2, lng: 111.5 },
  'KALIMANTAN TENGAH': { lat: -1.7, lng: 113.4 },
  'KALIMANTAN SELATAN': { lat: -3.1, lng: 115.3 },
  'KALIMANTAN TIMUR': { lat: 0.5, lng: 116.4 },
  'KALIMANTAN UTARA': { lat: 3.1, lng: 116.0 },
  'SULAWESI UTARA': { lat: 1.0, lng: 124.5 },
  'SULAWESI TENGAH': { lat: -1.4, lng: 121.4 },
  'SULAWESI SELATAN': { lat: -3.7, lng: 119.9 },
  'SULAWESI TENGGARA': { lat: -4.1, lng: 122.2 },
  GORONTALO: { lat: 0.7, lng: 122.4 },
  'SULAWESI BARAT': { lat: -2.8, lng: 119.2 },
  MALUKU: { lat: -3.2, lng: 129.0 },
  'MALUKU UTARA': { lat: 0.6, lng: 127.8 },
  PAPUA: { lat: -4.3, lng: 138.1 },
  'PAPUA BARAT': { lat: -1.3, lng: 133.2 },
  'PAPUA SELATAN': { lat: -6.9, lng: 140.0 },
  'PAPUA TENGAH': { lat: -3.9, lng: 136.5 },
  'PAPUA PEGUNUNGAN': { lat: -4.1, lng: 138.8 },
  'PAPUA BARAT DAYA': { lat: -0.9, lng: 131.3 },
};

/**
 * normalizeProvince — samakan ejaan province_name ke kunci tabel centroid.
 * Menangani variasi seperti "DKI Jakarta", "D.I. Yogyakarta", "Prov. Bali".
 */
export function normalizeProvince(name) {
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
  // Alias umum
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
  return ALIAS[s] || s;
}

/**
 * lookupCentroid — kembalikan {lat,lng} untuk sebuah province_name, atau null.
 */
export function lookupCentroid(name) {
  return PROVINCE_CENTROIDS[normalizeProvince(name)] || null;
}

export default PROVINCE_CENTROIDS;
