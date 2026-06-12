import { useEffect } from 'react';
import { setStatusBarStyle } from '../utils/capacitorBridge';

/**
 * useStatusBar — selaraskan status bar Android dengan tema layar yang sedang aktif.
 *
 * Status bar dimiliki OS; aplikasi hanya menyetel (a) warna latar bar dan
 * (b) gaya ikon (gelap/terang) agar jam/sinyal/baterai selalu kontras dengan
 * latar layar. Hook ini menerapkan setelan itu saat komponen mount lalu
 * mengembalikannya ke tema default saat unmount — jadi tiap layar tinggal
 * mendeklarasikan temanya sendiri tanpa menulis ulang efek.
 *
 * Catatan penamaan Capacitor yang membingungkan:
 *   Style.Light  = ikon GELAP  (untuk latar TERANG)
 *   Style.Dark   = ikon PUTIH  (untuk latar GELAP)
 * Preset di bawah memakai istilah natural ('light'/'dark') sesuai warna LATAR.
 *
 * @param {'light' | 'dark' | { style?: 'DARK' | 'LIGHT', color?: string }} theme
 *   Preset nama, atau objek konfigurasi mentah {style, color}.
 *
 * @example
 *   useStatusBar('dark');                       // latar gelap → ikon putih
 *   useStatusBar({ style: 'DARK', color: '#7c2912' }); // kustom
 */

// Tema default aplikasi: permukaan terang (cream/putih) → ikon gelap.
export const DEFAULT_STATUS_BAR = { style: 'LIGHT', color: '#ffffff' };

// Preset berbasis warna LATAR layar (bukan warna ikon).
const PRESETS = {
  light: DEFAULT_STATUS_BAR,           // latar terang → ikon gelap
  dark: { style: 'DARK', color: '#1e3a8a' }, // latar biru gelap (Login) → ikon putih
};

export default function useStatusBar(theme) {
  // Normalisasi argumen → objek konfigurasi stabil untuk dependency array.
  const config = typeof theme === 'string' ? PRESETS[theme] : theme;
  const style = config?.style ?? DEFAULT_STATUS_BAR.style;
  const color = config?.color ?? DEFAULT_STATUS_BAR.color;

  useEffect(() => {
    setStatusBarStyle({ style, color });
    return () => setStatusBarStyle(DEFAULT_STATUS_BAR);
  }, [style, color]);
}
