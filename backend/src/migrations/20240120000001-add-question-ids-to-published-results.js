'use strict';

/**
 * Migration: tambah kolom question_ids ke published_results.
 *
 * Menyimpan daftar id pertanyaan yang DIPILIH untuk ditampilkan di embed publik.
 * NULL = tampilkan semua pertanyaan yang bisa diagregasi (perilaku default lama).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('published_results', 'question_ids', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array id pertanyaan terpilih untuk tampil; NULL = semua',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('published_results', 'question_ids');
  },
};
