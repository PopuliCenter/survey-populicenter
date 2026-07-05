/**
 * URL server produksi — dipakai oleh Android/Capacitor (web memakai relative URL
 * via nginx). Satu sumber kebenaran agar tidak drift antar-klien api.
 * Override saat build via env VITE_API_URL bila perlu.
 */
export const PRODUCTION_SERVER = 'https://risetcenter.com';
