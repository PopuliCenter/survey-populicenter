'use strict';

/**
 * Migration: tambah kolom region_targets ke surveys.
 *
 * Menyimpan rencana target sampling per provinsi (random sampling design),
 * diisi manual admin saat setup survei.
 * Format: [{ province: "JAWA BARAT", target: 500 }, ...]
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveys', 'region_targets', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Target sampel per provinsi: [{province, target}]',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surveys', 'region_targets');
  },
};
