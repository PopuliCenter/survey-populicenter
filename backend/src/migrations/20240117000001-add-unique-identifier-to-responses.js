'use strict';

/**
 * Migration: tambah kolom `unique_identifier` ke responses + partial UNIQUE index.
 *
 * Mengatasi bug C2: nomor kuesioner (jawaban pertanyaan unique_id) sebelumnya
 * hanya dicek di level aplikasi sebelum transaksi (TOCTOU) sehingga submit
 * konkuren bisa menghasilkan responden dengan nomor sama. Constraint UNIQUE
 * (survey_id, unique_identifier) menegakkan keunikan di level DB, tidak
 * bergantung tanggal, dan tahan race.
 *
 * Partial index (WHERE unique_identifier IS NOT NULL) agar response tanpa
 * unique_id (NULL) tidak saling bentrok.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('responses', 'unique_identifier', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    // Backfill nilai dari jawaban unique_id yang sudah ada (best-effort) agar
    // index unik bisa dibuat tanpa bentrok pada data lama.
    await queryInterface.sequelize.query(`
      UPDATE responses r
      SET unique_identifier = a.answer_value
      FROM answers a
      JOIN questions q ON q.id = a.question_id
      WHERE a.response_id = r.id
        AND q.type = 'unique_id'
        AND a.answer_value IS NOT NULL
        AND a.answer_value <> ''
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_responses_survey_unique_identifier
      ON responses (survey_id, unique_identifier)
      WHERE unique_identifier IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS uq_responses_survey_unique_identifier'
    );
    await queryInterface.removeColumn('responses', 'unique_identifier');
  },
};
