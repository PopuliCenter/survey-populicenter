'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Drop old CHECK constraint (IF EXISTS for idempotency)
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );

      // Add new CHECK constraint with rating_scale included
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo', 'rating_scale'
        ));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Delete rows with type = 'rating_scale' to prevent constraint violation
      await queryInterface.sequelize.query(
        `DELETE FROM questions WHERE type = 'rating_scale';`,
        { transaction }
      );

      // Drop the new constraint
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );

      // Restore the original constraint without rating_scale
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo'
        ));`,
        { transaction }
      );
    });
  },
};
