'use strict';

/**
 * Pengecualian respons dari laporan (kasus oversampling menambal data fraud):
 * respons TIDAK dihapus, hanya ditandai `excluded` + alasan + jejak siapa/kapan.
 * Semua keluaran klien (snapshot publik/embed, PPTX, ekspor XLSX/CSV) otomatis
 * mengabaikan baris excluded; baris tetap tampil di dashboard sebagai bukti audit.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('responses', 'excluded', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('responses', 'exclude_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('responses', 'excluded_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('responses', 'excluded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Indeks parsial: baris excluded selalu minoritas — mempercepat filter
    // chip "Dikecualikan" dan hitungan ringkasan tanpa membebani baris normal.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_responses_excluded
      ON responses (survey_id)
      WHERE excluded
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_responses_excluded');
    await queryInterface.removeColumn('responses', 'excluded_at');
    await queryInterface.removeColumn('responses', 'excluded_by');
    await queryInterface.removeColumn('responses', 'exclude_reason');
    await queryInterface.removeColumn('responses', 'excluded');
  },
};
