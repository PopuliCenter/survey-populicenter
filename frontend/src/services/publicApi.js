import axios from 'axios';

/**
 * publicApi — klien untuk endpoint PUBLIK (/public/*) yang TIDAK butuh login.
 *
 * Berbeda dari `api` (services/api.js): tidak melampirkan token dan tidak
 * meredirect ke /login saat 401 — dipakai oleh halaman embed hasil survei
 * yang disematkan di website (populicenter.org) tanpa autentikasi.
 */
import { PRODUCTION_SERVER } from '../config/server';

function getBaseURL() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return PRODUCTION_SERVER;
  }
  return ''; // browser → relative, di-proxy nginx
}

const publicApi = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

publicApi.interceptors.request.use((config) => {
  config.baseURL = getBaseURL();
  return config;
});

export default publicApi;
