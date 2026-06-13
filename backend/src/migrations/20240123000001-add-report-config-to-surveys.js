'use strict';

/**
 * Migration: tambah kolom report_config ke surveys.
 *
 * Menyimpan konfigurasi laporan PPTX per survei:
 *   {
 *     methodology: string,                 // teks metodologi (override)
 *     narratives: { [questionId]: string },// override narasi per pertanyaan
 *     demographics: [questionId],          // pertanyaan utk slide PROFIL RESPONDEN
 *     sections: { [questionId]: string }   // label section/divider per pertanyaan
 *   }
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveys', 'report_config', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Konfigurasi laporan PPTX: methodology, narratives, demographics, sections',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surveys', 'report_config');
  },
};
