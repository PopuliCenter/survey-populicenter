# Backup Off-site ke QNAP (kantor) — Populi Survey

Menyalin backup VPS (`*.dump` + `uploads_*.tar.gz`) ke **NAS QNAP di kantor
Populi Center**. Karena NAS berada di jaringan berbeda dari VPS, ini memenuhi
syarat *off-site* yang sesungguhnya.

> ⚠️ **Status:** terpasang 15 Jul 2026, namun tarikan **berhenti diam-diam sejak
> 24 Sep 2026** (lihat §4 "Insiden"). Pasang ulang dengan versi **tahan-reboot**
> (`scripts/qnap/`) — NAS `PopuliCenter` (TS-431P2) menarik dari VPS tiap
> **04:00** → `/share/Backup/populi-survey/`.
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

**Alternatif tanpa HBS 3 — INI YANG DIPAKAI: cron tahan-reboot** (`scripts/qnap/`)

> 🚨 **Insiden 24 Sep – Okt 2026:** tarikan berhenti diam-diam ±4 minggu. Versi
> lama menaruh kunci di `/mnt/HDA_ROOT/.config` (bisa terhapus update firmware)
> dan `known_hosts` di `~/.ssh` (RAM-disk / tak terbaca cron) → setelah NAS
> restart/update, SSH gagal *"Host key verification failed"* tiap malam. Lalu
> alarm Healthchecks **dimatikan dengan ping manual dari browser** — yang
> menyembunyikan kegagalan. **Jangan pernah ping manual.**

Tiga jebakan QTS yang ditutup versi ini:

| Jebakan | Akibat | Penangkal |
|---|---|---|
| `crontab -e` saja | jadwal **hilang** saat reboot (dibangun ulang dari `/etc/config/crontab`) | `ensure-cron.sh` menulis ke `/etc/config/crontab` (tugas sistem QTS dipertahankan) |
| `/root/.ssh`, `/tmp` | **RAM-disk**, kosong tiap reboot | kunci + `known_hosts` di volume data `/share/Backup/.populi` |
| `/mnt/HDA_ROOT/.config` | bisa **terhapus update firmware** | idem — volume data |

Isi `/share/Backup/.populi/` (folder admin-only — share `Backup` berisi data
pribadi responden, **wajib** hanya admin):

- `populi-pull.sh` — salinan [`scripts/qnap/populi-pull.sh`](../../scripts/qnap/populi-pull.sh)
- `ensure-cron.sh` — salinan [`scripts/qnap/ensure-cron.sh`](../../scripts/qnap/ensure-cron.sh)
- `populi.conf` — `VPS_HOST=` dan `HC_URL=` (**tak masuk repo**)
- `id_ed25519`, `known_hosts` — identitas SSH ke `backupro`

**Pasang** (SSH ke QNAP sebagai admin; tempel skrip lewat *heredoc* — **jangan**
menyalin dari checkout Windows lewat SMB, akhir baris CRLF merusak `sh`):

```bash
mkdir -p /share/Backup/.populi && chmod 700 /share/Backup/.populi

# Kunci: pindahkan yang lama ke lokasi persisten, atau buat baru bila sudah hilang
for k in /share/homes/admin/.ssh/id_ed25519 /mnt/HDA_ROOT/.config/ssh/id_ed25519 /root/.ssh/id_ed25519; do
  [ -f "$k" ] && cp "$k" /share/Backup/.populi/id_ed25519 && echo "kunci disalin dari $k" && break
done
[ -f /share/Backup/.populi/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -C qnap-backup -f /share/Backup/.populi/id_ed25519
chmod 600 /share/Backup/.populi/id_ed25519

printf 'VPS_HOST=%s\nHC_URL=%s\n' IP_VPS https://hc-ping.com/UUID-QNAP-JOB > /share/Backup/.populi/populi.conf
chmod 600 /share/Backup/.populi/populi.conf

# (tempel populi-pull.sh & ensure-cron.sh ke folder ini via cat > … <<'EOF')
sed -i 's/\r$//' /share/Backup/.populi/*.sh && chmod 700 /share/Backup/.populi/*.sh

sh /share/Backup/.populi/ensure-cron.sh                  # pasang jadwal 04:00 (idempoten)
sh /share/Backup/.populi/populi-pull.sh; echo "exit=$?"  # uji sekarang
tail -30 /share/Backup/populi-survey-rsync.log
```

Bila kunci **baru** dibuat (`ssh-keygen` jalan), daftarkan kunci publiknya di VPS
seperti §1 (baris `command="$RRSYNC -ro …",restrict <isi id_ed25519.pub>`).

**Verifikasi host key** (sekali, setelah uji pertama — `accept-new` mempercayai
koneksi pertama, lalu MENOLAK bila host key VPS kelak berubah):
```bash
ssh-keygen -lf /share/Backup/.populi/known_hosts          # di QNAP
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub          # di VPS — sidik jari HARUS sama
```

**Setelah update firmware QTS:** jalankan ulang `sh /share/Backup/.populi/ensure-cron.sh`.
Opsional: aktifkan *Control Panel → Hardware → "Run user defined startup processes
(autorun.sh)"* dan panggil skrip yang sama dari `autorun.sh` (cara memasang
`autorun.sh` berbeda per model — ikuti panduan QNAP untuk TS-431P2). Healthchecks
tetap menjadi jaring pengaman: jadwal yang hilang = tak ada ping = alarm.

Jadwal **04:00** — setelah backup VPS selesai (02:15 DB, 02:30 media). Log
`populi-survey-rsync.log` memuat `=== START …` / `=== END rc=… ===` per run
(membedakan "tak ada berkas baru" dari "cron tak jalan"), dirotasi bila >5 MB.

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
- **Dead man's switch (terpasang di `populi-pull.sh`)** — melapor ke Healthchecks.io:
  `/start` saat mulai, lalu `/<exit-code>` dengan ekor log sebagai body. Hasilnya:
  - tarikan **gagal** → alarm **seketika**, dan pesan errornya (`Host key
    verification failed`, `Permission denied`, disk penuh, …) **tampil langsung**
    di detail event Healthchecks — tak perlu SSH ke NAS untuk tahu sebabnya;
  - tarikan **berhenti** (NAS mati, listrik padam, internet kantor putus, jadwal
    hilang) → **tak ada ping** → alarm setelah masa tenggang.

  Atur check di Healthchecks: **Period 1 hari, Grace 2 jam**, notifikasi ke email/WA.

  > 🚫 **Jangan pernah membuka URL ping di browser untuk "menghijaukan" alarm.**
  > Itu persis yang menyembunyikan insiden 24 Sep: event `HTTPS POST … Mozilla/5.0
  > (Windows)` = ping manual, bukan backup. Ping asli selalu `curl/…` dari IP
  > kantor ±04:0x. Alarm merah = perbaiki tarikannya, bukan bungkam alarmnya.

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
