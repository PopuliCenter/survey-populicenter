#!/bin/bash
# Jalankan migrasi dan seeder di dalam container backend
echo "Running database migrations..."
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:migrate
echo ""
echo "Running seeders..."
docker compose exec backend node node_modules/sequelize-cli/lib/sequelize db:seed:all
echo ""
echo "Done!"
