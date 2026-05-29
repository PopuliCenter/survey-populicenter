require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'yourpassword',
    database: process.env.DB_NAME || 'web_survey_platform',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'yourpassword',
    database: process.env.DB_NAME_TEST || 'web_survey_platform_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
    // Connection pool — penting saat banyak TPD menyinkron bersamaan.
    // Total koneksi = (jumlah worker cluster) × max. Dengan 2 worker → 2×15=30,
    // masih aman di bawah Postgres max_connections default (100).
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 15,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
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
