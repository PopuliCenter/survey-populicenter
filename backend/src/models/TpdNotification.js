'use strict';

const { DataTypes } = require('sequelize');

const NOTIFICATION_TYPES = ['manual', 'review', 'quality'];

/**
 * TpdNotification — pemberitahuan dashboard → aplikasi TPD (lihat migrasi
 * 20260722000002 untuk ketiga sumbernya). Dibaca lonceng aplikasi TPD;
 * `read_at` null = belum dibaca.
 */
module.exports = (sequelize) => {
  const TpdNotification = sequelize.define('TpdNotification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    surveyor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    survey_id: { type: DataTypes.UUID, allowNull: true },
    response_id: { type: DataTypes.UUID, allowNull: true },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'manual',
      validate: { isIn: [NOTIFICATION_TYPES] },
    },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    created_by: { type: DataTypes.UUID, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'tpd_notifications',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['surveyor_id', 'created_at'], name: 'tpd_notifications_surveyor_created_idx' },
      { fields: ['surveyor_id', 'read_at'], name: 'tpd_notifications_surveyor_read_idx' },
    ],
  });

  TpdNotification.TYPES = NOTIFICATION_TYPES;
  return TpdNotification;
};
