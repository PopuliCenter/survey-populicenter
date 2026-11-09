/**
 * Unit Tests — utils/push.js mode AKTIF: bentuk payload FCM.
 *
 * Yang dijaga: push memakai kanal pesan APK ('pesan-masuk', nada pesan_masuk)
 * — HARUS sama dengan PESAN_CHANNEL_ID/PESAN_SOUND di
 * frontend/src/utils/pushNotifications.js, kalau tidak pesan saat aplikasi
 * tertutup kembali senyap/tanpa banner. firebase-admin di-mock; tak ada jaringan.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockSend = jest.fn();
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({})),
  cert: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ sendEachForMulticast: mockSend })),
}));
jest.mock('../../src/models', () => ({
  FcmToken: { findAll: jest.fn(), destroy: jest.fn() },
}));

const { FcmToken } = require('../../src/models');

const FRONTEND = path.join(__dirname, '../../../frontend');
let keyDir;

beforeAll(() => {
  keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-test-'));
  const keyFile = path.join(keyDir, 'key.json');
  fs.writeFileSync(keyFile, '{}');
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH = keyFile;
});

afterAll(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  fs.rmSync(keyDir, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

test('payload Android: prioritas tinggi + kanal & nada pesan; data string-only', async () => {
  FcmToken.findAll.mockResolvedValue([{ token: 'tok-1' }]);
  mockSend.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{}] });
  const { sendPushToUser } = require('../../src/utils/push');

  const out = await sendPushToUser('tpd-1', { title: 'Halo', body: 'Isi', data: { type: 'manual', survey_id: '' } });

  expect(out).toEqual({ sent: 1, pruned: 0 });
  const msg = mockSend.mock.calls[0][0];
  expect(msg.tokens).toEqual(['tok-1']);
  expect(msg.notification).toEqual({ title: 'Halo', body: 'Isi' });
  expect(msg.android).toEqual({
    priority: 'high',
    notification: {
      channelId: 'pesan-masuk', sound: 'pesan_masuk', priority: 'high', defaultVibrateTimings: true,
    },
  });
  Object.values(msg.data).forEach((v) => expect(typeof v).toBe('string'));
});

// Kontrak lintas-paket: kanal yang dikirim server = kanal yang dibuat aplikasi,
// dan berkas nadanya ada + dijaga dari shrinkResources.
test('kanal & nada backend cocok dengan aplikasi dan resource Android', () => {
  const src = fs.readFileSync(path.join(FRONTEND, 'src/utils/pushNotifications.js'), 'utf8');
  expect(src).toMatch(/PESAN_CHANNEL_ID = 'pesan-masuk'/);
  expect(src).toMatch(/PESAN_SOUND = 'pesan_masuk\.wav'/);

  const raw = path.join(FRONTEND, 'android/app/src/main/res/raw');
  expect(fs.existsSync(path.join(raw, 'pesan_masuk.wav'))).toBe(true);
  expect(fs.readFileSync(path.join(raw, 'keep.xml'), 'utf8')).toMatch(/@raw\/pesan_masuk/);
});
