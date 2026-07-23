'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FcmToken = sequelize.define('FcmToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    token: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
    },
    platform: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'android',
    },
  }, {
    tableName: 'fcm_tokens',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return FcmToken;
};
