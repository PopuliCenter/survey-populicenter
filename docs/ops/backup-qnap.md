# Backup Off-site ke QNAP (kantor) — Populi Survey

Menyalin backup VPS (`*.dump` + `uploads_*.tar.gz`) ke **NAS QNAP di kantor
Populi Center**. Karena NAS berada di jaringan berbeda dari VPS, ini memenuhi
syarat *off-site* yang sesungguhnya.

---

## 🔑 Prinsip: QNAP **MENARIK**, VPS tidak pernah **MENDORONG**

```
QNAP (kantor, di balik NAT)  ──menarik (SSH keluar)──>  VPS
```

| | VPS push → QNAP ❌ | **QNAP pull ← VPS** ✅ |
|---|---|---|
| Kredensial disimpan di | VPS (terbuka ke internet) | QNAP (di kantor) |
| VPS diretas / kena ransomware | Penyerang punya akses tulis ke NAS → **backup ikut musnah** | Penyerang **tak punya jalan** ke NAS |
| NAS perlu dibuka ke internet? | Ya | **Tidak** |

> 🚨 **Backup yang bisa dihapus oleh mesin yang sedang diretas bukanlah backup.**
> VPS-lah yang terpapar internet, jadi kredensial harus berada di sisi yang lebih
> aman. Kunci SSH hanya ada di QNAP; VPS bahkan tidak tahu alamat NAS.

> ⚠️ **Matikan myQNAPcloud / port-forward ke NAS** bila tidak benar-benar perlu.
> NAS QNAP yang terpapar internet adalah sasaran empuk ransomware (Qlocker,
> DeadBolt). Rancangan *pull* ini **tidak memerlukan** eksposur itu — NAS cukup
> punya akses internet **keluar**.

---

## 1 · Sisi VPS — buat user yang HANYA bisa membaca backup

Jalankan sebagai root di VPS:

```bash
# User khusus, tanpa password (hanya bisa masuk lewat kunci SSH)
adduser --disabled-password --gecos "" backupro

# Beri akses BACA saja ke folder backup (ACL, agar berkas baru ikut terwarisi)
apt install -y acl rsync
setfacl -m     u:backupro:x  /var/www /var/www/survey-populicenter
setfacl -R -m  u:backupro:rX /var/www/survey-populicenter/backups
setfacl -d -m  u:backupro:r  /var/www/survey-populicenter/backups
```

## 2 · Sisi QNAP — buat kunci SSH

Masuk ke QNAP via SSH (Control Panel → Telnet/SSH → aktifkan SSH), lalu:

```bash
ssh-keygen -t ed25519 -C "qnap-backup" -f /share/homes/admin/.ssh/id_ed25519
cat /share/homes/admin/.ssh/id_ed25519.pub      # salin isinya
```

> 🔒 **Kunci PRIVAT (`id_ed25519`) tidak pernah keluar dari QNAP.** Jangan pernah
> menyalinnya ke VPS, ke repo, atau menempelkannya ke chat mana pun.

## 3 · Sisi VPS — pasang kunci publik DENGAN PEMBATASAN

Ini bagian terpenting. Kunci dipasang bersama `command=` + `restrict`, sehingga
**hanya bisa dipakai untuk rsync BACA** — tidak bisa login shell, tidak bisa
menulis, tidak bisa menghapus, walau kunci itu bocor.

```bash
install -d -m 700 -o backupro -g backupro /home/backupro/.ssh

# Cari lokasi rrsync (pembungkus rsync read-only bawaan paket rsync):
RRSYNC=$(command -v rrsync || echo /usr/share/rsync/scripts/rrsync)
echo "$RRSYNC"     # pastikan ada; kalau kosong lihat catatan di bawah

cat > /home/backupro/.ssh/authorized_keys <<EOF
command="$RRSYNC -ro /var/www/survey-populicenter/backups",restrict ssh-ed25519 AAAA...GANTI_DENGAN_KUNCI_PUBLIK_QNAP qnap-backup
EOF

chown -R backupro:backupro /home/backupro/.ssh
chmod 600 /home/backupro/.ssh/authorized_keys
```

- `-ro` → **read-only**: kunci ini secara teknis tidak mampu menulis/menghapus di VPS.
- `restrict` → matikan port-forwarding, agent-forwarding, TTY, dsb.

> Kalau `rrsync` tidak ditemukan: di Debian/Ubuntu lama ia ada di
> `/usr/share/doc/rsync/scripts/rrsync.gz` → `gunzip` lalu salin ke `/usr/local/bin/rrsync`
> dan `chmod +x`. Pada rsync modern ia sudah tersedia sebagai `/usr/bin/rrsync`.

**Uji dari QNAP** (harus berhasil membaca, dan **gagal** menulis):
```bash
rsync -e "ssh -i /share/homes/admin/.ssh/id_ed25519" \
  --list-only backupro@IP_VPS:/                      # ✅ menampilkan daftar backup
```

## 4 · Sisi QNAP — HBS 3 (Hybrid Backup Sync)

