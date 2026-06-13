'use strict';

/**
 * Migration: tambah role 'partner_lokal' (PL) & 'asisten_supervisor' ke
 * constraint users_role_check.
 */
const ROLES = ['admin', 'supervisor', 'viewer', 'surveyor', 'partner_lokal', 'asisten_supervisor'];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;',
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${ROLES.map((r) => `'${r}'`).join(', ')}));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;',
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'supervisor', 'viewer', 'surveyor'));`,
        { transaction }
      );
    });
  },
};
