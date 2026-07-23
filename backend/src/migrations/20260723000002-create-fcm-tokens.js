'use strict';

/**
 * Token FCM perangkat TPD — untuk push notification Android (lonceng dalam
 * aplikasi tetap sumber kebenaran; push hanya "pembangunkan HP").
 * Token unik global: satu perangkat terakhir dipakai login akun mana → push
 * ke akun itu (token pindah akun saat perangkat ganti pemilik).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fcm_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token: {
        type: Sequelize.STRING(512),
        allowNull: false,
        unique: true,
      },
      platform: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'android',
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
    await queryInterface.addIndex('fcm_tokens', ['user_id'], { name: 'idx_fcm_tokens_user' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fcm_tokens');
  },
};
