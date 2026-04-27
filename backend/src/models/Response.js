'use strict';

const { DataTypes } = require('sequelize');

const GEO_STATUSES = [
  'available',
  'lokasi_tidak_tersedia',
  'tidak_didukung',
  'timeout',
];

const REVIEW_STATUSES = ['unreviewed', 'flagged', 'verified'];

module.exports = (sequelize) => {
  const Response = sequelize.define('Response', {
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
    questionnaire_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    geo_status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'available',
      validate: {
        isIn: [GEO_STATUSES],
      },
    },
    review_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unreviewed',
      validate: {
        isIn: [REVIEW_STATUSES],
      },
    },
    review_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    audio_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    signature_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    photo_paths: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    start_latitude: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    start_longitude: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    start_geo_status: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: 'available',
      validate: {
        isIn: [GEO_STATUSES],
      },
    },
  }, {
    tableName: 'responses',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['survey_id', 'questionnaire_number'],
      },
    ],
  });

  return Response;
};
