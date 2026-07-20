'use strict';

const { DataTypes } = require('sequelize');

/**
 * RtSelection — hasil undian RT per kelurahan/desa (pengganti FORM A + FORM B).
 *
 * Baris ini bersifat SEKALI TULIS. Indeks unik (survey_id, surveyor_id, village)
 * mencegah undian diulang; rute /rt-selection mengembalikan baris yang sudah ada
 * alih-alih mengundi lagi. `seed` + `algo_version` disimpan agar supervisor bisa
 * menghitung ulang dan membuktikan `selected` bukan angka karangan.
 */
module.exports = (sequelize) => {
  const RtSelection = sequelize.define('RtSelection', {
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
    province: { type: DataTypes.STRING(120), allowNull: false },
    city: { type: DataTypes.STRING(120), allowNull: false },
    district: { type: DataTypes.STRING(120), allowNull: false },
    village: { type: DataTypes.STRING(120), allowNull: false },
    total_rt: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, isInt: true },
    },
    // Daftar RW/RT hasil pendataan TPD (opsional): [{ no, rw, rt }]
    rt_list: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
    // Nomor urut RT terpilih, mis. [1, 3]
    selected: { type: DataTypes.JSONB, allowNull: false },
    seed: { type: DataTypes.STRING(64), allowNull: false },
    algo_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    official_name: { type: DataTypes.STRING(150), allowNull: true },
    official_position: { type: DataTypes.STRING(150), allowNull: true },
    official_phone: { type: DataTypes.STRING(40), allowNull: true },
    form_b_photo_path: { type: DataTypes.STRING(500), allowNull: true },
    locked_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: 'rt_selections',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['survey_id', 'surveyor_id', 'village'],
        name: 'rt_selections_survey_surveyor_village_unique',
      },
      { fields: ['survey_id'], name: 'rt_selections_survey_idx' },
    ],
  });

  return RtSelection;
};
