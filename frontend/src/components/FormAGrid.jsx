import React from 'react';
import { drawRtFormAClient, generateFormAGridClient, GRID_COLS } from '../utils/rtDrawClient';

/**
 * Grid angka acak ala FORM A — "kotak-kotak" yang sama dengan lembar kertasnya,
 * dihitung ulang dari seed sehingga TPD/SPV/admin bisa MENCOCOKKAN hasil dengan
 * mata: scan baris 1 kolom 1 ke kanan, angka <= jumlah RT terpilih (disorot
 * hijau dengan urutan pilihannya), sisanya redup.
 *
 * Dipakai di dua tempat: layar TPD (hasil undian) dan dashboard Pengawasan
 * Pemilihan RT (verifikasi visual oleh admin/SPV/asisten).
 */
export default function FormAGrid({ grid, picks, totalRt }) {
  if (!grid || grid.length === 0) return null;
  const pickByCell = new Map(picks.map((p, i) => [p.cell, i + 1]));
  const rows = [];
  for (let r = 0; r < grid.length / GRID_COLS; r++) {
    rows.push(grid.slice(r * GRID_COLS, (r + 1) * GRID_COLS));
  }
  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold text-gray-700 mb-1">Lembar Angka Acak (Form A digital)</p>
      <table className="border-collapse tabular-nums">
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              <td className="pr-2 text-2xs text-gray-500 text-right select-none">{r + 1}</td>
              {cells.map((v, c) => {
                const cellIdx = r * GRID_COLS + c;
                const pickNo = pickByCell.get(cellIdx);
                const lolos = v <= totalRt;
                return (
                  <td
                    key={c}
                    className={`w-8 h-8 text-center text-xs border ${
                      pickNo
                        ? 'border-green-500 border-2 bg-green-100 text-green-900 font-bold relative'
                        : lolos
                          ? 'border-gray-200 text-gray-700'
                          : 'border-gray-100 text-gray-300'
                    }`}
                  >
                    {v}
                    {pickNo && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-green-600 text-white text-2xs leading-[0.875rem] font-bold">
                        {pickNo}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-2xs text-gray-500 mt-1">
        Scan dari baris 1 kolom 1 ke kanan. Angka ≤ jumlah RT ({totalRt}) terpilih —
        kotak hijau bernomor = pilihan ke-1, ke-2, dst. Angka redup dilewati.
        {rows.length > 10 && ' Baris tambahan = lanjutan lembar (angka lolos belum cukup di 10 baris pertama).'}
      </p>
    </div>
  );
}

/**
 * Hitung bahan FormAGrid dari sebuah baris undian tersimpan (seed + total_rt).
 * Mengembalikan null untuk baris lama v1 (bukan Form A — tidak punya grid).
 *
 * @param {{ seed: string, total_rt: number|string, selected?: number[], algo_version?: number }} sel
 * @returns {Promise<{ grid: number[], picks: {cell:number,value:number}[], totalRt: number } | null>}
 */
export async function computeFormAGridView(sel) {
  if (!sel?.seed || !sel?.total_rt || (sel.algo_version && sel.algo_version < 2)) return null;
  const totalRt = Number(sel.total_rt);
  const r = await drawRtFormAClient({
    seed: sel.seed,
    totalRt,
    count: (sel.selected || []).length || 1,
  });
  const grid = await generateFormAGridClient(sel.seed, r.gridCells);
  return { grid, picks: r.picks, totalRt };
}
