/**
 * themeMode.js — sumber tunggal mode tema (terang / gelap / ikuti sistem).
 *
 * Bawaan: web = system, APK = light (TPD bekerja di bawah terik matahari).
 * Halaman /embed/* SELALU terang: tertanam di populicenter.org.
 * Pasangan boot-nya ada di index.html (skrip inline) — logikanya harus sama.
 *
 * Aturan yang tak boleh dilanggar di sini (lihat memori boot-storage-safety):
 *   - storage hanya lewat safeStorage, tak pernah window.localStorage langsung
 *   - tak ada await di jalur boot; initTheme sinkron dan tak pernah melempar
 *   - objek plugin Capacitor tak pernah di-return/di-resolve (jebakan thenable)
 */
import { localStore } from '../utils/safeStorage';
import { addResumeListener, isNativePlatform, setStatusBarStyle } from '../utils/capacitorBridge';
import { surface } from './palette';

export const THEME_KEY = 'theme_mode';
export const MODES = ['light', 'dark', 'system'];
const QUERY = '(prefers-color-scheme: dark)';

// Warna yang harus sama di index.html & MainActivity.java (dijaga tes).
// canvas = latar halaman (bg-gray-50 di gelap); surface = header (bg-white di gelap).
export const DARK_CANVAS = surface.page;
export const DARK_SURFACE = surface.card;

export const CHROME = {
  light: { style: 'LIGHT', color: '#ffffff' },
  dark: { style: 'DARK', color: DARK_SURFACE },
};

const listeners = new Set();
let snapshot = null;
let mql; // undefined = belum dicoba; null = tak tersedia (jsdom, WebView lama)
let stopSystem = null;
let lastChrome = null;

const inEmbed = () => {
  try {
    return window.location.pathname.indexOf('/embed/') === 0;
  } catch {
    return false;
  }
};

function mediaQuery() {
  if (mql !== undefined) return mql;
  try {
    mql = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  } catch {
    mql = null;
  }
  return mql;
}

function storedMode() {
  const v = localStore.getItem(THEME_KEY);
  return MODES.includes(v) ? v : null;
}

export function defaultMode() {
  return isNativePlatform() ? 'light' : 'system';
}

function resolve(mode) {
  if (inEmbed()) return 'light';
  if (mode === 'system') return mediaQuery()?.matches ? 'dark' : 'light';
  return mode;
}

function compute() {
  const mode = storedMode() || defaultMode();
  return { mode, resolved: resolve(mode) };
}

function paint(resolved) {
  const root = document.documentElement;
  const dark = resolved === 'dark';
  root.classList.toggle('dark', dark);
  // color-scheme biasa ada di CSS (:root / html.dark). Inline hanya untuk embed:
  // 'only light' mencegah penggelapan paksa browser.
  if (inEmbed()) root.style.colorScheme = 'only light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? DARK_SURFACE : '#ffffff');
  if (lastChrome !== resolved && !inEmbed()) {
    lastChrome = resolved;
    setStatusBarStyle(CHROME[resolved]);
  }
}

function refresh() {
  const next = compute();
  const changed = !snapshot || snapshot.mode !== next.mode || snapshot.resolved !== next.resolved;
  if (changed) snapshot = next;
  paint(snapshot.resolved);
  if (changed) listeners.forEach((fn) => fn());
}

/** Dipanggil sinkron di main.jsx sebelum render. Idempoten, tak pernah melempar. */
export function initTheme() {
  try {
    refresh();
    if (stopSystem || inEmbed()) return;

    const onChange = () => refresh();
    const q = mediaQuery();
    if (q?.addEventListener) q.addEventListener('change', onChange);
    else if (q?.addListener) q.addListener(onChange); // Safari < 14
    window.addEventListener('storage', onChange); // antar-tab
    let stopResume = () => {};
    if (isNativePlatform()) {
      // uiMode ditangani sendiri oleh activity: jangan andalkan event media saja.
      addResumeListener(onChange).then((fn) => { stopResume = fn; }).catch(() => {});
      restoreFromNative();
    }
    stopSystem = () => {
      if (q?.removeEventListener) q.removeEventListener('change', onChange);
      else if (q?.removeListener) q.removeListener(onChange);
      window.removeEventListener('storage', onChange);
      stopResume();
    };
  } catch { /* tema bukan syarat render */ }
}

function mirrorToNative(mode) {
  if (!isNativePlatform()) return;
  // MainActivity membaca nilai ini untuk warna latar WebView sebelum halaman tampil.
  import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.set({ key: THEME_KEY, value: mode }))
    .catch(() => {});
}

function restoreFromNative() {
  if (storedMode()) return;
  import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.get({ key: THEME_KEY }))
    .then(({ value }) => {
      if (MODES.includes(value) && !storedMode()) {
        localStore.setItem(THEME_KEY, value);
        refresh();
      }
    })
    .catch(() => {});
}

export function setThemeMode(mode) {
  if (!MODES.includes(mode)) return;
  localStore.setItem(THEME_KEY, mode);
  mirrorToNative(mode);
  refresh();
}

export function cycleThemeMode() {
  const { mode } = getThemeSnapshot();
  setThemeMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getThemeSnapshot() {
  if (!snapshot) snapshot = compute();
  return snapshot;
}

/** Hanya untuk tes. */
export function __resetThemeForTests() {
  if (stopSystem) stopSystem();
  stopSystem = null;
  snapshot = null;
  mql = undefined;
  lastChrome = null;
  listeners.clear();
}
