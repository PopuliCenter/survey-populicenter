'use strict';

/**
 * Migration: tambah kolom `type` (skala/jenis survei) ke tabel surveys.
 * Nilai: 'nasional' | 'daerah' | 'lainnya'. Default 'lainnya'.
 * Dipakai untuk pengelompokan/filter di explorer survei.
 * Validasi nilai dilakukan di level aplikasi (model isIn) agar fleksibel.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveys', 'type', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'lainnya',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surveys', 'type');
  },
};
