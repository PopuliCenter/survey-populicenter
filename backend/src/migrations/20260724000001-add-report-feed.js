'use strict';

/**
 * Tambah kolom "Tarik ke Spreadsheet" (feed CSV bertoken) ke tabel surveys.
 *   report_feed_token       — token rahasia pada URL feed (akses baca CSV tanpa login)
 *   report_feed_enabled     — saklar aktif/nonaktif feed
 *   report_feed_include_raw — izinkan feed data mentah per responden (sensitif; opt-in)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveys', 'report_feed_token', {
      type: Sequelize.STRING(64),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('surveys', 'report_feed_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('surveys', 'report_feed_include_raw', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    // Indeks untuk pencarian survei by token pada endpoint publik.
    await queryInterface.addIndex('surveys', ['report_feed_token'], {
      name: 'surveys_report_feed_token_idx',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('surveys', 'surveys_report_feed_token_idx');
    await queryInterface.removeColumn('surveys', 'report_feed_include_raw');
    await queryInterface.removeColumn('surveys', 'report_feed_enabled');
    await queryInterface.removeColumn('surveys', 'report_feed_token');
  },
};
