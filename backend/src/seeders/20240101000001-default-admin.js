'use strict';

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);

    await queryInterface.bulkInsert('users', [
      {
        id: uuidv4(),
        name: 'Admin',
        email: 'admin@example.com',
        password_hash: passwordHash,
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ], {
      // Skip if admin already exists (idempotent seed)
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: 'admin@example.com',
    });
  },
};
