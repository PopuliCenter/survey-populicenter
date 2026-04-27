'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Drop old CHECK constraint (IF EXISTS for idempotency)
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );

      // Add new CHECK constraint with time and matrix included
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo', 'rating_scale',
          'phone_number', 'unique_id', 'time', 'matrix'
        ));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Delete rows with time or matrix type to prevent constraint violation
      await queryInterface.sequelize.query(
        `DELETE FROM questions WHERE type IN ('time', 'matrix');`,
        { transaction }
      );

      // Drop the new constraint
      await queryInterface.sequelize.query(
        `ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;`,
        { transaction }
      );

      // Restore the previous constraint without time and matrix
      await queryInterface.sequelize.query(
        `ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
          'single_choice', 'multiple_choice', 'short_text',
          'long_text', 'numeric_scale', 'date', 'photo', 'rating_scale',
          'phone_number', 'unique_id'
        ));`,
        { transaction }
      );
    });
  },
};
