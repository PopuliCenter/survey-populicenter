'use strict';

/**
 * Migration: Buat tabel survey_statistics untuk menyimpan statistik pre-computed.
 *
 * Tabel ini menghindari COUNT(*) + GROUP BY yang berat di dashboard.
 * Di-update secara inkremental setiap ada response baru/dihapus via trigger atau app logic.
 *
 * Kolom:
 *   - survey_id: FK ke surveys
 *   - total_responses: jumlah total response (exclude PENDING)
 *   - today_responses: jumlah response hari ini (di-reset tiap hari)
 *   - last_response_at: timestamp response terakhir
 *   - updated_at: kapan statistik terakhir diupdate
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('survey_statistics', {
      survey_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: {
          model: 'surveys',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      total_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      today_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      today_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Tanggal untuk today_responses — jika beda hari, reset ke 0',
      },
      last_response_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Buat tabel surveyor_statistics untuk per-surveyor per-survey stats
    await queryInterface.createTable('surveyor_statistics', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'surveys',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      surveyor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      total_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      today_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      today_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Unique constraint: satu row per survey+surveyor
    await queryInterface.addConstraint('surveyor_statistics', {
      fields: ['survey_id', 'surveyor_id'],
      type: 'unique',
      name: 'uq_surveyor_statistics_survey_surveyor',
    });

    // Index untuk query per survey
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_surveyor_stats_survey ON surveyor_statistics (survey_id);
    `);

    // Populate survey_statistics dari data existing
    await queryInterface.sequelize.query(`
      INSERT INTO survey_statistics (survey_id, total_responses, today_responses, today_date, last_response_at, updated_at)
      SELECT
        s.id,
        COALESCE(r.cnt, 0),
        0,
        CURRENT_DATE,
        r.last_at,
        NOW()
      FROM surveys s
      LEFT JOIN (
        SELECT survey_id, COUNT(*) as cnt, MAX(created_at) as last_at
        FROM responses
        WHERE questionnaire_number NOT LIKE 'PENDING-%'
        GROUP BY survey_id
      ) r ON r.survey_id = s.id;
    `);

    // Populate surveyor_statistics dari data existing
    await queryInterface.sequelize.query(`
      INSERT INTO surveyor_statistics (survey_id, surveyor_id, total_responses, today_responses, today_date, updated_at)
      SELECT
        survey_id,
        surveyor_id,
        COUNT(*),
        0,
        CURRENT_DATE,
        NOW()
      FROM responses
      WHERE questionnaire_number NOT LIKE 'PENDING-%'
      GROUP BY survey_id, surveyor_id;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('surveyor_statistics');
    await queryInterface.dropTable('survey_statistics');
  },
};
