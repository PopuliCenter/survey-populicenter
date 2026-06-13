'use strict';

const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

// Import models
const User = require('./User')(sequelize);
const Survey = require('./Survey')(sequelize);
const Question = require('./Question')(sequelize);
const SurveyorQuota = require('./SurveyorQuota')(sequelize);
const Response = require('./Response')(sequelize);
const Answer = require('./Answer')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);
const ExportJob = require('./ExportJob')(sequelize);
const PublishedResult = require('./PublishedResult')(sequelize);
const MonitoringReport = require('./MonitoringReport')(sequelize);

// ─── Associations ─────────────────────────────────────────────────────────────

// User → Survey (created_by)
User.hasMany(Survey, { foreignKey: 'created_by', as: 'createdSurveys' });
Survey.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Survey → Question
Survey.hasMany(Question, { foreignKey: 'survey_id', as: 'questions', onDelete: 'CASCADE' });
Question.belongsTo(Survey, { foreignKey: 'survey_id', as: 'survey' });

// Survey + User → SurveyorQuota
Survey.hasMany(SurveyorQuota, { foreignKey: 'survey_id', as: 'quotas', onDelete: 'CASCADE' });
SurveyorQuota.belongsTo(Survey, { foreignKey: 'survey_id', as: 'survey' });

User.hasMany(SurveyorQuota, { foreignKey: 'surveyor_id', as: 'quotas', onDelete: 'CASCADE' });
SurveyorQuota.belongsTo(User, { foreignKey: 'surveyor_id', as: 'surveyor' });

// Survey + User → Response
Survey.hasMany(Response, { foreignKey: 'survey_id', as: 'responses' });
Response.belongsTo(Survey, { foreignKey: 'survey_id', as: 'survey' });

User.hasMany(Response, { foreignKey: 'surveyor_id', as: 'responses' });
Response.belongsTo(User, { foreignKey: 'surveyor_id', as: 'surveyor' });

// User → Response (reviewed_by)
User.hasMany(Response, { foreignKey: 'reviewed_by', as: 'reviewedResponses' });
Response.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

// Response → Answer
Response.hasMany(Answer, { foreignKey: 'response_id', as: 'answers', onDelete: 'CASCADE' });
Answer.belongsTo(Response, { foreignKey: 'response_id', as: 'response' });

// Question → Answer
Question.hasMany(Answer, { foreignKey: 'question_id', as: 'answers' });
Answer.belongsTo(Question, { foreignKey: 'question_id', as: 'question' });

// User → AuditLog
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Survey + User → ExportJob
Survey.hasMany(ExportJob, { foreignKey: 'survey_id', as: 'exportJobs' });
ExportJob.belongsTo(Survey, { foreignKey: 'survey_id', as: 'survey' });

User.hasMany(ExportJob, { foreignKey: 'requested_by', as: 'exportJobs' });
ExportJob.belongsTo(User, { foreignKey: 'requested_by', as: 'requester' });

// Survey → PublishedResult (hasil agregat yang ditayangkan publik)
Survey.hasOne(PublishedResult, { foreignKey: 'survey_id', as: 'publishedResult', onDelete: 'CASCADE' });
PublishedResult.belongsTo(Survey, { foreignKey: 'survey_id', as: 'survey' });

User.hasMany(PublishedResult, { foreignKey: 'published_by', as: 'publishedResults' });
PublishedResult.belongsTo(User, { foreignKey: 'published_by', as: 'publisher' });

// Survey → MonitoringReport (embed monitoring klien)
Survey.hasOne(MonitoringReport, { foreignKey: 'survey_id', as: 'monitoringReport', onDelete: 'CASCADE' });
MonitoringReport.belongsTo(Survey, { foreignKey: 'survey_id', as: 'survey' });

module.exports = {
  sequelize,
  Sequelize,
  User,
  Survey,
  Question,
  SurveyorQuota,
  Response,
  Answer,
  AuditLog,
  ExportJob,
  PublishedResult,
  MonitoringReport,
};
