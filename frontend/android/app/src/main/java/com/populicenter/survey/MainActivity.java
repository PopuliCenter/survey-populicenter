package com.populicenter.survey;

import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {

  // SharedPreferences hanya memegang referensi lemah: listener wajib disimpan di field.
  private SharedPreferences.OnSharedPreferenceChangeListener themeListener;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // ─── Purge Service Worker WebView (insiden layar putih 2026-07-18) ────────
    // PWA Service Worker ikut terdaftar di WebView APK (origin https://localhost)
    // dan BERTAHAN lintas-update APK. SW versi lama menyajikan bundle JS lama
    // dari cache-nya — bila bundle lama itu crash saat boot, aplikasi putih
    // PERMANEN walau APK sudah diganti (JS baru tak pernah dieksekusi, jadi
    // pembersihan dari sisi JS mustahil). Solusi: hapus direktori Service
    // Worker WebView SEBELUM bridge/WebView dibuat.
    //
    // Yang dihapus HANYA "Service Worker/" (registrasi + CacheStorage).
    // Local Storage & IndexedDB (sesi login, antrean offline, draf) TIDAK
    // disentuh. Sejak rilis ini SW tidak lagi didaftarkan di native (lihat
    // main.jsx), jadi direktori ini akan tetap kosong ke depannya.
    purgeServiceWorkerState();
    super.onCreate(savedInstanceState);
    applySavedThemeBackground();
    themeListener = (prefs, key) -> {
      if ("theme_mode".equals(key)) applySavedThemeBackground();
    };
    getSharedPreferences("CapacitorStorage", MODE_PRIVATE).registerOnSharedPreferenceChangeListener(themeListener);
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    applySavedThemeBackground(); // mode "ikuti sistem" saat tema OS berganti
  }

  @Override
  public void onDestroy() {
    if (themeListener != null) {
      getSharedPreferences("CapacitorStorage", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(themeListener);
    }
    super.onDestroy();
  }

  /**
   * Warna di belakang WebView. Mencegah kilatan putih saat dibuka dalam mode gelap, dan
   * di Android 15+ dengan WebView di bawah 140 warna ini terlihat di bawah status bar,
   * jadi harus ikut saat tema berganti. Mode dibaca dari Preferences (dicerminkan oleh
   * src/theme/themeMode.js). Warna gelap sama dengan surface.page di palette.js (dijaga
   * themeBoot.test.jsx).
   */
  private void applySavedThemeBackground() {
    try {
      if (getBridge() == null) return; // jalur tanpa WebView
      WebView webView = getBridge().getWebView();
      if (webView == null) return;
      String mode = getSharedPreferences("CapacitorStorage", MODE_PRIVATE).getString("theme_mode", "light");
      boolean systemDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
      boolean dark = "dark".equals(mode) || ("system".equals(mode) && systemDark);
      int color = dark ? 0xFF141312 : 0xFFFFFFFF;
      webView.setBackgroundColor(color);
      if (webView.getParent() instanceof View) ((View) webView.getParent()).setBackgroundColor(color);
    } catch (Exception ignored) {
      // Warna latar bukan syarat startup.
    }
  }

  private void purgeServiceWorkerState() {
    try {
      File dataDir = getFilesDir().getParentFile();
      if (dataDir == null) return;
      String[] targets = {
        "app_webview/Default/Service Worker", // layout Chromium modern (profil Default)
        "app_webview/Service Worker",         // layout WebView lama
      };
      for (String t : targets) {
        deleteRecursively(new File(dataDir, t));
      }
    } catch (Exception ignored) {
      // Gagal bersih-bersih tak boleh menggagalkan startup aplikasi.
    }
  }

  private static void deleteRecursively(File f) {
    if (f == null || !f.exists()) return;
    File[] children = f.listFiles();
    if (children != null) {
      for (File c : children) deleteRecursively(c);
    }
    //noinspection ResultOfMethodCallIgnored
    f.delete();
  }
}
