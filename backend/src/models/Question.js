'use strict';

const { DataTypes } = require('sequelize');

const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'short_text',
  'long_text',
  'numeric_scale',
  'date',
  'photo',
  'rating_scale',
  'phone_number',
  'unique_id',
  'time',
  'matrix',
  'indonesia_region',
];

module.exports = (sequelize) => {
  const Question = sequelize.define('Question', {
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
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [QUESTION_TYPES],
      },
    },
    order_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    randomize_options: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    allow_other: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    options: {
      type: DataTypes.JSONB,
      allowNull: true,
      // Format: [{value: string, label: string}, ...]
    },
    skip_logic: {
      type: DataTypes.JSONB,
      allowNull: true,
      // Format: [{condition: {question_id, operator, value}, action: 'jump_to', target_question_id}, ...]
    },
    auto_fill: {
      type: DataTypes.JSONB,
      allowNull: true,
      // Isi otomatis jawaban dari sumber lain. Saat ini: jenis kelamin dari
      // paritas Nomor Kuesioner.
      // Format: { source: 'questionnaire_number_parity', odd_value: string, even_value: string }
    },
  }, {
    tableName: 'questions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['survey_id', 'order_index'],
      },
    ],
  });

  return Question;
};
