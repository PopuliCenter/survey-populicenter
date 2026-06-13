'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MonitoringReport = sequelize.define('MonitoringReport', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    survey_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'surveys', key: 'id' },
    },
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    snapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    snapshot_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'monitoring_reports',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return MonitoringReport;
};
