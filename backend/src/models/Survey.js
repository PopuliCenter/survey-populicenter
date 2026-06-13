'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Survey = sequelize.define('Survey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
      validate: {
        isIn: [['draft', 'active', 'inactive']],
      },
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    field_tools_settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        signature_mode: 'required',
        audio_mode: 'required',
        photo_mode: 'required',
        gps_mode: 'required',
      },
      validate: {
        isValidFieldToolsSettings(value) {
          const requiredProperties = ['signature_mode', 'audio_mode', 'photo_mode', 'gps_mode'];
          const validModes = ['required', 'optional', 'disabled'];

          if (!value || typeof value !== 'object') {
            throw new Error('Field tools settings harus memiliki properti: signature_mode, audio_mode, photo_mode, gps_mode');
          }

          const keys = Object.keys(value);
          const hasAllRequired = requiredProperties.every((prop) => keys.includes(prop));
          const hasExtraProps = keys.some((key) => !requiredProperties.includes(key));

          if (!hasAllRequired || hasExtraProps) {
            throw new Error('Field tools settings harus memiliki properti: signature_mode, audio_mode, photo_mode, gps_mode');
          }

          for (const prop of requiredProperties) {
            if (!validModes.includes(value[prop])) {
              throw new Error('Nilai field tool mode tidak valid. Gunakan: required, optional, atau disabled');
            }
          }
        },
      },
    },
    form_mode: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'wizard',
      validate: {
        isIn: [['scroll', 'wizard']],
      },
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'lainnya',
      validate: {
        isIn: [['nasional', 'daerah', 'lainnya']],
      },
    },
    region_targets: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      // Format: [{ province: 'JAWA BARAT', target: 500 }, ...]
    },
    report_config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      // { methodology, narratives:{qid:text}, demographics:[qid], sections:{qid:label} }
    },
  }, {
    tableName: 'surveys',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return Survey;
};
