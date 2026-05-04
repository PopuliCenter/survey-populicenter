import type { CapacitorConfig } from '@capacitor/cli';

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
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
