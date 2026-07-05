import axios from 'axios';
import { PRODUCTION_SERVER } from '../config/server';

function getBaseURL() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Capacitor native → langsung ke server production
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return PRODUCTION_SERVER;
  }

  // Browser web → relative URL (proxy via nginx)
  return '';
}

const api = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseURL();
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
