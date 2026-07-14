# Backup Off-site ke QNAP (kantor) — Populi Survey

Menyalin backup VPS (`*.dump` + `uploads_*.tar.gz`) ke **NAS QNAP di kantor
Populi Center**. Karena NAS berada di jaringan berbeda dari VPS, ini memenuhi
syarat *off-site* yang sesungguhnya.

> ✅ **Sudah terpasang & teruji (15 Jul 2026).** NAS `PopuliCenter` (TS-431P2)
> menarik dari VPS tiap **04:00** → `/share/Backup/populi-survey/`.
> Kunci `backupro` terbukti **ditolak** saat mencoba menjalankan perintah non-rsync.
>
> Dokumen ini memakai placeholder `IP_VPS` — **jangan menuliskan IP asli VPS di
> repo**. Itu IP asal di balik Cloudflare; membocorkannya memudahkan penyerang
> melewati WAF/rate-limit Cloudflare dengan menyerang server langsung.

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

**Alternatif tanpa HBS 3 — INI YANG DIPAKAI** (sudah terpasang & teruji):

> 🚨 **`crontab -e` saja TIDAK CUKUP di QNAP.** QTS **menimpa** crontab dari
> `/etc/config/crontab` saat reboot — jadwal Anda akan **hilang diam-diam**.
> Harus ditulis ke `/etc/config/crontab`, lalu di-load ulang:

```bash
cp /etc/config/crontab /etc/config/crontab.bak     # cadangkan dulu

echo '0 4 * * * { date; /usr/bin/rsync -az --stats -e "ssh -i /mnt/HDA_ROOT/.config/ssh/id_ed25519 -o StrictHostKeyChecking=yes" backupro@IP_VPS:/ /share/Backup/populi-survey/; echo "---"; } >> /share/Backup/populi-survey-rsync.log 2>&1' >> /etc/config/crontab

crontab /etc/config/crontab
/etc/init.d/crond.sh restart
crontab -l | grep populi                            # pastikan ada
```

Jadwal **04:00** — setelah backup VPS selesai (02:15 DB, 02:30 media).

**Kenapa dibungkus `{ date; ...; echo "---"; }`:** rsync **tidak mencetak apa pun**
bila tak ada berkas baru. Tanpa `date`, log kosong karena *"tidak ada yang baru"*
akan **terlihat identik** dengan log kosong karena *"cron tak pernah jalan"* —
tepat jenis kegagalan senyap yang sedang kita cegah. Dengan stempel waktu, log
membuktikan cron benar-benar berjalan.

**Catatan path:** kunci ada di `/mnt/HDA_ROOT/.config/ssh/` (partisi sistem QNAP;
`~/.ssh` adalah symlink ke sana). Cron tidak selalu memahami `~`, jadi **pakai
path absolut**. ⚠️ Update firmware QTS dapat menghapus `/mnt/HDA_ROOT/.config` —
bila sinkron tiba-tiba berhenti setelah update, buat ulang kuncinya.

## 5 · 🚨 JANGAN pakai `--delete` (dan kenapa itu justru menyelamatkan Anda)

Ini keputusan terpenting di seluruh dokumen ini.

Setiap backup kita adalah **berkas baru berstempel waktu**
(`web_survey_platform_20260715_021500.dump`, `uploads_20260715_023000.tar.gz`) —
bukan berkas yang ditimpa. Karena itu, rsync **tanpa** `--delete` menghasilkan
**riwayat alami** di NAS: berkas lama menumpuk dan **tidak pernah** dihapus dari
sisi NAS.

| | `--delete` ❌ | **tanpa `--delete`** ✅ |
|---|---|---|
| VPS merotasi backup (retensi 14) | NAS ikut **menghapus** → riwayat NAS ikut terpangkas | NAS **menyimpan lebih lama** dari VPS |
| Penyerang menghapus `backups/` di VPS | Sinkron berikutnya **menghapusnya juga di NAS** → backup musnah | NAS **tetap utuh** |
| Arsip di VPS korup | Tersalin, tapi yang lama tetap ada | Sama — yang lama tetap ada |

> Dengan `--delete`, satu perintah `rm -rf` di VPS (atau ransomware) akan
> **direplikasi dengan patuh** ke NAS pada sinkron berikutnya. Itu mengubah
> backup Anda menjadi sekadar cermin — dan cermin bukan backup.

**Konsekuensi:** folder NAS akan tumbuh terus. Itu disengaja. Backup Anda kecil
(±31 MB/hari) — 1 tahun ≈ 11 GB, tak berarti untuk NAS. Pangkas **manual** sesekali
(mis. sisakan 1 berkas per bulan untuk arsip lama), **jangan** otomatis dari VPS.

### Snapshot (kalau model NAS Anda mendukung)

QNAP → **Storage & Snapshots** → aktifkan **Snapshot** pada volume tujuan
(harian, simpan mis. 30). Snapshot bersifat *read-only* → ransomware yang
mengenkripsi berkas **tidak** bisa merusaknya.

> ⚠️ **TS-431P2 kemungkinan tidak mendukung Snapshot** (ARM kelas entry, RAM
> kecil — di luar daftar dukungan snapshot QNAP). Cek sendiri di *Storage &
> Snapshots*; bila menu-nya tidak ada/abu-abu, berarti tidak didukung.
>
> **Itu tidak apa-apa** — justru karena itulah aturan "tanpa `--delete`" di atas
> menjadi **wajib, bukan opsional**: penumpukan berkas berstempel waktu adalah
> pengganti riwayat/snapshot Anda.

## 6 · Pantau bahwa tarikannya benar-benar terjadi

Sinkron yang diam-diam berhenti = kembali ke titik nol tanpa Anda sadari.

**Cara paling sederhana:** setelah job HBS sukses, biarkan `ops-check.sh` di VPS
memantau **kesegaran berkas di NAS** tidak mungkin (VPS tak melihat NAS). Jadi
pantau dari **sisi QNAP**:

- **HBS 3 → Event notification** → kirim email bila job **gagal**.
- Lebih kuat: tambahkan *dead man's switch* — di Task Scheduler QNAP, setelah
  rsync sukses, ping Healthchecks.io:
  ```bash
  0 4 * * *  rsync -az -e "ssh -i /share/homes/admin/.ssh/id_ed25519" backupro@IP_VPS:/ /share/Backup/populi-survey/ && curl -fsS -m 10 https://hc-ping.com/UUID-QNAP-JOB
  ```
  Kalau tarikan berhenti (NAS mati, listrik padam, internet kantor putus, kunci
  dicabut), **tidak ada ping** → Healthchecks mengalarm Anda. Kegagalan senyap
  inilah yang paling berbahaya dan tak bisa dideteksi dari VPS.

---

## 7 · Keamanan — ini data responden

Isi backup = **seluruh data pribadi responden** (jawaban, foto, rekaman audio,
tanda tangan). Perlakukan NAS setara server produksi.

> 🚨 **NAS Populi Center (TS-431P2) saat ini PUNYA Public IP aktif** dan Smart URL
> myQNAPcloud → **terjangkau dari internet publik**. Model *pull* di dokumen ini
> **tidak memerlukan itu sama sekali** (NAS hanya perlu koneksi **keluar**).
> NAS QNAP yang terpapar internet adalah sasaran kampanye ransomware massal
> (Qlocker, DeadBolt) yang masuk lewat lubang firmware — dan NAS ini akan
> menyimpan seluruh data responden. **Tutup aksesnya.**

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
