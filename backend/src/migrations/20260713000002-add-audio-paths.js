'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Beberapa segmen rekaman audio per responden (mis. saat nomor kuesioner
    // di-pending lalu dilanjutkan → rekaman jadi beberapa bagian). audio_path
    // (tunggal, lama) tetap ada berisi segmen pertama untuk kompatibilitas.
    await queryInterface.addColumn('responses', 'audio_paths', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('responses', 'audio_paths');
  },
};
