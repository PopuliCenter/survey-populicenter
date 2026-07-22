'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Randomisasi URUTAN pertanyaan (blok acak) — pelengkap randomize_options.
    // Pertanyaan ber-flag true yang BERSEBELAHAN membentuk satu blok; urutan di
    // dalam blok dikocok per responden (seed nomor kuesioner) di app TPD.
    // Jawaban tetap tersimpan per question_id → data/ekspor SPSS tak berubah.
    // Validasi rute menolak flag pada pertanyaan identitas & yang terlibat
    // skip logic (lompatan bermakna posisi — lihat routes/questions.js).
    await queryInterface.addColumn('questions', 'randomize_order', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('questions', 'randomize_order');
  },
};
