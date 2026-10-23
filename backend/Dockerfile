FROM node:22-alpine

WORKDIR /app

# Install dependencies
# Build tools SEMENTARA untuk modul native (bcrypt): di Alpine/musl prebuilt
# binary untuk ABI Node 22 bisa tidak tersedia → bcrypt dikompilasi dari source.
# Dipasang lalu dihapus dalam satu layer agar image tetap ramping.
COPY package.json package-lock.json* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && (if [ -f package-lock.json ]; then npm ci; else npm install; fi) \
 && apk del .build-deps

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
