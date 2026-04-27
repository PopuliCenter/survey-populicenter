'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Add review_status column with CHECK constraint
      await queryInterface.addColumn(
        'responses',
        'review_status',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'unreviewed',
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE responses ADD CONSTRAINT responses_review_status_check CHECK (review_status IN ('unreviewed', 'flagged', 'verified'));`,
        { transaction }
      );

      // Add review_note column
      await queryInterface.addColumn(
        'responses',
        'review_note',
        {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        { transaction }
      );

      // Add reviewed_by column with FK to users
      await queryInterface.addColumn(
        'responses',
        'reviewed_by',
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction }
      );

      // Add reviewed_at column
      await queryInterface.addColumn(
        'responses',
        'reviewed_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
        },
        { transaction }
      );

      // Add B-tree index on review_status
      await queryInterface.addIndex('responses', ['review_status'], {
        name: 'idx_responses_review_status',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex('responses', 'idx_responses_review_status', {
        transaction,
      });

      await queryInterface.sequelize.query(
        `ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_review_status_check;`,
        { transaction }
      );

      await queryInterface.removeColumn('responses', 'reviewed_at', { transaction });
      await queryInterface.removeColumn('responses', 'reviewed_by', { transaction });
      await queryInterface.removeColumn('responses', 'review_note', { transaction });
      await queryInterface.removeColumn('responses', 'review_status', { transaction });
    });
  },
};
