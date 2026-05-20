/**
 * build-wilayah-json.cjs
 *
 * Mengambil data CSV dari repo guzfirdaus/Wilayah-Administrasi-Indonesia,
 * mengkonversi semua nama ke UPPERCASE, lalu menghasilkan wilayahIndonesia.json
 * dengan format yang dibutuhkan aplikasi:
 *
 * {
 *   provinces: [{ id, name }],
 *   regenciesByProvince: { [province_id]: [{ id, name }] },
 *   districtsByRegency:  { [regency_id]:  [{ id, name }] },
 *   villagesByDistrict:  { [district_id]: [{ id, name }] }
 * }
 *
 * Semua id disimpan sebagai string untuk konsistensi.
 * Semua nama diubah ke UPPERCASE.
 *
 * Usage: node scripts/build-wilayah-json.cjs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/guzfirdaus/Wilayah-Administrasi-Indonesia/master/csv';

const FILES = {
  provinces: `${BASE_URL}/provinces.csv`,
  regencies: `${BASE_URL}/regencies.csv`,
  districts: `${BASE_URL}/districts.csv`,
  villages:  `${BASE_URL}/villages.csv`,
};

const OUTPUT_PATH = path.join(__dirname, '..', 'frontend', 'public', 'wilayahIndonesia.json');

// ─── HTTP fetch helper ────────────────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ─── CSV parser (semicolon-separated, handles quoted fields) ─────────────────
function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Split by semicolon, handle quoted values
    const values = [];
    let current = '';
    let inQuote = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ';' && !inQuote) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Mengambil data dari GitHub...');

  const [provincesText, regenciesText, districtsText, villagesText] = await Promise.all([
    fetchText(FILES.provinces),
    fetchText(FILES.regencies),
    fetchText(FILES.districts),
    fetchText(FILES.villages),
  ]);

  console.log('Parsing CSV...');

  const provincesRaw  = parseCsv(provincesText);
  const regenciesRaw  = parseCsv(regenciesText);
  const districtsRaw  = parseCsv(districtsText);
  const villagesRaw   = parseCsv(villagesText);

  console.log(`  Provinsi  : ${provincesRaw.length}`);
  console.log(`  Kab/Kota  : ${regenciesRaw.length}`);
  console.log(`  Kecamatan : ${districtsRaw.length}`);
  console.log(`  Desa/Kel  : ${villagesRaw.length}`);

  // ── Build provinces array ──────────────────────────────────────────────────
  const provinces = provincesRaw.map((r) => ({
    id:   String(r.id),
    name: r.name.toUpperCase(),
  }));

  // ── Build regenciesByProvince ──────────────────────────────────────────────
  const regenciesByProvince = {};
  for (const r of regenciesRaw) {
    const pid = String(r.province_id);
    if (!regenciesByProvince[pid]) regenciesByProvince[pid] = [];
    regenciesByProvince[pid].push({
      id:   String(r.id),
      name: r.name.toUpperCase(),
    });
  }

  // ── Build districtsByRegency ───────────────────────────────────────────────
  const districtsByRegency = {};
  for (const r of districtsRaw) {
    const rid = String(r.regency_id);
    if (!districtsByRegency[rid]) districtsByRegency[rid] = [];
    districtsByRegency[rid].push({
      id:   String(r.id),
      name: r.name.toUpperCase(),
    });
  }

  // ── Build villagesByDistrict ───────────────────────────────────────────────
  const villagesByDistrict = {};
  for (const r of villagesRaw) {
    const did = String(r.district_id);
    if (!villagesByDistrict[did]) villagesByDistrict[did] = [];
    villagesByDistrict[did].push({
      id:   String(r.id),
      name: r.name.toUpperCase(),
    });
  }

  const result = {
    provinces,
    regenciesByProvince,
    districtsByRegency,
    villagesByDistrict,
  };

  console.log('Menulis ke', OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result), 'utf8');

  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`Selesai! Ukuran file: ${fileSizeMB} MB`);
  console.log(`  Provinsi  : ${provinces.length}`);
  console.log(`  Kab/Kota  : ${Object.values(regenciesByProvince).flat().length}`);
  console.log(`  Kecamatan : ${Object.values(districtsByRegency).flat().length}`);
  console.log(`  Desa/Kel  : ${Object.values(villagesByDistrict).flat().length}`);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
