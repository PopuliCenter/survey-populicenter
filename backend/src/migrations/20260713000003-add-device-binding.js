'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Kunci perangkat: 1 user TPD terikat ke 1 perangkat (device_id dari app).
    // Diberlakukan hanya pada survei dengan field_tools_settings.device_lock =
    // 'enforced'. Admin dapat mereset ikatan (ganti HP / salah perangkat).
    await queryInterface.addColumn('users', 'device_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'device_label', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'device_bound_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'device_bound_at');
    await queryInterface.removeColumn('users', 'device_label');
    await queryInterface.removeColumn('users', 'device_id');
  },
};
