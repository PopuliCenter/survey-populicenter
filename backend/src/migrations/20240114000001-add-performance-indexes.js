'use strict';

/**
 * Migration: Tambah index untuk optimasi query performance.
 *
 * Index ini mempercepat:
 * - Dashboard stats (COUNT per survey)
 * - Export responses (filter by survey + date range)
 * - Quota check (count per surveyor per survey)
 * - Response detail (join answers)
 * - Unique ID validation (check duplicate answer_value per question)
 * - Audit log queries
 *
 * Menggunakan CREATE INDEX CONCURRENTLY agar tidak blocking write operations
 * di production (PostgreSQL specific).
 */
module.exports = {
  async up(queryInterface) {
    // ── responses indexes ─────────────────────────────────────────────────────

    // Dashboard + export: filter by survey_id, sort by created_at
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_survey_created
      ON responses (survey_id, created_at DESC);
    `);

    // Quota check + surveyor filter
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_survey_surveyor
      ON responses (survey_id, surveyor_id);
    `);

    // Filter by surveyor across all surveys
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_surveyor
      ON responses (surveyor_id);
    `);

    // Filter by review status (for supervisor review page)
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_review_status
      ON responses (survey_id, review_status);
    `);

    // ── answers indexes ───────────────────────────────────────────────────────

    // Join answers to response (most common query)
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_answers_response
      ON answers (response_id);
    `);

    // Unique ID check: find answer by question_id + answer_value
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_answers_question_value
      ON answers (question_id, answer_value);
    `);

    // ── audit_logs indexes ────────────────────────────────────────────────────

    // Filter audit logs by user and date
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_created
      ON audit_logs (user_id, created_at DESC);
    `);

    // Filter audit logs by action type
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action
      ON audit_logs (action, created_at DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_responses_survey_created;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_responses_survey_surveyor;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_responses_surveyor;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_responses_review_status;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_answers_response;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_answers_question_value;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_user_created;`);
    await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_action;`);
  },
};
