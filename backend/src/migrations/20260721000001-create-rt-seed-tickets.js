'use strict';

/**
 * Tabel rt_seed_tickets — jatah seed undian RT untuk MODE OFFLINE.
 *
 * Masalah yang dipecahkan: undian RT v1 butuh koneksi (server yang mengundi),
 * padahal justru di pelosok tanpa sinyal fitur ini paling dibutuhkan.
 *
 * Solusi: saat online, server MENJATAH deretan seed ("tiket") per
 * (survei, TPD) dengan urutan tetap (seq). Di lapangan tanpa sinyal, aplikasi
 * memakai tiket berikutnya SESUAI URUTAN — TPD tidak bisa memilih tiket — dan
 * menghitung undian secara lokal dengan algoritma identik (utils/rtDraw).
 * Saat sinkron, server memverifikasi: tiket milik TPD tsb, belum terpakai,
 * dan hasil = hitung-ulang dari seed. Seed dijatah DI MUKA sehingga server
 * selalu bisa membuktikan hasil offline bukan karangan.
 *
 * Trade-off yang disadari: seed tersimpan di perangkat sebelum dipakai, jadi
 * TPD berperangkat-root secara teori bisa mengintip hasil sebelum berkomitmen
 * pada jumlah RT. Mitigasi: jumlah RT dibuktikan foto Form B ber-ttd aparat
 * desa + pemakaian tiket wajib berurutan + verifikasi ulang di pengawasan.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rt_seed_tickets', {
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
      // Urutan pemakaian tiket (1, 2, 3, …) — wajib dipakai berurutan.
      seq: { type: Sequelize.INTEGER, allowNull: false },
      seed: { type: Sequelize.STRING(64), allowNull: false },
      // Terisi saat tiket dikonsumsi (kunci ganda: satu tiket = satu kelurahan).
      used_village: { type: Sequelize.STRING(120), allowNull: true },
      used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('rt_seed_tickets', ['survey_id', 'surveyor_id', 'seq'], {
      unique: true,
      name: 'rt_seed_tickets_survey_surveyor_seq_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('rt_seed_tickets', 'rt_seed_tickets_survey_surveyor_seq_unique');
    await queryInterface.dropTable('rt_seed_tickets');
  },
};
