package com.populicenter.survey;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * DeviceSetup — status kesiapan HP TPD untuk kartu pengingat di Daftar Survei
 * (izin notifikasi/lokasi/kamera/mikrofon + GPS menyala) dan pembuka halaman
 * pengaturan yang tepat bila Android sudah tak mau memunculkan dialog izin.
 *
 * Dibaca langsung dari Android (bukan dari WebView) karena status izin WebView
 * tak selalu mencerminkan izin aplikasi, dan layanan lokasi (GPS) tak terbaca
 * dari plugin Capacitor mana pun.
 */
@CapacitorPlugin(name = "DeviceSetup")
public class DeviceSetupPlugin extends Plugin {

  // Kanal pesan admin (frontend/src/utils/pushNotifications.js PESAN_CHANNEL_ID).
  private static final String MESSAGE_CHANNEL_ID = "pesan-masuk";

  private boolean granted(String permission) {
    return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
  }

  private static boolean locationServiceOn(Context ctx) {
    LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
    if (lm == null) return true; // tak bisa dibaca → jangan ganggu TPD
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled();
    return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
      || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
  }

  /** Notifikasi aplikasi menyala DAN kanal pesan admin tidak dibisukan. */
  private boolean notificationsOn() {
    Context ctx = getContext();
    if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      NotificationChannel ch = nm != null ? nm.getNotificationChannel(MESSAGE_CHANNEL_ID) : null;
      if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
    }
    return true;
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    JSObject r = new JSObject();
    r.put("notifications", notificationsOn());
    r.put("location", granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION));
    r.put("locationService", locationServiceOn(getContext()));
    r.put("camera", granted(Manifest.permission.CAMERA));
    r.put("microphone", granted(Manifest.permission.RECORD_AUDIO));
    call.resolve(r);
  }

  /** target: 'notifications' | 'location' (GPS) | 'app' (izin aplikasi). */
  @PluginMethod
  public void openSettings(PluginCall call) {
    Context ctx = getContext();
    String target = call.getString("target", "app");
    Intent i;
    if ("notifications".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
      i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
    } else if ("location".equals(target)) {
      i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
    } else {
      i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
    }
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    try {
      ctx.startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject("Pengaturan tak bisa dibuka.", "NO_SETTINGS", e);
    }
  }
}