**Pasang:** App Center → cari **"Hybrid Backup Sync"** → *Install*. (Gratis, aplikasi
resmi QNAP. Di sebagian model sudah terpasang bawaan.)

**Buat job tarik:**
1. Buka **HBS 3** → **Backup & Restore** → **Create** → **New Backup Job**.
2. Sumber: pilih **Remote server** → tipe **rsync** (server Linux, via SSH).
3. Isi: host = **IP VPS**, port **22**, user **`backupro`**, autentikasi = **SSH key**
   (pilih kunci yang dibuat di langkah 2). Path sumber = `/` — karena `rrsync`
   sudah mengunci ke folder `backups` saja.
4. Tujuan: folder lokal di NAS, mis. `/Backup/populi-survey/`.
5. **Jadwal:** harian **04:00** — setelah backup VPS selesai (02:15 & 02:30).
6. **Aktifkan notifikasi email bila job gagal** (HBS 3 → Event notification).

> ⚠️ Label menu HBS 3 berbeda-beda antar versi QTS/QuTS dan versi HBS. Kalau
> tidak menemukan opsi persis seperti di atas, cari job bertipe **Sync/Backup**
> dengan sumber **rsync remote**. Prinsipnya sama: **NAS menarik dari VPS**.

**Alternatif tanpa HBS 3** (kalau HBS bermasalah — ini pasti jalan): buat cron di
QNAP (Control Panel → *Task Scheduler*, atau `crontab -e` via SSH):
```cron
0 4 * * *  rsync -az --delete -e "ssh -i /share/homes/admin/.ssh/id_ed25519 -o StrictHostKeyChecking=yes" backupro@IP_VPS:/ /share/Backup/populi-survey/
```

## 5 · Snapshot — WAJIB

**RAID bukan backup, dan mirror bukan riwayat.** Kalau arsip di VPS korup atau
terhapus, sinkron akan dengan patuh menyalin kerusakan itu ke NAS dan menimpa
salinan yang bagus.

QNAP → **Storage & Snapshots** → aktifkan **Snapshot** pada volume tujuan:
- Jadwal harian, simpan mis. **30 snapshot**.
- Snapshot bersifat *read-only* → ransomware yang mengenkripsi berkas **tidak**
  bisa merusaknya, dan Anda bisa mundur ke titik mana pun.

## 6 · Pantau bahwa tarikannya benar-benar terjadi

Sinkron yang diam-diam berhenti = kembali ke titik nol tanpa Anda sadari.

**Cara paling sederhana:** setelah job HBS sukses, biarkan `ops-check.sh` di VPS
memantau **kesegaran berkas di NAS** tidak mungkin (VPS tak melihat NAS). Jadi
pantau dari **sisi QNAP**:

- **HBS 3 → Event notification** → kirim email bila job **gagal**.
- Lebih kuat: tambahkan *dead man's switch* — di Task Scheduler QNAP, setelah
  rsync sukses, ping Healthchecks.io:
  ```bash
  0 4 * * *  rsync -az --delete -e "ssh -i /share/homes/admin/.ssh/id_ed25519" backupro@IP_VPS:/ /share/Backup/populi-survey/ && curl -fsS -m 10 https://hc-ping.com/UUID-QNAP-JOB
  ```
  Kalau tarikan berhenti (NAS mati, listrik padam, internet kantor putus, kunci
  dicabut), **tidak ada ping** → Healthchecks mengalarm Anda. Kegagalan senyap
  inilah yang paling berbahaya dan tak bisa dideteksi dari VPS.

---

## 7 · Keamanan — ini data responden

Isi backup = **seluruh data pribadi responden** (jawaban, foto, rekaman audio,
tanda tangan). Perlakukan NAS setara server produksi:

- [ ] **myQNAPcloud / UPnP / port-forward ke NAS: MATIKAN** (kecuali benar-benar perlu)
- [ ] Akun `admin` bawaan **dinonaktifkan**; pakai akun lain + **2FA**
- [ ] **Enkripsi volume** NAS
- [ ] **Firmware QNAP selalu terbaru** (ransomware QNAP masuk lewat lubang lama)
- [ ] Akses jarak jauh (bila perlu) lewat **VPN**, bukan NAS yang dibuka ke internet
- [ ] Snapshot aktif (langkah 5)

## 8 · Jangan berhenti di satu salinan

QNAP di kantor melindungi dari **VPS hilang**. Ia **tidak** melindungi dari
kantor kebakaran, kebanjiran, atau NAS dicuri.

Aturan **3-2-1**: 3 salinan, 2 media, **1 di luar lokasi**. Backup Anda kecil
(~31 MB) — menambahkan satu salinan cloud (Backblaze B2) biayanya praktis nol.
➜ [`scripts/BACKUP.md`](../../scripts/BACKUP.md) bagian *Salinan luar server*.

| Salinan | Melindungi dari | Status |
|---|---|---|
| `backups/` di VPS | kesalahan aplikasi, salah hapus data | ✅ |
| **QNAP kantor** | **VPS hilang/diretas** | ⬅ dokumen ini |
| Cloud (B2) | kantor & VPS hilang sekaligus | ⏳ disarankan |
