/**
 * Tes konsistensi tipografi & kontras (memindai kode sumber, bukan render).
 *
 * Aturan-aturan kecil seperti ini mudah rusak pelan-pelan: satu halaman baru
 * memakai `text-[11px]` atau `text-gray-400`, lalu menular. Tes ini menjaganya
 * agar tetap disengaja.
 *
 * Rujukan skala ada di tailwind.config.js.
 */

import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.jsx$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const FILES = walk(SRC);
const rel = (f) => path.relative(SRC, f).replace(/\\/g, '/');

function hits(pattern) {
  const found = [];
  for (const f of FILES) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (pattern.test(line)) found.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  return found;
}

describe('skala teks', () => {
  test('tidak ada ukuran font sembarang (pakai langkah skala bernama)', () => {
    // text-[10px] / text-[13px] dst. — sebelumnya ada 39 dan tersebar tanpa
    // aturan. Untuk teks meta kecil gunakan `text-2xs` (11px).
    expect(hits(/text-\[\d+(\.\d+)?px\]/)).toEqual([]);
  });

  test('tidak ada teks di bawah 11px (sulit dibaca, terlebih di HP)', () => {
    expect(hits(/text-\[(?:[0-9]|10)px\]/)).toEqual([]);
  });
});

describe('kontras warna teks (WCAG AA)', () => {
  test('text-gray-400 tidak dipakai — hanya 2,54:1 di atas putih (butuh 4,5:1)', () => {
    // Gunakan text-gray-500 (4,83:1) untuk teks sekunder. Masih jelas terlihat
    // lebih redup dari teks isi, tetapi tetap terbaca.
    expect(hits(/text-gray-400/)).toEqual([]);
  });

  test('text-gray-300 hanya boleh untuk elemen non-teks / latar gelap', () => {
    // 1,47:1 — tak layak untuk teks di latar terang. Yang tersisa harus berupa
    // ikon berukuran (w-* h-*), pemisah ber-aria-hidden, sel kosong, atau di
    // dalam panel gelap (bg-gray-900).
    const suspicious = hits(/text-gray-300/).filter((h) => (
      !/w-\d|h-\d/.test(h) &&           // ikon dengan ukuran
      !/aria-hidden/.test(h) &&          // pemisah dekoratif
      !/bg-gray-900/.test(h) &&          // di panel gelap
      !/isSelected/.test(h) &&           // sel tabel kosong
      !/·|\//.test(h)                    // karakter pemisah
    ));
    expect(suspicious).toEqual([]);
  });
});

describe('judul halaman dashboard', () => {
  test('memakai ukuran yang seragam (text-2xl)', () => {
    // Judul halaman yang lebih kecil dari halaman lain membuat aplikasi terasa
    // tidak dirancang. Dikecualikan: judul di DALAM kartu (SurveyBuilder
    // menampilkan judul survei; ServerConfig adalah lockup merek di layar
    // setup), bukan judul halaman.
    const KECUALI = ['pages/SurveyBuilder.jsx', 'pages/ServerConfig.jsx'];
    const pelanggaran = [];
    for (const f of FILES.filter((x) => rel(x).startsWith('pages/'))) {
      if (KECUALI.includes(rel(f))) continue;
      const src = fs.readFileSync(f, 'utf8');
      const m = src.match(/<h1[^>]*className="([^"]*)"/);
      if (m && !/text-2xl/.test(m[1])) pelanggaran.push(`${rel(f)}  →  ${m[1]}`);
    }
    expect(pelanggaran).toEqual([]);
  });
});

describe('bobot judul bagian', () => {
  test('h3 memakai font-semibold — bukan medium (setara label) atau bold (setara h1)', () => {
    // Sebelumnya h3 ditulis 4 gaya berbeda: semibold (11), medium (7), bold (1),
    // dan lg/bold (4). Yang lg/bold SENGAJA dikecualikan: itu judul modal/dialog,
    // di mana h3 adalah judul tertinggi pada permukaan tersebut.
    const pelanggaran = [];
    for (const f of FILES) {
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const m = line.match(/<h3[^>]*className="([^"]*)"/);
        if (!m) return;
        const cls = m[1];
        if (/text-lg/.test(cls)) return; // judul modal
        if (!/font-semibold/.test(cls)) {
          pelanggaran.push(`${rel(f)}:${i + 1}  ${cls}`);
        }
      });
    }
    expect(pelanggaran).toEqual([]);
  });

  test('judul bagian tidak ditulis sebagai <p> (pembaca layar tak bisa melompatinya)', () => {
    // Panel pengaturan di SurveyBuilder dulu memakai <p> untuk judul bagian.
    const JUDUL = ['Pengaturan Field Tools', 'Periode Pengisian Survei', 'Mode Tampilan Formulir TPD'];
    const pelanggaran = [];
    for (const f of FILES) {
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (/<p[^>]*>/.test(line) && JUDUL.some((t) => line.includes(`>${t}<`))) {
          pelanggaran.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 70)}`);
        }
      });
    }
    expect(pelanggaran).toEqual([]);
  });
});

describe('emoji sebagai elemen UI', () => {
  test('tidak ada emoji berwarna di JSX (pakai components/Icon.jsx)', () => {
    // Emoji dirender font sistem: ukuran/warnanya berbeda antar perangkat dan
    // tak mengikuti warna tema. ★ untuk widget rating dikecualikan.
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2600}-\u{26FF}]/u;
    const found = [];
    for (const f of FILES) {
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (EMOJI.test(line) && !line.includes('★') && !line.trimStart().startsWith('//')) {
          found.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});
