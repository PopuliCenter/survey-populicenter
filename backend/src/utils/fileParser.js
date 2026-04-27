const ExcelJS = require('exceljs');

/**
 * Parse file CSV atau Excel dan kembalikan array of objects.
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - MIME type file
 * @param {string[]} expectedColumns - Kolom yang diharapkan
 * @returns {Promise<{ rows: object[], errors: string[] }>}
 */
async function parseUploadFile(buffer, mimetype, expectedColumns) {
  if (mimetype === 'text/csv' || mimetype === 'application/vnd.ms-excel') {
    return parseCSV(buffer, expectedColumns);
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return parseExcel(buffer, expectedColumns);
  }

  return {
    rows: [],
    errors: ['Format file tidak didukung. Gunakan file CSV (.csv) atau Excel (.xlsx)'],
  };
}

/**
 * Parse CSV buffer into rows.
 * @param {Buffer} buffer
 * @param {string[]} expectedColumns
 * @returns {{ rows: object[], errors: string[] }}
 */
function parseCSV(buffer, expectedColumns) {
  const content = buffer.toString('utf-8').trim();

  if (!content) {
    return { rows: [], errors: ['File kosong'] };
  }

  const lines = content.split(/\r?\n/);

  if (lines.length === 0) {
    return { rows: [], errors: ['File kosong'] };
  }

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  const headerError = validateHeaders(headers, expectedColumns);
  if (headerError) {
    return { rows: [], errors: [headerError] };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty lines

    const values = line.split(',').map((v) => v.trim());
    const row = {};
    for (let j = 0; j < expectedColumns.length; j++) {
      row[expectedColumns[j]] = values[j] !== undefined ? values[j] : '';
    }
    rows.push(row);
  }

  return { rows, errors };
}

/**
 * Parse Excel (.xlsx) buffer into rows.
 * @param {Buffer} buffer
 * @param {string[]} expectedColumns
 * @returns {Promise<{ rows: object[], errors: string[] }>}
 */
async function parseExcel(buffer, expectedColumns) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];

  if (!worksheet || worksheet.rowCount === 0) {
    return { rows: [], errors: ['File kosong'] };
  }

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const value = cell.value != null ? String(cell.value).trim().toLowerCase() : '';
    headers.push(value);
  });

  // Filter out trailing empty headers
  while (headers.length > 0 && headers[headers.length - 1] === '') {
    headers.pop();
  }

  if (headers.length === 0) {
    return { rows: [], errors: ['File kosong'] };
  }

  const headerError = validateHeaders(headers, expectedColumns);
  if (headerError) {
    return { rows: [], errors: [headerError] };
  }

  const rows = [];

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const values = [];
    let hasValue = false;

    for (let j = 1; j <= expectedColumns.length; j++) {
      const cell = row.getCell(j);
      const value = cell.value != null ? String(cell.value).trim() : '';
      values.push(value);
      if (value) hasValue = true;
    }

    if (!hasValue) continue; // skip empty rows

    const obj = {};
    for (let j = 0; j < expectedColumns.length; j++) {
      obj[expectedColumns[j]] = values[j];
    }
    rows.push(obj);
  }

  return { rows, errors: [] };
}

/**
 * Validate that headers match expected columns.
 * @param {string[]} headers - Parsed headers (lowercased, trimmed)
 * @param {string[]} expectedColumns - Expected column names
 * @returns {string|null} Error message or null if valid
 */
function validateHeaders(headers, expectedColumns) {
  const expected = expectedColumns.map((c) => c.toLowerCase());

  if (headers.length < expected.length) {
    return `Header file tidak sesuai. Kolom yang diharapkan: ${expectedColumns.join(', ')}`;
  }

  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      return `Header file tidak sesuai. Kolom yang diharapkan: ${expectedColumns.join(', ')}`;
    }
  }

  return null;
}

module.exports = {
  parseUploadFile,
};
