#!/usr/bin/env node
/**
 * ios-permissions.cjs — tambal Info.plist dengan teks izin (usage descriptions).
 *
 *   npm run ios:permissions
 *
 * WAJIB dijalankan SEKALI setelah `npx cap add ios` (di macOS). Tanpa teks izin
 * ini, aplikasi CRASH saat meminta izin dan App Store MENOLAK submission.
 *
 * Idempoten: kunci yang sudah ada TIDAK ditimpa (aman dijalankan berulang).
 * Ditulis polos (tanpa dependensi) agar bisa jalan di mesin/CI mana pun.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PLIST = path.resolve(__dirname, '..', 'ios', 'App', 'App', 'Info.plist');

// Teks yang DILIHAT responden/TPD di dialog izin iOS — harus jelas & jujur,
// Apple menolak deskripsi yang generik/kosong.
const PERMISSIONS = {
  NSMicrophoneUsageDescription:
    'Aplikasi merekam audio wawancara untuk kendali mutu survei, hanya saat petugas menjalankan wawancara.',
  NSCameraUsageDescription:
    'Aplikasi menggunakan kamera untuk mengambil foto bukti wawancara.',
  NSLocationWhenInUseUsageDescription:
    'Aplikasi mencatat titik lokasi wawancara untuk verifikasi cakupan survei. Lokasi hanya diambil saat aplikasi digunakan.',
  NSPhotoLibraryAddUsageDescription:
    'Aplikasi menyimpan foto bukti wawancara ke galeri perangkat Anda.',
  NSPhotoLibraryUsageDescription:
    'Aplikasi memilih foto bukti wawancara dari galeri perangkat Anda.',
};

if (!fs.existsSync(PLIST)) {
  console.error('\n✗ Info.plist tidak ditemukan di: ' + PLIST);
  console.error('  Jalankan dulu di macOS:  npx cap add ios\n');
  process.exit(1);
}

let xml = fs.readFileSync(PLIST, 'utf8');
const added = [];
const skipped = [];

for (const [key, desc] of Object.entries(PERMISSIONS)) {
  if (xml.includes(`<key>${key}</key>`)) {
    skipped.push(key);
    continue;
  }
  // Sisipkan tepat sebelum </dict></plist> penutup (dict level teratas).
  const entry = `\t<key>${key}</key>\n\t<string>${desc}</string>\n`;
  const idx = xml.lastIndexOf('</dict>');
  if (idx === -1) {
    console.error('✗ Struktur Info.plist tidak dikenali (tak ada </dict>).');
    process.exit(1);
  }
  xml = xml.slice(0, idx) + entry + xml.slice(idx);
  added.push(key);
}

fs.writeFileSync(PLIST, xml);

console.log('\n─────────────────────────────────────────────');
console.log('  Izin iOS (Info.plist)');
console.log('─────────────────────────────────────────────');
added.forEach((k) => console.log(`  + ditambahkan : ${k}`));
skipped.forEach((k) => console.log(`  · sudah ada   : ${k}`));
console.log(`\n✅ Selesai. ${added.length} ditambahkan, ${skipped.length} dilewati.`);
console.log('   Buka Xcode → pastikan Signing & Capabilities sudah diisi.\n');
