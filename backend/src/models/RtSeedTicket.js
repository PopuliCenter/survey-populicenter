'use strict';

const { DataTypes } = require('sequelize');

/**
 * RtSeedTicket — jatah seed undian RT untuk mode offline (lihat migrasi
 * 20260721000001 untuk desain lengkap & trade-off keamanannya).
 *
 * Satu tiket = satu undian = satu kelurahan. Dipakai berurutan (seq).
 * `used_village` terisi saat dikonsumsi; tiket terpakai tak bisa dipakai ulang.
 */
module.exports = (sequelize) => {
  const RtSeedTicket = sequelize.define('RtSeedTicket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    survey_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'surveys', key: 'id' },
    },
    surveyor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    seq: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    seed: { type: DataTypes.STRING(64), allowNull: false },
    used_village: { type: DataTypes.STRING(120), allowNull: true },
    used_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'rt_seed_tickets',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['survey_id', 'surveyor_id', 'seq'],
        name: 'rt_seed_tickets_survey_surveyor_seq_unique',
      },
    ],
  });

  return RtSeedTicket;
};
