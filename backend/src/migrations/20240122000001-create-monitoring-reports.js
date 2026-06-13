'use strict';

/**
 * Migration: tabel monitoring_reports — embed MONITORING klien (privat).
 *
 * Satu baris per survei. Diakses via link bertoken rahasia. snapshot disimpan
 * dan dihitung ulang secara lazy (ber-TTL) saat diakses — "snapshot berkala".
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('monitoring_reports', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'surveys', key: 'id' },
        onDelete: 'CASCADE',
      },
      token: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Token rahasia untuk akses link monitoring',
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      snapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      snapshot_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Kapan snapshot terakhir dihitung (untuk TTL)',
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

    await queryInterface.sequelize.query(
      'CREATE INDEX idx_monitoring_reports_token ON monitoring_reports (token);'
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('monitoring_reports');
  },
};
