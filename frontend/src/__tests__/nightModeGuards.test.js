/**
 * Guard sumber untuk jebakan night mode yang tak terdeteksi build maupun render jsdom.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const FE = path.resolve(SRC, '..');
const read = (p) => fs.readFileSync(path.resolve(SRC, p), 'utf8');

describe('data tersimpan tidak bergantung tema', () => {
  test('tinta tanda tangan terkunci #000, tanpa isian & tanpa pembacaan tema', () => {
    const src = read('surveyor/hooks/useSignaturePad.js');
    expect(new Set(src.match(/strokeStyle = '[^']+'/g))).toEqual(new Set(["strokeStyle = '#000'"]));
    expect(src).not.toMatch(/fillRect|fillStyle|getComputedStyle|matchMedia|classList|var\(--/);
  });

  test('kompres foto tidak membaca tema & tidak menggambar warna', () => {
    expect(read('utils/imageCompressor.js')).not.toMatch(/fillStyle|fillText|strokeStyle|getComputedStyle|matchMedia|classList|var\(--/);
  });
});

describe('elemen yang wajib tetap putih / gelap', () => {
  test('kanvas & penampil tanda tangan berlatar paper', () => {
    expect(read('surveyor/components/SignaturePadCanvas.jsx')).toMatch(/rounded-lg bg-paper/);
    expect(read('pages/ResponseDetail.jsx')).toMatch(/bg-paper[^\n]*\n\s*<img src=\{mediaUrl\(response\.signature_path\)\}/);
  });

  test('knob sakelar & titik radio tidak memakai bg-white', () => {
    expect(read('pages/SurveyBuilder.jsx')).not.toMatch(/rounded-full bg-white shadow/);
    expect(read('surveyor/pages/SurveyForm.jsx')).not.toMatch(/w-2 h-2 rounded-full bg-white/);
  });

  test('overlay memakai bg-black, bukan bg-gray-900/NN', () => {
    for (const f of ['components/Layout.jsx', 'surveyor/components/PermissionOnboarding.jsx']) {
      expect(read(f)).not.toMatch(/bg-gray-900\/\d+/);
    }
  });
});

describe('isian otomatis browser', () => {
  test('tertutup warna permukaan saat gelap, dan cincin fokus tetap ada', () => {
    const css = read('index.css');
    expect(css).toMatch(/html\.dark input:-webkit-autofill/);
    expect(css).toMatch(/box-shadow: inset 0 0 0 1000px rgb\(var\(--bg-white\)\), var\(--tw-ring-offset-shadow/);
  });
});

describe('logo di panel brand Login', () => {
  test('memakai masker putih dan tetap punya nama aksesibel', () => {
    expect(read('pages/Login.jsx')).toMatch(/role="img" aria-label="Populi Center" className="[^"]*bg-paper/);
  });
});

describe('halaman publik selalu terang', () => {
  test('src/public tidak memakai token var()', () => {
    const imp = read('public/PublicResults.jsx').match(/import \{([^}]*)\} from '..\/theme\/chartTheme'/)[1];
    expect(imp).not.toMatch(/THEMED|AXIS_TICK|TOOLTIP/);
  });

  test('CHART, CATEGORICAL, STATUS tetap hex; CHART_THEMED memakai var()', async () => {
    const { CHART, CATEGORICAL, STATUS, CHART_THEMED } = await import(path.resolve(SRC, 'theme/chartTheme.js'));
    for (const v of [...Object.values(CHART), ...CATEGORICAL, ...Object.values(STATUS)]) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    expect(CHART_THEMED.axis).toMatch(/var\(--/);
    expect(CHART_THEMED.grid).toMatch(/var\(--/);
  });
});

describe('berkas kerja tidak ikut artefak', () => {
  test('pola mencakup semua ekstensi di .dockerignore', () => {
    const { PRIVATE_ASSET } = require(path.resolve(FE, 'scripts/privateAssets.cjs'));
    const lines = fs.readFileSync(path.resolve(FE, '.dockerignore'), 'utf8').split(/\r?\n/);
    const patterns = lines.filter((l) => /^public\/\*\.\w+$/.test(l.trim()));
    expect(patterns.length).toBeGreaterThan(0);
    for (const l of patterns) expect(`laporan${l.trim().slice('public/*'.length)}`).toMatch(PRIVATE_ASSET);
  });

  test('build web & rilis APK sama-sama memakainya', () => {
    expect(fs.readFileSync(path.resolve(FE, 'vite.config.js'), 'utf8')).toMatch(/stripPrivateAssets\(\),/);
    expect(fs.readFileSync(path.resolve(FE, 'scripts/release-android.cjs'), 'utf8')).toMatch(/findPrivateAssets\(path\.join\(ANDROID_DIR/);
  });
});
