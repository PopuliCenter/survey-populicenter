/**
 * Unit Tests — scripts/media-mirror.cjs (alat backup & restore bucket media)
 *
 * Backup yang diam-diam tak lengkap sama berbahayanya dengan tak ada backup,
 * jadi yang dikunci di sini: kegagalan parsial wajib terlaporkan, dan key bucket
 * tak boleh menulis ke luar folder tujuan.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { pull, push, targetPath } = require('../../scripts/media-mirror.cjs');

/** Client MinIO tiruan yang menyimpan objek di memori. */
function fakeClient(objects = {}, { hasBucket = true, truncate = [], failGet = [], failPut = [] } = {}) {
  const store = { ...objects };
  return {
    store,
    put: [],
    made: [],
    bucketExists: async () => hasBucket,
    makeBucket: async function (b) { this.made.push(b); },
    listObjects: () => {
      const em = new EventEmitter();
      setImmediate(() => {
        for (const [name, body] of Object.entries(store)) em.emit('data', { name, size: body.length });
        em.emit('end');
      });
      return em;
    },
    fGetObject: async (bucket, key, file) => {
      if (failGet.includes(key)) throw new Error('koneksi putus');
      fs.writeFileSync(file, truncate.includes(key) ? store[key].slice(0, 1) : store[key]);
    },
    fPutObject: async function (bucket, key, file, meta) {
      if (failPut.includes(key)) throw new Error('koneksi putus');
      this.put.push({ key, meta, body: fs.readFileSync(file, 'utf8') });
    },
  };
}

describe('media-mirror', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-mirror-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  describe('targetPath', () => {
    it('memetakan key ke dalam folder tujuan', () => {
      expect(targetPath(dir, 'uploads/audio/a.webm')).toBe(path.join(dir, 'uploads', 'audio', 'a.webm'));
    });

    it.each(['../luar.txt', 'uploads/../../luar.txt'])('menolak key yang keluar folder: %s', (key) => {
      expect(() => targetPath(dir, key)).toThrow('di luar folder tujuan');
    });
  });

  describe('pull', () => {
    it('menyalin semua objek bertingkat dan melewati penanda folder', async () => {
      const client = fakeClient({
        'uploads/photos/a.jpg': 'foto',
        'uploads/audio/b.webm': 'rekaman',
        'uploads/kosong/': '',
      });
      const r = await pull(client, 'b', dir);
      expect(r).toEqual({ total: 2, copied: 2, bytes: 11, failed: 0 });
      expect(fs.readFileSync(path.join(dir, 'uploads', 'audio', 'b.webm'), 'utf8')).toBe('rekaman');
    });

    it('melaporkan objek gagal unduh tanpa berhenti pada objek lain', async () => {
      const client = fakeClient({ 'uploads/a.jpg': 'aa', 'uploads/b.jpg': 'bb' }, { failGet: ['uploads/a.jpg'] });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const r = await pull(client, 'b', dir);
      expect(r).toMatchObject({ total: 2, copied: 1, failed: 1 });
      expect(fs.existsSync(path.join(dir, 'uploads', 'b.jpg'))).toBe(true);
      console.error.mockRestore();
    });

    it('menganggap gagal bila ukuran berkas tak cocok dengan daftar bucket', async () => {
      const client = fakeClient({ 'uploads/a.jpg': 'isi-penuh' }, { truncate: ['uploads/a.jpg'] });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const r = await pull(client, 'b', dir);
      expect(r).toMatchObject({ copied: 0, failed: 1 });
      console.error.mockRestore();
    });

    it('menghitung key berbahaya sebagai gagal, bukan menulisnya ke luar folder', async () => {
      const client = fakeClient({ '../luar.txt': 'x' });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const r = await pull(client, 'b', dir);
      expect(r).toMatchObject({ copied: 0, failed: 1 });
      expect(fs.existsSync(path.join(dir, '..', 'luar.txt'))).toBe(false);
      console.error.mockRestore();
    });

    it('gagal keras bila bucket tidak ada', async () => {
      await expect(pull(fakeClient({}, { hasBucket: false }), 'b', dir)).rejects.toThrow('tidak ada');
    });

    it('bucket kosong bukan kegagalan', async () => {
      await expect(pull(fakeClient(), 'b', dir)).resolves.toEqual({ total: 0, copied: 0, bytes: 0, failed: 0 });
    });
  });

  describe('push', () => {
    beforeEach(() => {
      fs.mkdirSync(path.join(dir, 'uploads', 'audio'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'uploads', 'audio', 'b.webm'), 'rekaman');
      fs.writeFileSync(path.join(dir, 'uploads', 'lain.bin'), 'x');
    });

    it('memakai jalur relatif sebagai key dan menyetel Content-Type', async () => {
      const client = fakeClient();
      const r = await push(client, 'b', dir);
      expect(r).toMatchObject({ total: 2, copied: 2, failed: 0 });
      const audio = client.put.find((p) => p.key === 'uploads/audio/b.webm');
      expect(audio.meta['Content-Type']).toBe('audio/webm');
      expect(audio.body).toBe('rekaman');
      const lain = client.put.find((p) => p.key === 'uploads/lain.bin');
      expect(lain.meta['Content-Type']).toBe('application/octet-stream');
    });

    it('menolak bila jumlah berkas tak sesuai harapan, tanpa mengunggah apa pun', async () => {
      const client = fakeClient({}, { hasBucket: false });
      await expect(push(client, 'b', dir, 66)).rejects.toThrow('diharapkan 66');
      expect(client.put).toEqual([]);
      expect(client.made).toEqual([]);
    });

    it('lanjut bila jumlah berkas sesuai harapan', async () => {
      await expect(push(fakeClient(), 'b', dir, 2)).resolves.toMatchObject({ copied: 2, failed: 0 });
    });

    it('membuat bucket bila belum ada (pemulihan di server baru)', async () => {
      const client = fakeClient({}, { hasBucket: false });
      await push(client, 'b', dir);
      expect(client.made).toEqual(['b']);
    });

    it('melaporkan berkas yang gagal diunggah', async () => {
      const client = fakeClient({}, { failPut: ['uploads/lain.bin'] });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const r = await push(client, 'b', dir);
      expect(r).toMatchObject({ total: 2, copied: 1, failed: 1 });
      console.error.mockRestore();
    });
  });
});
