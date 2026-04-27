'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('questions', {
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
      text: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      order_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      randomize_options: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      options: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      skip_logic: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Add CHECK constraint for type
    await queryInterface.sequelize.query(`
      ALTER TABLE questions
        ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo'
        ));
    `);

    // Add UNIQUE constraint for (survey_id, order_index)
    await queryInterface.addIndex('questions', ['survey_id', 'order_index'], {
      unique: true,
      name: 'questions_survey_id_order_index_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('questions');
  },
};
