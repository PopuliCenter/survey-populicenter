'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('surveyor_quotas', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'surveys',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      surveyor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      quota: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Add CHECK constraint: quota > 0
    await queryInterface.sequelize.query(`
      ALTER TABLE surveyor_quotas
        ADD CONSTRAINT surveyor_quotas_quota_check CHECK (quota > 0);
    `);

    // Add UNIQUE constraint for (survey_id, surveyor_id)
    await queryInterface.addIndex('surveyor_quotas', ['survey_id', 'surveyor_id'], {
      unique: true,
      name: 'surveyor_quotas_survey_id_surveyor_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('surveyor_quotas');
  },
};
