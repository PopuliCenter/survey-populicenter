'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Answer = sequelize.define('Answer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    response_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'responses',
        key: 'id',
      },
    },
    question_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'questions',
        key: 'id',
      },
    },
    answer_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    answer_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      // For multiple_choice: ["val1", "val2"]
    },
    photo_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  }, {
    tableName: 'answers',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return Answer;
};
