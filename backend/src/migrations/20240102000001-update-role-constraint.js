'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Drop old CHECK constraint (IF EXISTS for idempotency)
      await queryInterface.sequelize.query(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`,
        { transaction }
      );

      // Add new CHECK constraint with four valid roles
      await queryInterface.sequelize.query(
        `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'supervisor', 'viewer', 'surveyor'));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Drop the four-role constraint
      await queryInterface.sequelize.query(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`,
        { transaction }
      );

      // Restore the original two-role constraint
      await queryInterface.sequelize.query(
        `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'surveyor'));`,
        { transaction }
      );
    });
  },
};
