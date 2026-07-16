FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY src/ ./src/
COPY .sequelizerc ./
COPY uploads/ ./uploads/
# Skrip admin one-off (faktor 12) — mis. loadtest-seed.cjs dijalankan via
# `docker compose exec backend node scripts/...`
COPY scripts/ ./scripts/

# Create uploads directories
RUN mkdir -p uploads/photos uploads/audio uploads/signatures uploads/exports

EXPOSE 3000

# Auto-migrate saat start (hanya bila RUN_MIGRATIONS=1 — disetel di compose
# untuk service backend saja; worker memakai image ini tanpa env tsb).
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]

CMD ["node", "src/app.js"]
