'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Konfigurasi isi-otomatis pertanyaan (mis. jenis kelamin diturunkan dari
    // paritas Nomor Kuesioner: ganjil = Laki-laki, genap = Perempuan).
    // Format: { source: 'questionnaire_number_parity', odd_value, even_value }
    await queryInterface.addColumn('questions', 'auto_fill', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('questions', 'auto_fill');
  },
};
