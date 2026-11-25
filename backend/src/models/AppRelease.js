'use strict';

const { DataTypes } = require('sequelize');

/** Rilis aplikasi TPD — lihat migrasi 20261125000001-create-app-releases. */
module.exports = (sequelize) => {
  const AppRelease = sequelize.define('AppRelease', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    platform: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'android' },
    version_code: { type: DataTypes.INTEGER, allowNull: false },
    version_name: { type: DataTypes.STRING(30), allowNull: true },
    min_version_code: { type: DataTypes.INTEGER, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    page_url: { type: DataTypes.STRING(500), allowNull: false },
    apk_url: { type: DataTypes.STRING(500), allowNull: true },
    apk_sha256: { type: DataTypes.STRING(64), allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'app_releases',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return AppRelease;
};
