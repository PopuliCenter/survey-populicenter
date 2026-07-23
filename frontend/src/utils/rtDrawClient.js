/**
 * rtDrawClient.js — undian RT di PERANGKAT (mode offline) + grid Form A utk UI.
 *
 * REPLIKA DIGITAL FORM A (metodologi resmi Populi, FORM A - SURNAS.xlsx):
 * grid 10x10 berisi angka 1–100 (persis rumus Excel `=INT(RAND()*100)+1`),
 * discan dari baris 1 kolom 1 ke kanan lalu turun; angka <= jumlah RT
 * terpilih; duplikat dilewati. Bila 100 sel belum cukup, deret dilanjutkan
 * (setara mengambil lembar berikutnya).
 *
 * WAJIB identik bit-per-bit dengan backend/src/utils/rtDraw.js (v2):
 * SHA-256(seed) → 4 byte pertama (big-endian) → mulberry32 → INT(rand*100)+1.
 * Kesamaan dijaga tes vektor yang DIBANGKITKAN dari backend — jangan mengubah
 * salah satu sisi tanpa meregenerasi vektornya.
 *
 * Grid + posisi sel terpilih (picks) juga dipakai UI untuk MENAMPILKAN
 * kotak-kotak angka acak seperti lembar kertasnya — TPD/SPV bisa mencocokkan
 * hasil dengan mata, bukan sekadar percaya.
 */

const MAX_RT = 100; // Form A memakai angka 1-100
export const GRID_COLS = 10;
export const GRID_ROWS = 10;

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
    throw new Error('Perangkat tidak mendukung perhitungan undian offline.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(seed)));
  return new DataView(digest).getUint32(0, false); // big-endian, sama dgn readUInt32BE
}

/**
 * Grid angka acak ala Form A — deterministik dari seed.
 * @param {string} seed
 * @param {number} cells
 * @returns {Promise<number[]>}
 */
export async function generateFormAGridClient(seed, cells = GRID_ROWS * GRID_COLS) {
  const rand = mulberry32(await seedToUint32(seed));
  const out = new Array(cells);
  for (let i = 0; i < cells; i++) out[i] = Math.floor(rand() * 100) + 1;
  return out;
}

/**
 * Undian Form A lengkap — padanan drawRtFormA() backend.
 * @param {{ seed: string, totalRt: number, count: number }} params
 * @returns {Promise<{ selected: number[], picks: Array<{cell:number,value:number}>, gridCells: number }>}
 */
export async function drawRtFormAClient({ seed, totalRt, count }) {
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

  const selected = [];
  const picks = [];
  const seen = new Set();
  let cells = GRID_ROWS * GRID_COLS;
  let grid = await generateFormAGridClient(seed, cells);
  let i = 0;
  while (selected.length < count) {
    if (i >= grid.length) {
      cells += GRID_COLS;
      grid = await generateFormAGridClient(seed, cells);
    }
    const value = grid[i];
    if (value <= totalRt && !seen.has(value)) {
      seen.add(value);
      selected.push(value);
      picks.push({ cell: i, value });
    }
    i += 1;
  }
  return { selected, picks, gridCells: cells };
}

/**
 * Undi `count` nomor RT — dipakai jalur offline. Urutan sesuai ditemukan.
 * @param {{ seed: string, totalRt: number, count: number }} params
 * @returns {Promise<number[]>}
 */
export async function drawRtClient(params) {
  return (await drawRtFormAClient(params)).selected;
}
