'use strict';

/**
 * diskUsage.js — hitung ukuran folder secara rekursif & ASYNC agar tidak
 * memblokir event loop pada folder besar (mis. uploads/ dengan puluhan ribu
 * file). Aman-gagal: folder/entri yang tak terbaca dilewati (dihitung 0),
 * tidak melempar.
 */

const fsp = require('fs').promises;
const path = require('path');

/**
 * Total byte semua file di dalam `dir` (rekursif).
 * @param {string} dir
 * @returns {Promise<number>}
 */
async function dirSizeBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // folder tak ada / tak terbaca
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await dirSizeBytes(full);
    } else if (e.isFile()) {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        /* file lenyap di tengah walk — abaikan */
      }
    }
    // symlink & tipe lain sengaja dilewati (hindari loop & keluar dari pohon)
  }
  return total;
}

module.exports = { dirSizeBytes };
