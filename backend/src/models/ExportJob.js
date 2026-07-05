'use strict';

const { DataTypes } = require('sequelize');

const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'];
const EXPORT_FORMATS = ['xlsx', 'csv', 'zip'];

module.exports = (sequelize) => {
  const ExportJob = sequelize.define('ExportJob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    survey_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'surveys',
        key: 'id',
      },
    },
    requested_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [JOB_STATUSES],
      },
    },
    format: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [EXPORT_FORMATS],
      },
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'export_jobs',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return ExportJob;
};
