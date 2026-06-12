require('dotenv').config();

// Connection pool — penting saat banyak TPD menyinkron bersamaan.
// Total koneksi = (jumlah worker cluster) × max. Default 20 → 2×20=40,
// masih aman di bawah Postgres max_connections default (100).
// Naikkan DB_POOL_MAX saat load test / produksi padat (pertimbangkan PgBouncer).
const pool = {
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
  acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
  idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
};

const common = {
  dialect: 'postgres',
  logging: false,
  define: {
    underscored: true,
    timestamps: true,
  },
  pool,
};

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'yourpassword',
    database: process.env.DB_NAME || 'web_survey_platform',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    ...common,
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'yourpassword',
    database: process.env.DB_NAME_TEST || 'web_survey_platform_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    ...common,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    ...common,
    ...(process.env.DB_SSL === 'true'
      ? {
          dialectOptions: {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          },
        }
      : {}),
  },
};
