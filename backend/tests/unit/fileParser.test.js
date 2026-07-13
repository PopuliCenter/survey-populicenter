const ExcelJS = require('exceljs');
const { parseUploadFile } = require('../../src/utils/fileParser');

async function buildXlsx(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const COLS = ['nama', 'email', 'password'];

describe('parseUploadFile — routing berdasar ekstensi', () => {
  it('mem-parse .xlsx walau mimetype keliru "application/vnd.ms-excel" (kasus Windows)', async () => {
    const buf = await buildXlsx(COLS, [['John Doe', 'john@example.com', 'Password123']]);
    const { rows, errors } = await parseUploadFile(buf, 'application/vnd.ms-excel', COLS, 'data.xlsx');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ nama: 'John Doe', email: 'john@example.com', password: 'Password123' });
  });

  it('mem-parse .xlsx walau mimetype "application/octet-stream"', async () => {
    const buf = await buildXlsx(COLS, [['A', 'a@x.com', 'Passw0rd']]);
    const { rows, errors } = await parseUploadFile(buf, 'application/octet-stream', COLS, 'upload tpd.xlsx');
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('mem-parse CSV normal', async () => {
    const csv = Buffer.from('nama,email,password\nJane,jane@x.com,Pass1234', 'utf-8');
    const { rows, errors } = await parseUploadFile(csv, 'text/csv', COLS, 'tpd.csv');
    expect(errors).toHaveLength(0);
    expect(rows[0].nama).toBe('Jane');
  });

  it('cadangan mimetype dipakai bila nama file kosong', async () => {
    const buf = await buildXlsx(COLS, [['B', 'b@x.com', 'Passw0rd']]);
    const { rows, errors } = await parseUploadFile(
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      COLS,
      ''
    );
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it('mem-parse sel rich text & hyperlink (email autolink Excel) tanpa "[object Object]"', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(COLS);
    const r = ws.addRow([]);
    r.getCell(1).value = { richText: [{ text: 'John ' }, { text: 'Doe' }] };
    r.getCell(2).value = { text: 'john@example.com', hyperlink: 'mailto:john@example.com' };
    r.getCell(3).value = 'Password123';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows, errors } = await parseUploadFile(buf, 'application/vnd.ms-excel', COLS, 'tpd.xlsx');
    expect(errors).toHaveLength(0);
    expect(rows[0]).toEqual({ nama: 'John Doe', email: 'john@example.com', password: 'Password123' });
  });

  it('menolak format lain', async () => {
    const { rows, errors } = await parseUploadFile(Buffer.from('x'), 'application/pdf', COLS, 'file.pdf');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/tidak didukung/i);
  });
});
