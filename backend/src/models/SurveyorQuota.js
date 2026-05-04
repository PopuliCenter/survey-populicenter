'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SurveyorQuota = sequelize.define('SurveyorQuota', {
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
    surveyor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    quota: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        isInt: true,
      },
    },
    assigned_numbers: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      // Format: ["001", "002", "003"] — nomor kuesioner yang ditugaskan ke surveyor
    },
  }, {
    tableName: 'surveyor_quotas',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['survey_id', 'surveyor_id'],
      },
    ],
  });

  return SurveyorQuota;
};
