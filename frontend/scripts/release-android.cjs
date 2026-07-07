#!/usr/bin/env node
/**
 * release-android.cjs — Rilis Android satu perintah.
 *
 *   npm run cap:release                 # bangun AAB rilis, auto-bump versionCode
 *   npm run cap:release -- --name 1.2.0 # set versionName + auto-bump code
 *   npm run cap:release -- --code 10    # paksa versionCode tertentu
 *   npm run cap:release -- --no-bump    # jangan naikkan code (build ulang versi sama)
 *   npm run cap:release -- --apk        # bangun APK (assembleRelease) alih-alih AAB
 *   npm run cap:release -- --dry-run    # tampilkan rencana, tanpa build
 *
 * Alur: baca android/version.properties → `vite build && cap sync` →
 *       gradlew bundleRelease -PappVersionCode -PappVersionName →
 *       jika sukses, naikkan appVersionCode di version.properties.
 *
 * Lintas-platform (Windows/macOS/Linux). versionCode WAJIB naik tiap unggah ke
 * Play Console — skrip ini menjaganya otomatis.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(FRONTEND_DIR, 'android');
const VERSION_FILE = path.join(ANDROID_DIR, 'version.properties');
const KEYSTORE_FILE = path.join(ANDROID_DIR, 'keystore.properties');
const isWin = process.platform === 'win32';

// ── Argumen ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name) { return argv.includes(`--${name}`); }
function opt(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
const DRY = flag('dry-run');
const NO_BUMP = flag('no-bump');
const BUILD_APK = flag('apk');
const nameArg = opt('name');
const codeArg = opt('code');

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

// ── Baca/validasi version.properties ─────────────────────────────────────────
if (!fs.existsSync(VERSION_FILE)) die(`Tak ada ${path.relative(FRONTEND_DIR, VERSION_FILE)}. Buat dengan appVersionCode=1 & appVersionName=1.0.0`);
const raw = fs.readFileSync(VERSION_FILE, 'utf8');
const props = {};
raw.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith('#')) props[m[1]] = m[2].trim();
});

let code = codeArg !== null ? parseInt(codeArg, 10) : parseInt(props.appVersionCode, 10);
let name = nameArg !== null ? nameArg : props.appVersionName;

if (!Number.isInteger(code) || code < 1) die(`appVersionCode tidak valid: "${code}". Perbaiki di version.properties atau pakai --code N.`);
if (!name || !/^[0-9A-Za-z.\-]+$/.test(name)) die(`appVersionName tidak valid: "${name}". Gunakan mis. 1.0.0 (huruf/angka/titik/strip).`);

// ── Ringkasan & peringatan keystore ──────────────────────────────────────────
const artifact = BUILD_APK ? 'APK (assembleRelease)' : 'AAB (bundleRelease)';
const gradleTask = BUILD_APK ? 'assembleRelease' : 'bundleRelease';
const outPath = BUILD_APK
  ? path.join(ANDROID_DIR, 'app/build/outputs/apk/release/app-release.apk')
  : path.join(ANDROID_DIR, 'app/build/outputs/bundle/release/app-release.aab');

console.log('─────────────────────────────────────────────');
console.log('  Rilis Android — Populi Survey');
console.log('─────────────────────────────────────────────');
console.log(`  Artefak      : ${artifact}`);
console.log(`  versionName  : ${name}`);
const signed = fs.existsSync(KEYSTORE_FILE);
console.log(`  versionCode  : ${code}`);
console.log(`  Auto-bump    : ${NO_BUMP ? 'tidak (--no-bump)' : (signed ? `ya → ${code + 1} setelah sukses` : 'tidak (unsigned — build verifikasi)')}`);
console.log(`  Signing      : ${signed ? 'keystore.properties ditemukan (ditandatangani)' : '⚠ TANPA keystore → artefak UNSIGNED (tak bisa diunggah ke Play)'}`);
console.log('─────────────────────────────────────────────');

if (DRY) { console.log('(dry-run) Tidak menjalankan build.'); process.exit(0); }
if (!signed) console.log('  ⚠ Lanjut membangun artefak unsigned. Untuk rilis Play, siapkan keystore.properties dulu.\n');

// ── Helper jalankan perintah (stream output apa adanya) ──────────────────────
function run(cmd, args, cwd) {
  const display = `${cmd} ${args.join(' ')}`;
  console.log(`\n▶ ${display}   (di ${path.relative(FRONTEND_DIR, cwd) || '.'})`);
  // Windows: .bat/.cmd (npm, gradlew.bat) butuh shell. Untuk menghindari
  // DeprecationWarning DEP0190, saat shell:true berikan SATU string perintah
  // (bukan array args). Argumen sudah divalidasi (versionName/Code) → aman.
  const res = isWin
    ? spawnSync(display, { cwd, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) die(`Perintah gagal (exit ${res.status}): ${display}`);
}

// ── 1) Build web + sync Capacitor ────────────────────────────────────────────
run('npm', ['run', 'cap:build'], FRONTEND_DIR);

// ── 2) Gradle build rilis dengan versi eksplisit ─────────────────────────────
const gradlew = isWin ? 'gradlew.bat' : './gradlew';
run(gradlew, [gradleTask, `-PappVersionCode=${code}`, `-PappVersionName=${name}`], ANDROID_DIR);

// ── 3) Verifikasi artefak & bump versi ───────────────────────────────────────
if (!fs.existsSync(outPath)) die(`Build selesai tapi artefak tak ditemukan di ${outPath}`);
const sizeMB = (fs.statSync(outPath).size / 1048576).toFixed(1);

if (NO_BUMP) {
  // Bump dilewati atas permintaan (--no-bump).
} else if (!signed) {
  // Artefak unsigned tak bisa diunggah ke Play → jangan buang-buang versionCode.
  console.log('\n▶ versionCode TIDAK dinaikkan — artefak unsigned (build verifikasi, belum bisa diunggah).');
} else {
  const nextCode = code + 1;
  const updated = raw
    .replace(/^(\s*appVersionCode\s*=\s*).*$/m, `$1${nextCode}`)
    .replace(/^(\s*appVersionName\s*=\s*).*$/m, `$1${name}`);
  fs.writeFileSync(VERSION_FILE, updated);
  console.log(`\n▶ version.properties → appVersionCode berikutnya: ${nextCode}`);
}

console.log('\n─────────────────────────────────────────────');
console.log(`✅ Sukses: ${artifact}  (${sizeMB} MB, v${name} / code ${code})`);
console.log(`   ${outPath}`);
console.log(signed
  ? '   Unggah AAB ini ke Play Console (Closed testing → Production).'
  : '   ⚠ UNSIGNED — hanya untuk verifikasi build. Siapkan keystore untuk rilis.');
console.log('─────────────────────────────────────────────');
