'use strict';

/**
 * Tabel rt_selections — hasil undian RT (menggantikan FORM A + FORM B kertas).
 *
 * Satu baris = satu undian RT untuk satu kelurahan/desa oleh satu TPD pada satu
 * survei. Indeks unik (survey_id, surveyor_id, village) memastikan undian TIDAK
 * BISA DIULANG: permintaan kedua mengembalikan hasil yang sama. Ini titik paling
 * krusial — tanpa itu TPD bisa mengundi berkali-kali sampai dapat RT yang mudah
 * dijangkau, dan aplikasi justru jadi lebih lemah daripada lembar kertas.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rt_selections', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'surveys', key: 'id' },
        onDelete: 'CASCADE',
      },
      surveyor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      province: { type: Sequelize.STRING(120), allowNull: false },
      city: { type: Sequelize.STRING(120), allowNull: false },
      district: { type: Sequelize.STRING(120), allowNull: false },
      village: { type: Sequelize.STRING(120), allowNull: false },
      // Jumlah RT di kelurahan (dari aparat desa, dibuktikan foto Form B).
      total_rt: { type: Sequelize.INTEGER, allowNull: false },
      // Daftar RW/RT bila TPD mendatanya (opsional pada v1).
      rt_list: { type: Sequelize.JSONB, allowNull: true, defaultValue: null },
      // Nomor urut RT terpilih, mis. [1, 3].
      selected: { type: Sequelize.JSONB, allowNull: false },
      // Seed + versi algoritma → hasil dapat dihitung ulang & diaudit.
      seed: { type: Sequelize.STRING(64), allowNull: false },
      algo_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      // Aparat desa/kelurahan yang mengesahkan daftar RT (Form B).
      official_name: { type: Sequelize.STRING(150), allowNull: true },
      official_position: { type: Sequelize.STRING(150), allowNull: true },
      official_phone: { type: Sequelize.STRING(40), allowNull: true },
      // Foto Form B ber-tanda tangan & stempel — bukti daftar RT memang sah.
      form_b_photo_path: { type: Sequelize.STRING(500), allowNull: true },
      // Waktu undian dikunci (= saat dibuat; kolom eksplisit agar jelas di audit).
      locked_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    // ANTI ACAK-ULANG: satu TPD hanya boleh punya satu undian per kelurahan
    // pada satu survei.
    await queryInterface.addIndex('rt_selections', ['survey_id', 'surveyor_id', 'village'], {
      unique: true,
      name: 'rt_selections_survey_surveyor_village_unique',
    });

    // Untuk pengawasan supervisor: lihat seluruh undian dalam satu survei.
    await queryInterface.addIndex('rt_selections', ['survey_id'], {
      name: 'rt_selections_survey_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('rt_selections', 'rt_selections_survey_idx');
    await queryInterface.removeIndex('rt_selections', 'rt_selections_survey_surveyor_village_unique');
    await queryInterface.dropTable('rt_selections');
  },
};
