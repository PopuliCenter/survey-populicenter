'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Add audio_path column
      await queryInterface.addColumn(
        'responses',
        'audio_path',
        {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        { transaction }
      );

      // Add signature_path column
      await queryInterface.addColumn(
        'responses',
        'signature_path',
        {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        { transaction }
      );

      // Add photo_paths column (JSONB, default empty array)
      await queryInterface.addColumn(
        'responses',
        'photo_paths',
        {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: [],
        },
        { transaction }
      );

      // Add start_latitude column
      await queryInterface.addColumn(
        'responses',
        'start_latitude',
        {
          type: Sequelize.DECIMAL(10, 6),
          allowNull: true,
        },
        { transaction }
      );

      // Add start_longitude column
      await queryInterface.addColumn(
        'responses',
        'start_longitude',
        {
          type: Sequelize.DECIMAL(10, 6),
          allowNull: true,
        },
        { transaction }
      );

      // Add start_geo_status column with CHECK constraint
      await queryInterface.addColumn(
        'responses',
        'start_geo_status',
        {
          type: Sequelize.STRING(30),
          allowNull: true,
          defaultValue: 'available',
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE responses ADD CONSTRAINT responses_start_geo_status_check CHECK (start_geo_status IN ('available', 'lokasi_tidak_tersedia', 'tidak_didukung', 'timeout'));`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_start_geo_status_check;`,
        { transaction }
      );

      await queryInterface.removeColumn('responses', 'start_geo_status', { transaction });
      await queryInterface.removeColumn('responses', 'start_longitude', { transaction });
      await queryInterface.removeColumn('responses', 'start_latitude', { transaction });
      await queryInterface.removeColumn('responses', 'photo_paths', { transaction });
      await queryInterface.removeColumn('responses', 'signature_path', { transaction });
      await queryInterface.removeColumn('responses', 'audio_path', { transaction });
    });
  },
};
