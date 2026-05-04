import axios from 'axios';

/**
 * Determine the API base URL.
 * Dipanggil setiap request via interceptor agar selalu menggunakan URL terbaru.
 */
function getBaseURL() {
  // 1. Env variable (build-time)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // 2. Capacitor native — ambil dari localStorage (set di ServerConfig)
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    const savedUrl = localStorage.getItem('api_server_url');
    if (savedUrl) return savedUrl;
    return 'http://10.0.2.2:3000';
  }

  // 3. Browser web — relative URL (proxy via nginx)
  return '';
}

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// ─── Request Interceptor: set baseURL + attach JWT setiap request ─────────────
api.interceptors.request.use(
  (config) => {
    // Selalu ambil baseURL terbaru dari localStorage (penting untuk Capacitor)
    config.baseURL = getBaseURL();

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Debug log untuk troubleshooting di Capacitor
    console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, token ? '(with token)' : '(no token)');

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: handle 401 (redirect to login) ────────────────────
api.interceptors.response.use(
  (response) => {
    console.log(`[API] Response ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`[API] Error ${error.config?.url}:`, error.message, error.response?.status);
    if (error.response?.status === 401) {
      // Jangan redirect jika sedang di halaman login
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/server-config')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
