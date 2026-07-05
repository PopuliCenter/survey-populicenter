'use strict';

/**
 * Migration: perbaiki index review_status.
 *
 * BUG: migrasi 20240107 membuat `idx_responses_review_status` pada
 * (review_status) saja. Migrasi 20240114 lalu mencoba membuat index KOMPOSIT
 * (survey_id, review_status) dengan NAMA YANG SAMA + `IF NOT EXISTS` → jadi
 * NO-OP. Akibatnya index komposit tak pernah terbentuk, dan hot-path supervisor
 * `WHERE survey_id IN (...) AND review_status = ...` (dashboard/responses) hanya
 * dilayani index single-kolom selektivitas rendah (3 nilai) → rawan seq-scan.
 *
 * Perbaikan: drop index single-kolom lama, buat komposit dengan NAMA BERBEDA.
 * CONCURRENTLY (tanpa transaksi) agar tidak mengunci write di produksi.
 */
module.exports = {
  async up(queryInterface) {
    // Buat komposit dulu (nama baru) → query tetap terlayani saat transisi.
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_survey_review
      ON responses (survey_id, review_status);
    `);
    // Baru drop index single-kolom lama yang selektivitasnya rendah.
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_responses_review_status;`
    );
  },

  async down(queryInterface) {
    // Balikkan: buat lagi single-kolom, drop komposit.
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_review_status
      ON responses (review_status);
    `);
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_responses_survey_review;`
    );
  },
};
