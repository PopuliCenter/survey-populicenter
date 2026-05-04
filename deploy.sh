#!/bin/bash
# ── Deploy Script untuk VPS ──────────────────────────────────────────────────
# Jalankan di VPS: bash deploy.sh
# Atau untuk update: bash deploy.sh update

set -e

REPO_URL="https://github.com/PopuliCenter/survey-populicenter.git"
APP_DIR="/opt/survey-populicenter"

echo "═══════════════════════════════════════════════"
echo "  Populi Center — Survey Platform Deploy"
echo "═══════════════════════════════════════════════"

# ── First time setup ──────────────────────────────────────────────────────────
if [ "$1" != "update" ]; then
  echo ""
  echo "▶ Step 1: Install Docker..."
  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "  ✓ Docker installed"
  else
    echo "  ✓ Docker already installed"
  fi

  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    apt-get update && apt-get install -y docker-compose-plugin
    echo "  ✓ Docker Compose installed"
  else
    echo "  ✓ Docker Compose already available"
  fi

  echo ""
  echo "▶ Step 2: Clone repository..."
  if [ -d "$APP_DIR" ]; then
    echo "  Directory exists, pulling latest..."
    cd "$APP_DIR"
    git pull origin main
  else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi

  echo ""
  echo "▶ Step 3: Setup environment..."
  if [ ! -f .env ]; then
    # Generate secure secrets
    JWT_SECRET=$(openssl rand -hex 64)
    SESSION_SECRET=$(openssl rand -hex 64)
    DB_PASSWORD=$(openssl rand -hex 32)

    cat > .env << EOF
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
FRONTEND_URL=http://$(curl -s ifconfig.me)
EOF
    echo "  ✓ .env created with generated secrets"
    echo "  ⚠ Edit .env to set FRONTEND_URL to your domain"
  else
    echo "  ✓ .env already exists"
  fi

  echo ""
  echo "▶ Step 4: Build and start services..."
  docker compose up -d --build

  echo ""
  echo "▶ Step 5: Run database migrations..."
  sleep 10  # Wait for postgres to be ready
  docker compose exec -T backend npx sequelize-cli db:migrate --config src/config/database.js --migrations-path src/migrations

  echo ""
  echo "▶ Step 6: Seed default admin..."
  docker compose exec -T backend npx sequelize-cli db:seed:all --config src/config/database.js --seeders-path src/seeders || true

  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  ✓ Deploy selesai!"
  echo ""
  echo "  Web app:  http://$(curl -s ifconfig.me)"
  echo "  API:      http://$(curl -s ifconfig.me):3000"
  echo ""
  echo "  Default admin:"
  echo "    Email:    admin@populicenter.com"
  echo "    Password: Admin123!"
  echo ""
  echo "  ⚠ SEGERA ganti password admin setelah login!"
  echo "  ⚠ Edit .env untuk set FRONTEND_URL ke domain Anda"
  echo "═══════════════════════════════════════════════"

# ── Update existing deployment ────────────────────────────────────────────────
else
  echo ""
  echo "▶ Updating deployment..."
  cd "$APP_DIR"
  git pull origin main
  docker compose up -d --build --force-recreate backend worker nginx
  docker compose exec -T backend npx sequelize-cli db:migrate --config src/config/database.js --migrations-path src/migrations
  echo ""
  echo "  ✓ Update selesai!"
fi
