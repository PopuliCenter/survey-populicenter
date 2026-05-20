#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# init-ssl.sh — Fully non-interactive SSL setup
#
# Jalankan di VPS setelah:
#   - Domain risetcenter.com pointing ke IP VPS (A record)
#   - Port 80 terbuka
#   - docker compose up -d sudah jalan dengan nginx-http-only.conf
#
# Usage:
#   chmod +x scripts/init-ssl.sh
#   ./scripts/init-ssl.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

DOMAIN="risetcenter.com"
EMAIL="info@populicenter.org"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🔒 SSL Setup untuk $DOMAIN"
echo "  📧 Email: $EMAIL"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Pastikan pakai nginx HTTP-only config
echo "[1/5] Switching ke nginx HTTP-only config..."
if [ -f nginx-http-only.conf ]; then
    cp nginx.conf nginx.conf.ssl-backup 2>/dev/null || true
    cp nginx-http-only.conf nginx.conf
fi

# Step 2: Restart nginx
echo "[2/5] Restarting nginx..."
docker compose up -d --force-recreate nginx
echo "  Waiting 5s for nginx to start..."
sleep 5

# Step 3: Request sertifikat (fully non-interactive)
echo "[3/5] Requesting SSL certificate from Let's Encrypt..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    --force-renewal \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

# Step 4: Restore HTTPS nginx config
echo "[4/5] Activating HTTPS config..."
if [ -f nginx.conf.ssl-backup ]; then
    cp nginx.conf.ssl-backup nginx.conf
    rm nginx.conf.ssl-backup
fi

# Step 5: Restart nginx dengan HTTPS
echo "[5/5] Restarting nginx with HTTPS..."
docker compose up -d --force-recreate nginx
sleep 3

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ SSL aktif!"
echo ""
echo "  🌐 https://$DOMAIN"
echo "  🌐 https://www.$DOMAIN"
echo ""
echo "  Auto-renew aktif via certbot container."
echo "═══════════════════════════════════════════════════════════"
echo ""
