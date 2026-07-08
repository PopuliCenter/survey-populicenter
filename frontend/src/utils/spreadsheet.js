/**
 * spreadsheet.js — util ekspor/impor CSV & Excel (.xlsx).
 *
 * exceljs di-*dynamic import* agar tidak membebani bundle utama — hanya dimuat
 * saat pengguna benar-benar mengunduh template Excel atau memilih file .xlsx.
 */

async function getExcelJS() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Unduh file .xlsx dari header + baris (array of array). */
export async function downloadXlsx(filename, sheetName, headers, rows) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName || 'Sheet1');
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c) => { c.width = 24; });
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  );
}

/** Unduh objek sebagai file .json (rapi/indented). */
export function downloadJson(filename, obj) {
  saveBlob(
    new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8;' }),
    filename
  );
}

/** Unduh file .csv dari header + baris (array of array). */
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  saveBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), filename);
}

/**
 * Parse File (.csv atau .xlsx) menjadi array objek dengan kunci = header
 * (huruf kecil). Baris kosong dilewati.
 */
export async function parseSpreadsheet(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xlsx')) return parseXlsx(file);
  if (name.endsWith('.csv')) return parseCsvFile(file);
  throw new Error('Format tidak didukung. Gunakan file .csv atau .xlsx.');
}

async function parseXlsx(file) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) return [];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    headers.push(cell.value != null ? String(cell.value).trim().toLowerCase() : '');
  });
  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const obj = {};
    let has = false;
    headers.forEach((h, j) => {
      if (!h) return;
      const v = row.getCell(j + 1).value;
      const s = v == null ? '' : String(v).trim();
      obj[h] = s;
      if (s) has = true;
    });
    if (has) rows.push(obj);
  }
  return rows;
}

async function parseCsvFile(file) {
  const text = await file.text();
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
