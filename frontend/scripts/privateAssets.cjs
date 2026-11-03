'use strict';
/**
 * Berkas kerja yang kebetulan ada di public/ (laporan, tema PPTX, dump SQL). Vite menyalin
 * isi public/ apa adanya ke dist. .dockerignore hanya melindungi image web, sedangkan jalur
 * APK (`vite build && cap sync`) tidak melewatinya, sehingga laporan sempat terbawa ke APK.
 * Dipakai vite.config.js (buang dari dist) dan release-android.cjs (gagalkan rilis).
 * Polanya harus mencakup .dockerignore (dijaga nightModeGuards.test.js).
 */
const fs = require('fs');
const path = require('path');

const PRIVATE_ASSET = /\.(pdf|pptx?|thmx|docx?|xlsx|sql)$/i;

function findPrivateAssets(dir) {
  const found = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...findPrivateAssets(full));
    else if (PRIVATE_ASSET.test(e.name)) found.push(full);
  }
  return found;
}

module.exports = { PRIVATE_ASSET, findPrivateAssets };
