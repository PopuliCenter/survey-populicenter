'use strict';

/**
 * Migration (bug M3): partial index untuk mempercepat COUNT kuota.
 *
 * Hot path kuota = COUNT(*) WHERE survey_id=? AND surveyor_id=?
 * AND questionnaire_number NOT LIKE 'PENDING-%'. Partial index ini hanya
 * mengindeks baris yang SUDAH committed, sehingga predikat NOT LIKE tidak lagi
 * jadi filter residual yang melambat saat PENDING menumpuk.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_responses_committed
      ON responses (survey_id, surveyor_id)
      WHERE questionnaire_number NOT LIKE 'PENDING-%'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_responses_committed');
  },
};
