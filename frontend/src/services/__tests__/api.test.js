/**
 * Unit Tests — services/api.js (klien axios bersama)
 *
 * Fokus: REGRESI UNGGAHAN BERKAS.
 * Instance ini memasang default `Content-Type: application/json`. Bila tipe itu
 * dibiarkan saat payload berupa FormData, axios v1 MENGUBAH FormData menjadi
 * JSON (formDataToJSON) — berkas tak pernah terkirim sebagai multipart dan
 * server membalas "file wajib diunggah". Bug ini nyata terjadi pada halaman
 * Random Sampling. Tes ini mengunci perilaku yang benar.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import api from '../api';

const originalAdapter = api.defaults.adapter;
let captured;

function captureAdapter(config) {
  captured = config;
  return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
}

function headerOf(config, name) {
  const h = config.headers;
  if (!h) return undefined;
  return typeof h.get === 'function' ? h.get(name) : h[name];
}

beforeEach(() => {
  captured = undefined;
  api.defaults.adapter = captureAdapter;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe('api — payload FormData', () => {
  test('FormData tetap FormData (TIDAK diubah jadi JSON) saat dikirim', async () => {
    const fd = new FormData();
    fd.append('mfd', new Blob(['xlsx-bytes']), 'mfd.xlsx');
    fd.append('config', JSON.stringify({ scope: 'NASIONAL' }));

    await api.post('/sampling/inspect', fd);

    // Inti regresi: bila Content-Type JSON lolos, ini akan berupa string JSON.
    expect(captured.data).toBeInstanceOf(FormData);
    expect(captured.data.get('config')).toBe(JSON.stringify({ scope: 'NASIONAL' }));
  });

  // Catatan: yang menentukan bukan nilai akhir header di sini, melainkan payload
  // tetap FormData. Adapter XHR axios memanggil setContentType(undefined) untuk
  // FormData di browser, sehingga boundary multipart diisi browser. Yang fatal
  // hanyalah Content-Type application/json, karena transformRequest berjalan
  // LEBIH DULU dan mengubah FormData jadi string JSON.
  test('Content-Type application/json tidak ikut terbawa pada unggahan', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'a.xlsx');

    await api.post('/surveyors/bulk-upload', fd);

    expect(String(headerOf(captured, 'Content-Type'))).not.toMatch(/application\/json/);
    expect(captured.data).toBeInstanceOf(FormData);
  });

  test('pemanggil yang menyetel multipart/form-data sendiri tetap aman', async () => {
    const fd = new FormData();
    fd.append('photo', new Blob(['x']), 'p.jpg');

    await api.post('/upload/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

    expect(String(headerOf(captured, 'Content-Type'))).not.toMatch(/application\/json/);
    expect(captured.data).toBeInstanceOf(FormData);
  });
});

describe('api — payload biasa tidak terpengaruh', () => {
  test('POST objek biasa tetap dikirim sebagai application/json', async () => {
    await api.post('/auth/login', { email: 'a@b.c', password: 'x' });

    expect(String(headerOf(captured, 'Content-Type'))).toMatch(/application\/json/);
    expect(typeof captured.data).toBe('string');
    expect(JSON.parse(captured.data).email).toBe('a@b.c');
  });
});
