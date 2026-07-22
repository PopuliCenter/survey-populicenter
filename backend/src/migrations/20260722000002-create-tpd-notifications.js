'use strict';

/**
 * Tabel tpd_notifications — pemberitahuan dashboard → aplikasi TPD.
 *
 * Tiga sumber (kolom `type`):
 *   'manual'  : admin/SPV mengirim pesan ke TPD terpilih (mis. "data Anda
 *               belum masuk", teguran, instruksi).
 *   'review'  : otomatis saat respons DITANDAI bermasalah (flagged) di
 *               Data Responden — TPD langsung tahu + catatan reviewer.
 *   'quality' : otomatis saat wawancara tercatat lebih singkat dari ambang
 *               min_duration_sec survei (indikasi terburu-buru/mengarang).
 *
 * Dibaca aplikasi TPD (lonceng + badge belum-dibaca). Push FCM menyusul —
 * tabel ini kelak jadi sumber antriannya.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tpd_notifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      surveyor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'surveys', key: 'id' },
        onDelete: 'SET NULL',
      },
      response_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'responses', key: 'id' },
        onDelete: 'SET NULL',
      },
      type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'manual' },
      title: { type: Sequelize.STRING(150), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    // Daftar per TPD (terbaru dulu) + hitung belum-dibaca.
    await queryInterface.addIndex('tpd_notifications', ['surveyor_id', 'created_at'], {
      name: 'tpd_notifications_surveyor_created_idx',
    });
    await queryInterface.addIndex('tpd_notifications', ['surveyor_id', 'read_at'], {
      name: 'tpd_notifications_surveyor_read_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('tpd_notifications', 'tpd_notifications_surveyor_read_idx');
    await queryInterface.removeIndex('tpd_notifications', 'tpd_notifications_surveyor_created_idx');
    await queryInterface.dropTable('tpd_notifications');
  },
};
