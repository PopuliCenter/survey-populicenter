/**
 * rtDrawClient.js — undian RT di PERANGKAT untuk mode offline.
 *
 * WAJIB identik bit-per-bit dengan backend/src/utils/rtDraw.js:
 * SHA-256(seed) → 4 byte pertama (big-endian) → mulberry32 → Fisher-Yates
 * parsial → urut menaik. Seed berasal dari TIKET yang dijatah server di muka,
 * sehingga saat sinkron server bisa MENGHITUNG ULANG dan membuktikan hasil
 * offline tidak dimanipulasi.
 *
 * Kesamaan dijaga tes vektor di __tests__/rtDrawClient.test.js — vektornya
 * dibangkitkan langsung dari implementasi backend. JANGAN mengubah salah satu
 * sisi tanpa memperbarui keduanya + vektornya.
 */

const MAX_RT = 100000;

function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedToUint32(seed) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // WebView/browser modern selalu punya WebCrypto pada origin aman
    // (https://localhost di APK). Kalau sampai tidak ada, lebih baik gagal
    // eksplisit daripada mengundi dengan cara yang tak bisa diverifikasi server.
    throw new Error('Perangkat tidak mendukung perhitungan undian offline.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(seed)));
  return new DataView(digest).getUint32(0, false); // big-endian, sama dgn readUInt32BE
}

/**
 * Undi `count` nomor RT berbeda dari 1..totalRt — padanan drawRt() backend.
 * @param {{ seed: string, totalRt: number, count: number }} params
 * @returns {Promise<number[]>} nomor urut RT terpilih, terurut menaik
 */
export async function drawRtClient({ seed, totalRt, count }) {
  if (!Number.isInteger(totalRt) || totalRt < 1 || totalRt > MAX_RT) {
    throw new Error(`Jumlah RT harus bilangan bulat 1–${MAX_RT}`);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Jumlah RT yang dipilih harus bilangan bulat minimal 1');
  }
  if (count > totalRt) {
    throw new Error(`Tidak bisa memilih ${count} RT dari total ${totalRt} RT`);
  }
  if (!seed) throw new Error('Seed undian wajib ada');

  const rand = mulberry32(await seedToUint32(seed));
  const pool = Array.from({ length: totalRt }, (_, i) => i + 1);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (totalRt - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
