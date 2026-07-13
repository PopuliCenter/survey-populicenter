import axios from 'axios';
import { PRODUCTION_SERVER } from '../config/server';
import { getDeviceUid, getDeviceLabel } from '../utils/deviceId';

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
    // Identitas perangkat — untuk kunci perangkat (1 user = 1 device) di server.
    const deviceUid = getDeviceUid();
    if (deviceUid) {
      config.headers['X-Device-Id'] = deviceUid;
      const label = getDeviceLabel();
      if (label) config.headers['X-Device-Label'] = label;
    }
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
