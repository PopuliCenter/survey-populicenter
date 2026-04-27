'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('responses', {
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
      surveyor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      questionnaire_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      latitude: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: true,
      },
      longitude: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: true,
      },
      geo_status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'available',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Add CHECK constraint for geo_status
    await queryInterface.sequelize.query(`
      ALTER TABLE responses
        ADD CONSTRAINT responses_geo_status_check CHECK (geo_status IN (
          'available', 'lokasi_tidak_tersedia', 'tidak_didukung', 'timeout'
        ));
    `);

    // Add UNIQUE constraint for (survey_id, questionnaire_number)
    await queryInterface.addIndex('responses', ['survey_id', 'questionnaire_number'], {
      unique: true,
      name: 'responses_survey_id_questionnaire_number_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('responses');
  },
};
