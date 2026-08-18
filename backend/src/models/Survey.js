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
        // SATU sumber kebenaran: utils/fieldToolsValidator. Dulu daftar kunci
        // DIDUPLIKASI di sini dan tak ikut diperbarui saat form_font_* lahir →
        // rute lolos validasi tapi survey.save() melempar → 500 "kesalahan
        // internal" saat admin menyimpan (insiden 2026-07-23). Jangan pernah
        // menyalin daftarnya lagi — delegasikan.
        isValidFieldToolsSettings(value) {
          // Lazy require di dalam fungsi: aman dari urutan muat modul.
          const { validateFieldToolsSettings } = require('../utils/fieldToolsValidator');
          const result = validateFieldToolsSettings(value);
          if (!result.valid) throw new Error(result.error);
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
    // ── Tarik ke Spreadsheet (feed CSV bertoken) ──────────────────────────────
    // Token rahasia pada URL memberi akses BACA CSV tanpa login, agar Google
    // Sheets (=IMPORTDATA) / Excel bisa menariknya. Nonaktif secara default.
    report_feed_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
    report_feed_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Data mentah per responden bersifat SENSITIF (GPS/waktu) → opt-in terpisah.
    report_feed_include_raw: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
