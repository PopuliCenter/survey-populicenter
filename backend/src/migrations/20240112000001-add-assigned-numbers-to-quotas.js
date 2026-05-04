'use strict';

/**
 * Migration: tambah kolom assigned_numbers ke surveyor_quotas
 * Kolom ini menyimpan daftar nomor kuesioner yang harus diisi oleh surveyor
 * untuk survei tertentu. Format: array of string, e.g. ["001", "002", "003"]
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveyor_quotas', 'assigned_numbers', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Daftar nomor kuesioner yang ditugaskan ke surveyor untuk survei ini',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surveyor_quotas', 'assigned_numbers');
  },
};
