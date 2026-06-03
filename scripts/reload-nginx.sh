#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# reload-nginx.sh — Reload Nginx config tanpa restart container
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "🔄 Testing nginx config..."
docker compose exec nginx nginx -t

echo "✅ Config valid"
echo ""

echo "🔄 Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "✅ Nginx reloaded successfully"
echo ""
echo "🌐 Changes should be live now at https://risetcenter.com"
