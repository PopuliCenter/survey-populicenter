'use strict';

/**
 * Migration: tambah kolom error_message ke export_jobs (audit L6).
 * Menyimpan alasan kegagalan job async agar klien tahu MENGAPA export/arsip
 * gagal (bukan hanya status 'failed'). Idempoten (aman dijalankan ulang).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('export_jobs');
    if (!table.error_message) {
      await queryInterface.addColumn('export_jobs', 'error_message', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('export_jobs');
    if (table.error_message) {
      await queryInterface.removeColumn('export_jobs', 'error_message');
    }
  },
};
