# Draf "App access" untuk Peninjau Google Play

> Aplikasi ini terkunci login, jadi Play Console → **App access** WAJIB diisi.
> Pilih **"All or some functionality is restricted"**, lalu tambahkan satu
> instruksi dengan kredензial akun demo. Teks untuk peninjau sebaiknya dalam
> **Bahasa Inggris** (peninjau global), dengan label tombol Indonesia dalam
> kurung agar mudah dicocokkan.
>
> **PENTING:** siapkan dulu akun demo sesuai **Bagian C** di bawah — kalau tidak,
> peninjau bisa gagal masuk (kunci perangkat) atau terhalang GPS/izin, dan
> aplikasi bisa DITOLAK.

---

## A. Isian "Instructions" (tempel ke Play Console — Bahasa Inggris)

```
This app is a private data-collection tool for authorized field surveyors of
Populi Center. All features require a login provided by our administrator.

Demo account (surveyor):
  Username / email: [ISI: email akun demo]
  Password: [ISI: kata sandi akun demo]

Steps to review the main features:
1. Open the app and sign in with the demo account above (login screen "Masuk").
2. You will see the survey list ("Daftar Survei"). A sample survey titled
   "(sampel) ..." is already assigned to this account.
3. Tap the sample survey, then tap "Lanjutkan Mengisi" (Continue) or start a new
   entry to open the questionnaire (one question per screen, "Selanjutnya" = Next).
4. The app is designed to work fully OFFLINE; when online it syncs automatically.
5. This demo survey does not require GPS/camera/microphone, so it can be reviewed
   on an emulator without those sensors.

Note: The app does NOT use background location. Location is only used in the
foreground to tag the interview point for quality control, and only on surveys
that require it (the demo survey does not).

Contact for review questions: [ISI: email dukungan]
```

## B. Versi Bahasa Indonesia (opsional, bila ingin dilampirkan)

```
Aplikasi ini alat pengumpulan data khusus petugas survei resmi Populi Center.
Semua fitur memerlukan login dari administrator kami.

Akun demo (petugas):
  Email: [ISI: email akun demo]
  Kata sandi: [ISI: kata sandi akun demo]

Langkah meninjau fitur utama:
1. Buka aplikasi, masuk dengan akun demo di atas (layar "Masuk").
2. Muncul "Daftar Survei". Survei "(sampel) ..." sudah ditugaskan ke akun ini.
3. Ketuk survei sampel, lalu "Lanjutkan Mengisi" atau mulai isian baru untuk
   membuka kuesioner.
4. Aplikasi bekerja penuh offline; sinkron otomatis saat daring.
5. Survei demo ini tidak mewajibkan GPS/kamera/mikrofon.
```

---

## C. Checklist SIAPKAN AKUN DEMO (kerjakan sebelum submit ke review)

Kesalahan di sini = peninjau tak bisa masuk = aplikasi ditolak.

1. **Buat akun petugas khusus demo** lewat dashboard (mis. `reviewer@populicenter.org`
   atau `demo.tpd`). Jangan pakai akun petugas asli.
2. **Tugaskan ke satu survei "(sampel)"** yang berstatus **aktif**, dan beri
   **kuota > 0** agar survei muncul & bisa diisi. (Idealnya survei sampel yang
   sudah ada isinya, supaya "Lanjutkan Mengisi" langsung tampil.)
3. **Kunci perangkat: NONAKTIF** pada survei demo tsb (Field Tools → Kunci
   Perangkat = Bebas/Off). Kalau aktif, akun akan terikat ke HP pertama dan
   peninjau Google DITOLAK login. Bila akun terlanjur terikat, tekan **Reset
   Perangkat** di Manajemen TPD sebelum submit.
4. **GPS/kamera/mikrofon: opsional/disabled** pada survei demo — agar bisa
   ditinjau di emulator tanpa sensor & tanpa terblokir "GPS wajib".
5. **Jangan hapus/nonaktifkan akun demo** selama aplikasi masih dalam peninjauan
   maupun setelah terbit (Google menguji ulang saat update).
6. Uji sendiri dulu: **logout dari semua perangkat, login dengan akun demo di HP
   bersih**, pastikan bisa masuk sampai membuka kuesioner tanpa hambatan.

> Alternatif paling aman: rilis lewat **Internal Testing / Closed Testing** —
> peninjauannya lebih ringan dan masalah "login peninjau" praktis hilang karena
> penguji adalah daftar email yang Anda tentukan sendiri.
