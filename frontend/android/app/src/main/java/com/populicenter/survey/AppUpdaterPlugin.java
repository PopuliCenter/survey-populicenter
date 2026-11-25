package com.populicenter.survey;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AppUpdater — pembaruan APK langsung dari aplikasi (distribusi di luar Play).
 *
 * Alur: unduh APK (https, domain resmi saja) → cocokkan SHA-256 dengan yang
 * diumumkan admin → buka pemasang Android. Android sendiri MENOLAK pembaruan
 * yang ditandatangani kunci berbeda, jadi APK palsu tak bisa menimpa aplikasi.
 *
 * Build Google Play (AAB) membuang izin REQUEST_INSTALL_PACKAGES (lihat
 * app/build.gradle) — getInstallSupport() lalu melapor declared=false dan
 * aplikasi membuka halaman Play sebagai gantinya (kebijakan Play melarang
 * aplikasi memperbarui dirinya sendiri di luar Play).
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

  // WAJIB sama dengan ALLOWED_HOSTS di backend/src/utils/appRelease.js.
  private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
    "populicenter.org",
    "www.populicenter.org",
    "populicenter.com",
    "www.populicenter.com",
    "play.google.com"
  ));
  private static final long MAX_BYTES = 200L * 1024 * 1024;
  private static final String APK_NAME = "update.apk";

  private final AtomicBoolean busy = new AtomicBoolean(false);

  static boolean isAllowedUrl(String raw) {
    try {
      URL u = new URL(raw);
      return "https".equalsIgnoreCase(u.getProtocol())
        && ALLOWED_HOSTS.contains(u.getHost().toLowerCase(Locale.ROOT));
    } catch (Exception e) {
      return false;
    }
  }

  private boolean installPermissionDeclared() {
    try {
      Context ctx = getContext();
      PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), PackageManager.GET_PERMISSIONS);
      if (info.requestedPermissions == null) return false;
      for (String p : info.requestedPermissions) {
        if (Manifest.permission.REQUEST_INSTALL_PACKAGES.equals(p)) return true;
      }
    } catch (Exception ignored) {
      // anggap tak didukung
    }
    return false;
  }

  private boolean installAllowed() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
      || getContext().getPackageManager().canRequestPackageInstalls();
  }

  private File updatesDir() {
    File dir = new File(getContext().getCacheDir(), "updates");
    if (!dir.exists()) dir.mkdirs();
    return dir;
  }

  /** { declared: izin pasang ada di manifest, allowed: pengguna sudah mengizinkan } */
  @PluginMethod
  public void getInstallSupport(PluginCall call) {
    JSObject r = new JSObject();
    r.put("declared", installPermissionDeclared());
    r.put("allowed", installAllowed());
    call.resolve(r);
  }

  /** Buka tautan resmi (website / Google Play) di aplikasi yang sesuai. */
  @PluginMethod
  public void openUrl(PluginCall call) {
    String url = call.getString("url", "");
    if (!isAllowedUrl(url)) {
      call.reject("Tautan bukan domain resmi.", "URL_NOT_ALLOWED");
      return;
    }
    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    try {
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject("Tak ada aplikasi untuk membuka tautan.", "NO_APP", e);
    }
  }

  /** Buka layar "Izinkan dari sumber ini" untuk aplikasi ini (Android 8+). */
  @PluginMethod
  public void openInstallSettings(PluginCall call) {
    try {
      Intent i;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + getContext().getPackageName()));
      } else {
        i = new Intent(Settings.ACTION_SECURITY_SETTINGS);
      }
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject("Pengaturan tak bisa dibuka.", "NO_SETTINGS", e);
    }
  }

  /**
   * Unduh + verifikasi + pasang. Event "downloadProgress" {downloaded,total}.
   * Resolve { status: 'installer_opened' | 'needs_permission' }.
   */
  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    final String url = call.getString("url", "");
    final String sha = call.getString("sha256", "").trim().toLowerCase(Locale.ROOT);
    if (!isAllowedUrl(url)) {
      call.reject("Tautan APK bukan domain resmi.", "URL_NOT_ALLOWED");
      return;
    }
    if (!sha.matches("^[0-9a-f]{64}$")) {
      call.reject("SHA-256 tidak valid.", "BAD_CHECKSUM");
      return;
    }
    if (!installPermissionDeclared()) {
      call.reject("Pemasangan langsung tak didukung di build ini.", "INSTALL_NOT_SUPPORTED");
      return;
    }
    if (!busy.compareAndSet(false, true)) {
      call.reject("Unduhan sedang berjalan.", "BUSY");
      return;
    }
    new Thread(() -> {
      try {
        File apk = download(url, sha);
        finishInstall(call, apk);
      } catch (UpdateException e) {
        call.reject(e.getMessage(), e.code, e);
      } catch (Exception e) {
        call.reject("Gagal mengunduh pembaruan.", "DOWNLOAD_FAILED", e);
      } finally {
        busy.set(false);
      }
    }, "AppUpdater").start();
  }

  /** Pasang berkas yang sudah terunduh (setelah pengguna memberi izin). */
  @PluginMethod
  public void installDownloaded(PluginCall call) {
    final String sha = call.getString("sha256", "").trim().toLowerCase(Locale.ROOT);
    File apk = new File(updatesDir(), APK_NAME);
    try {
      if (!apk.exists()) throw new UpdateException("NOT_DOWNLOADED", "Berkas pembaruan belum diunduh.");
      if (!sha.equals(sha256Of(apk))) {
        apk.delete();
        throw new UpdateException("CHECKSUM_MISMATCH", "Berkas pembaruan rusak. Unduh ulang.");
      }
      finishInstall(call, apk);
    } catch (UpdateException e) {
      call.reject(e.getMessage(), e.code, e);
    } catch (Exception e) {
      call.reject("Gagal memasang pembaruan.", "INSTALL_FAILED", e);
    }
  }

  private void finishInstall(PluginCall call, File apk) {
    JSObject r = new JSObject();
    if (!installAllowed()) {
      r.put("status", "needs_permission");
      call.resolve(r);
      return;
    }
    Context ctx = getContext();
    Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
    Intent i = new Intent(Intent.ACTION_VIEW);
    i.setDataAndType(uri, "application/vnd.android.package-archive");
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
    ctx.startActivity(i);
    r.put("status", "installer_opened");
    call.resolve(r);
  }

  private File download(String url, String expectedSha) throws Exception {
    File dir = updatesDir();
    File[] old = dir.listFiles();
    if (old != null) for (File f : old) f.delete();
    File out = new File(dir, APK_NAME);

    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
    conn.setInstanceFollowRedirects(true);
    conn.setConnectTimeout(20000);
    conn.setReadTimeout(60000);
    try {
      int code = conn.getResponseCode();
      // Pengalihan (redirect) pun wajib berakhir di domain resmi berprotokol https.
      if (!isAllowedUrl(conn.getURL().toString())) {
        throw new UpdateException("REDIRECT_NOT_ALLOWED", "Unduhan dialihkan ke domain tak resmi.");
      }
      if (code != HttpURLConnection.HTTP_OK) {
        throw new UpdateException("HTTP_" + code, "Server menjawab " + code + ".");
      }
      long total = conn.getContentLengthLong();
      if (total > MAX_BYTES) throw new UpdateException("TOO_LARGE", "Berkas pembaruan terlalu besar.");

      MessageDigest md = MessageDigest.getInstance("SHA-256");
      long done = 0;
      int lastPct = -1;
      try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) != -1) {
          os.write(buf, 0, n);
          md.update(buf, 0, n);
          done += n;
          if (done > MAX_BYTES) throw new UpdateException("TOO_LARGE", "Berkas pembaruan terlalu besar.");
          int pct = total > 0 ? (int) (done * 100 / total) : -1;
          if (pct != lastPct) {
            lastPct = pct;
            JSObject ev = new JSObject();
            ev.put("downloaded", done);
            ev.put("total", total);
            notifyListeners("downloadProgress", ev);
          }
        }
      }
      String actual = hex(md.digest());
      if (!actual.equals(expectedSha)) {
        out.delete();
        throw new UpdateException("CHECKSUM_MISMATCH", "Berkas pembaruan tidak cocok dengan kode SHA-256 resmi.");
      }
      return out;
    } finally {
      conn.disconnect();
    }
  }

  private static String sha256Of(File f) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    try (InputStream in = new FileInputStream(f)) {
      byte[] buf = new byte[64 * 1024];
      int n;
      while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
    }
    return hex(md.digest());
  }

  private static String hex(byte[] b) {
    StringBuilder sb = new StringBuilder(b.length * 2);
    for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
    return sb.toString();
  }

  private static final class UpdateException extends IOException {
    final String code;
    UpdateException(String code, String message) {
      super(message);
      this.code = code;
    }
  }
}
