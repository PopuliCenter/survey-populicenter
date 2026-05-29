import type { CapacitorConfig } from '@capacitor/cli';

// Debugging WebView & mixed content hanya diaktifkan saat development.
// Di build rilis (NODE_ENV=production) keduanya dimatikan demi keamanan.
const isDev = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'com.populicenter.survey',
  appName: 'Populi Survey',
  webDir: 'dist',
  server: {
    cleartext: true,
    // JANGAN ubah androidScheme — biarkan default 'https' agar localStorage persist
  },
  plugins: {
    CapacitorHttp: {
      // Native HTTP engine — bypass CORS di WebView sepenuhnya
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#f9fafb',
      showSpinner: true,
      spinnerColor: '#2563eb',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#2563eb',
    },
  },
  android: {
    allowMixedContent: isDev,
    captureInput: true,
    webContentsDebuggingEnabled: isDev,
  },
};

export default config;
