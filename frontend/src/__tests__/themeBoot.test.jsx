/**
 * Modul tema + skrip boot + sakelar. Lingkungan jsdom TANPA matchMedia (sama seperti
 * test-setup.js). Boot dan modul wajib menghasilkan keputusan yang sama: dijaga tes paritas.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const bridge = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  setStatusBarStyle: vi.fn(),
  addResumeListener: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock('../utils/capacitorBridge', () => bridge);

import {
  __resetThemeForTests, CHROME, cycleThemeMode, DARK_CANVAS, DARK_SURFACE, defaultMode,
  getThemeSnapshot, initTheme, setThemeMode, THEME_KEY,
} from '../theme/themeMode';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { localStore } from '../utils/safeStorage';

const BOOT_HTML = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const BOOT_JS = BOOT_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];

const root = document.documentElement;
function setPath(p) { window.history.pushState({}, '', p); }
function fakeMql(matches) {
  const handlers = new Set();
  return {
    matches,
    addEventListener: (_, h) => handlers.add(h),
    removeEventListener: (_, h) => handlers.delete(h),
    fire(next) { this.matches = next; handlers.forEach((h) => h({ matches: next })); },
    get count() { return handlers.size; },
  };
}

beforeEach(() => {
  __resetThemeForTests();
  localStorage.clear();
  root.className = '';
  root.removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  delete window.matchMedia;
  delete window.Capacitor;
  setPath('/dashboard');
  bridge.isNativePlatform.mockReturnValue(false);
  bridge.setStatusBarStyle.mockClear();
});

describe('initTheme', () => {
  test('jsdom tanpa matchMedia: tidak melempar, system → terang', () => {
    expect(window.matchMedia).toBeUndefined();
    expect(() => initTheme()).not.toThrow();
    expect(getThemeSnapshot()).toEqual({ mode: 'system', resolved: 'light' });
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('matchMedia melempar: tetap aman', () => {
    window.matchMedia = () => { throw new Error('boom'); };
    expect(() => initTheme()).not.toThrow();
    expect(getThemeSnapshot().resolved).toBe('light');
  });

  test('bawaan: web = system, APK = light walau sistem gelap', () => {
    expect(defaultMode()).toBe('system');
    bridge.isNativePlatform.mockReturnValue(true);
    window.matchMedia = () => fakeMql(true);
    expect(defaultMode()).toBe('light');
    initTheme();
    expect(getThemeSnapshot()).toEqual({ mode: 'light', resolved: 'light' });
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('nilai tersimpan rusak diabaikan', () => {
    localStorage.setItem(THEME_KEY, 'ungu');
    initTheme();
    expect(getThemeSnapshot().mode).toBe('system');
  });

  test('idempoten: dua kali init hanya satu langganan', () => {
    const q = fakeMql(false);
    window.matchMedia = () => q;
    initTheme();
    initTheme();
    expect(q.count).toBe(1);
  });
});

describe('mengganti mode', () => {
  test('gelap: kelas, color-scheme, meta, status bar; tersimpan', () => {
    initTheme();
    setThemeMode('dark');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]').content).toBe(DARK_SURFACE);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(bridge.setStatusBarStyle).toHaveBeenLastCalledWith(CHROME.dark);
    setThemeMode('light');
    expect(root.classList.contains('dark')).toBe(false);
    expect(bridge.setStatusBarStyle).toHaveBeenLastCalledWith(CHROME.light);
  });

  test('status bar tak dipanggil ulang bila warna hasil tak berubah', () => {
    initTheme();
    bridge.setStatusBarStyle.mockClear();
    setThemeMode('light'); // system → light, hasil tetap terang
    expect(bridge.setStatusBarStyle).not.toHaveBeenCalled();
  });

  test('mode tak dikenal ditolak', () => {
    initTheme();
    setThemeMode('ungu');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  test('siklus terang → gelap → sistem → terang', () => {
    localStorage.setItem(THEME_KEY, 'light');
    initTheme();
    const seen = [];
    for (let i = 0; i < 3; i += 1) { cycleThemeMode(); seen.push(getThemeSnapshot().mode); }
    expect(seen).toEqual(['dark', 'system', 'light']);
  });
});

describe('ikuti sistem', () => {
  test('perubahan sistem diikuti hanya saat mode = system', () => {
    const q = fakeMql(false);
    window.matchMedia = () => q;
    initTheme();
    q.fire(true);
    expect(root.classList.contains('dark')).toBe(true);
    expect(bridge.setStatusBarStyle).toHaveBeenLastCalledWith(CHROME.dark);
    setThemeMode('light');
    q.fire(false);
    q.fire(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('WebView APK: event media mungkin tak terkirim → dibaca ulang saat resume', async () => {
    bridge.isNativePlatform.mockReturnValue(true);
    let resume;
    bridge.addResumeListener.mockImplementation((cb) => { resume = cb; return Promise.resolve(() => {}); });
    localStorage.setItem(THEME_KEY, 'system');
    const q = fakeMql(false);
    window.matchMedia = () => q;
    initTheme();
    q.matches = true; // sistem berubah, tanpa event
    resume();
    expect(root.classList.contains('dark')).toBe(true);
  });
});

describe('embed publik', () => {
  test('selalu terang walau tersimpan gelap dan sistem gelap; tak berlangganan', () => {
    setPath('/embed/results/slug-x');
    localStorage.setItem(THEME_KEY, 'dark');
    const q = fakeMql(true);
    window.matchMedia = () => q;
    initTheme();
    expect(getThemeSnapshot().resolved).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('only light');
    expect(q.count).toBe(0);
    expect(bridge.setStatusBarStyle).not.toHaveBeenCalled();
  });
});

describe('skrip boot inline', () => {
  const runBoot = () => {
    new Function(BOOT_JS)();
  };
  const withStorage = (descriptor, fn) => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, ...descriptor });
    try { fn(); } finally { Object.defineProperty(window, 'localStorage', orig); }
  };

  test('localStorage NULL (insiden 2026-07-18): tidak melempar', () => {
    withStorage({ value: null }, () => expect(runBoot).not.toThrow());
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('localStorage melempar saat diakses: tidak melempar', () => {
    withStorage({ get() { throw new Error('denied'); } }, () => expect(runBoot).not.toThrow());
  });

  test('tanpa matchMedia dan tanpa Capacitor: tidak melempar', () => {
    expect(runBoot).not.toThrow();
    expect(root.classList.contains('dark')).toBe(false);
  });

  test('Capacitor melempar: anggap web', () => {
    window.Capacitor = { isNativePlatform() { throw new Error('x'); } };
    window.matchMedia = () => ({ matches: true });
    expect(runBoot).not.toThrow();
    expect(root.classList.contains('dark')).toBe(true);
  });

  test('warna boot & MainActivity sama dengan konstanta modul', () => {
    expect(BOOT_HTML).toContain(`html.dark{background:${DARK_CANVAS}}`);
    expect(BOOT_JS).toContain(DARK_SURFACE);
    const java = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/com/populicenter/survey/MainActivity.java'), 'utf8');
    expect(java).toContain(`0xFF${DARK_CANVAS.slice(1).toUpperCase()}`);
  });

  test('ukuran boot kecil', () => {
    expect(Buffer.byteLength(BOOT_JS)).toBeLessThan(1024);
  });

  // Paritas: boot dan modul wajib menghasilkan keputusan yang sama.
  const PATHS = ['/login', '/surveyor', '/embed/results/a', '/embed/monitor/t'];
  const STORED = [null, 'light', 'dark', 'system', 'rusak'];
  const CASES = [];
  PATHS.forEach((p) => STORED.forEach((s) => [false, true].forEach((native) => [false, true, null].forEach((sys) => {
    CASES.push({ p, s, native, sys });
  }))));

  test.each(CASES)('paritas $p tersimpan=$s native=$native sistemGelap=$sys', ({ p, s, native, sys }) => {
    setPath(p);
    if (s) localStorage.setItem(THEME_KEY, s);
    if (native) window.Capacitor = { isNativePlatform: () => true };
    bridge.isNativePlatform.mockReturnValue(native);
    if (sys !== null) window.matchMedia = () => fakeMql(sys);

    runBoot();
    const bootDark = root.classList.contains('dark');
    const bootScheme = root.style.colorScheme;
    root.className = '';
    root.removeAttribute('style');

    initTheme();
    expect(root.classList.contains('dark')).toBe(bootDark);
    expect(root.style.colorScheme).toBe(bootScheme);
  });
});

describe('storage menolak tulis (penuh)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStore.removeItem(THEME_KEY); // nilai cadangan di memori hidup selama modul
  });

  test('pilihan tersimpan tetap dipakai; boot dan modul sepakat', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    new Function(BOOT_JS)();
    expect(root.classList.contains('dark')).toBe(true);
    root.className = '';
    initTheme();
    expect(getThemeSnapshot().mode).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  test('sakelar tetap berfungsi selama sesi', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    initTheme();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    setThemeMode('light');
    expect(getThemeSnapshot().mode).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
    setThemeMode('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });
});

describe('ThemeToggle', () => {
  test('tanpa teks terlihat; nama aksesibel menyebut mode; mengganti mode', () => {
    localStorage.setItem(THEME_KEY, 'light');
    initTheme();
    const { container } = render(<ThemeToggle />);
    expect(container.textContent).toBe('');
    const btn = screen.getByRole('button', { name: /tema: terang/i });
    fireEvent.click(btn);
    expect(root.classList.contains('dark')).toBe(true);
    screen.getByRole('button', { name: /tema: gelap/i });
    fireEvent.click(screen.getByRole('button', { name: /tema: gelap/i }));
    screen.getByRole('button', { name: /tema: ikuti sistem/i });
  });

  test('sumber lolos guard typography (emoji & text-gray-400)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/ThemeToggle.jsx'), 'utf8');
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2600}-\u{26FF}]/u;
    expect(EMOJI.test(src)).toBe(false);
    expect(/text-gray-400/.test(src)).toBe(false);
    expect(/text-\[\d+(\.\d+)?px\]/.test(src)).toBe(false);
  });
});
