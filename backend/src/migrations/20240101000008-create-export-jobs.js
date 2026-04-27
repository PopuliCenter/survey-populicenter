'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('export_jobs', {
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
        onDelete: 'RESTRICT',
      },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      format: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add CHECK constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE export_jobs
        ADD CONSTRAINT export_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE export_jobs
        ADD CONSTRAINT export_jobs_format_check CHECK (format IN ('xlsx', 'csv'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('export_jobs');
  },
};
