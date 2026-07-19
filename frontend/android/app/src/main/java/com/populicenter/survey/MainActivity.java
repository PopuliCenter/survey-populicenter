package com.populicenter.survey;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {

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
