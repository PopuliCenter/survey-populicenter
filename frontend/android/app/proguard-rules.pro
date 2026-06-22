# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ─── Capacitor & plugin (cegah R8 men-strip kelas yang dipakai via refleksi) ──
# Tanpa ini, build rilis (minifyEnabled true) bisa crash padahal debug normal.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# Plugin Cordova yang dijembatani Capacitor
-keep class org.apache.cordova.** { *; }

# JavascriptInterface (jembatan WebView ⇄ native)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Kelas aplikasi (plugin lokal, bila ada)
-keep class com.populicenter.survey.** { *; }

# Simpan info baris untuk stack trace rilis yang terbaca (deobfuscation di Play)
-keepattributes SourceFile,LineNumberTable
