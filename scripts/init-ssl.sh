#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# init-ssl.sh
#
# Script untuk inisialisasi SSL Let's Encrypt pertama kali di VPS.
# Jalankan SEKALI saja setelah deploy pertama kali.
#
# Prasyarat:
#   - Domain risetcenter.com sudah pointing ke IP VPS (A record di Hostinger DNS)
#   - Port 80 dan 443 terbuka di firewall VPS
#   - Docker dan docker compose sudah terinstall
#   - Semua container sudah running (docker compose up -d)
#
# Usage:
#   chmod +x scripts/init-ssl.sh
#   ./scripts/init-ssl.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

DOMAIN="risetcenter.com"
EMAIL="admin@risetcenter.com"  # Ganti dengan email Anda yang valid

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🔒 SSL Setup untuk $DOMAIN"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Gunakan nginx config HTTP-only dulu
echo "[1/5] Switching ke nginx HTTP-only config..."
cp nginx.conf nginx.conf.ssl-backup
cp nginx-http-only.conf nginx.conf

# Step 2: Restart nginx dengan config HTTP-only
echo "[2/5] Restarting nginx (HTTP only)..."
docker compose up -d --force-recreate nginx
sleep 5

# Step 3: Test apakah domain bisa diakses
echo "[3/5] Testing domain accessibility..."
if curl -s -o /dev/null -w "%{http_code}" "http://$DOMAIN/.well-known/acme-challenge/test" | grep -q "404\|200"; then
    echo "  ✓ Domain $DOMAIN accessible"
else
    echo "  ✗ ERROR: Domain $DOMAIN tidak bisa diakses dari internet."
    echo "    Pastikan:"
    echo "    - A record di Hostinger DNS sudah pointing ke IP VPS"
    echo "    - Port 80 terbuka di firewall"
    echo "    - Tunggu propagasi DNS (bisa sampai 24 jam)"
    cp nginx.conf.ssl-backup nginx.conf
    rm nginx.conf.ssl-backup
    exit 1
fi

# Step 4: Request sertifikat dari Let's Encrypt
echo "[4/5] Requesting SSL certificate..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# Step 5: Restore nginx.conf HTTPS dan reload
echo "[5/5] Activating HTTPS config..."
cp nginx.conf.ssl-backup nginx.conf
rm nginx.conf.ssl-backup

docker compose up -d --force-recreate nginx
sleep 3

# Verify
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ SSL berhasil diaktifkan!"
echo ""
echo "  🌐 https://$DOMAIN"
echo "  🌐 https://www.$DOMAIN"
echo ""
echo "  Sertifikat berlaku 90 hari dan otomatis di-renew"
echo "  oleh certbot container setiap 12 jam."
echo "═══════════════════════════════════════════════════════════"
echo ""
