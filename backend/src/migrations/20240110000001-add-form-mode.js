'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surveys', 'form_mode', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'wizard',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surveys', 'form_mode');
  },
};
