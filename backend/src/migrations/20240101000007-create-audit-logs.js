'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      entity_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      old_value: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      new_value: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Index for faster lookups by user and action
    await queryInterface.addIndex('audit_logs', ['user_id'], {
      name: 'audit_logs_user_id_idx',
    });
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id'], {
      name: 'audit_logs_entity_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
