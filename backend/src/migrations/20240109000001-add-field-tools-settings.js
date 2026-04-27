'use strict';

const DEFAULT_FIELD_TOOLS_SETTINGS = {
  signature_mode: 'required',
  audio_mode: 'required',
  photo_mode: 'required',
  gps_mode: 'required',
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Add field_tools_settings JSONB column to surveys table
      await queryInterface.addColumn(
        'surveys',
        'field_tools_settings',
        {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: DEFAULT_FIELD_TOOLS_SETTINGS,
        },
        { transaction }
      );

      // Update all existing surveys with the default value
      await queryInterface.sequelize.query(
        `UPDATE surveys SET field_tools_settings = :defaultValue WHERE field_tools_settings IS NULL`,
        {
          replacements: { defaultValue: JSON.stringify(DEFAULT_FIELD_TOOLS_SETTINGS) },
          transaction,
        }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('surveys', 'field_tools_settings', { transaction });
    });
  },
};
