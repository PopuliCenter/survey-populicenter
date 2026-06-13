'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PublishedResult = sequelize.define('PublishedResult', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    survey_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'surveys', key: 'id' },
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    survey_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'lainnya',
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    response_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    snapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    question_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    is_published: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    published_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'published_results',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return PublishedResult;
};
