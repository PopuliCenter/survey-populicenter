/**
 * Audit Log Helper
 * Provides a helper function to create audit log entries in the audit_logs table.
 */

const { AuditLog } = require('../models');

/**
 * Create an audit log entry.
 *
 * @param {Object} params
 * @param {string|null} params.userId      - ID of the user performing the action
 * @param {string}      params.action      - Action name (e.g. 'LOGIN', 'CREATE_ADMIN')
 * @param {string|null} params.entityType  - Type of entity affected (e.g. 'user', 'admin', 'survey')
 * @param {string|null} params.entityId    - UUID of the affected entity
 * @param {Object|null} params.oldValue    - Previous state (JSONB)
 * @param {Object|null} params.newValue    - New state (JSONB)
 * @param {string|null} params.ipAddress   - IP address of the requester
 * @returns {Promise<AuditLog>}
 */
async function createAuditLog({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  oldValue = null,
  newValue = null,
  ipAddress = null,
}) {
  return AuditLog.create({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_value: oldValue,
    new_value: newValue,
    ip_address: ipAddress,
  });
}

module.exports = { createAuditLog };
