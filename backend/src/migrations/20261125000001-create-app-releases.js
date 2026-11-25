'use strict';

/**
 * Riwayat rilis aplikasi TPD (APK Android) — sumber pemberitahuan pembaruan.
 *
 * Baris TERBARU per platform = acuan aplikasi: versi di bawah version_code →
 * "versi baru tersedia"; di bawah min_version_code → wajib update. Riwayat
 * disimpan (bukan ditimpa) agar jelas kapan & oleh siapa tiap rilis diumumkan.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('app_releases', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      platform: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'android',
      },
      version_code: { type: Sequelize.INTEGER, allowNull: false },
      version_name: { type: Sequelize.STRING(30), allowNull: true },
      min_version_code: { type: Sequelize.INTEGER, allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      // Halaman yang dibuka bila pemasangan langsung tak tersedia
      // (populicenter.org, kelak halaman Google Play).
      page_url: { type: Sequelize.STRING(500), allowNull: false },
      // Berkas APK untuk diunduh & dipasang langsung dari aplikasi (opsional).
      apk_url: { type: Sequelize.STRING(500), allowNull: true },
      apk_sha256: { type: Sequelize.STRING(64), allowNull: true },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
    await queryInterface.addIndex('app_releases', ['platform', 'created_at'], { name: 'idx_app_releases_platform_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('app_releases');
  },
};
