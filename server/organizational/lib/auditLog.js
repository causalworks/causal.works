'use strict';

async function logAudit(pool, { orgId, userId, action, tableName, recordId, fields, metadata }) {
  if (!pool || !orgId || !action || !tableName || !recordId) return;

  try {
    if (action === 'update' && fields && fields.length > 0) {
      for (const { fieldName, oldValue, newValue } of fields) {
        await pool.query(
          `INSERT INTO org_audit_log
             (org_id, user_id, action, table_name, record_id, field_name, old_value, new_value, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            orgId,
            userId || null,
            'update',
            tableName,
            recordId,
            fieldName,
            oldValue != null ? String(oldValue) : null,
            newValue != null ? String(newValue) : null,
            metadata ? JSON.stringify(metadata) : null,
          ]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO org_audit_log
           (org_id, user_id, action, table_name, record_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orgId,
          userId || null,
          action,
          tableName,
          recordId,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );
    }
  } catch (err) {
    console.error('auditLog write failed:', err.message);
  }
}

function diffFields(before, after, keys) {
  const fields = [];
  for (const key of keys) {
    const oldVal = before[key] != null ? String(before[key]) : null;
    const newVal = after[key] != null ? String(after[key]) : null;
    if (oldVal !== newVal) {
      fields.push({ fieldName: key, oldValue: oldVal, newValue: newVal });
    }
  }
  return fields;
}

function reqMeta(req) {
  return {
    ip: req.ip || (req.headers && req.headers['x-forwarded-for']) || null,
    ua: (req.headers && req.headers['user-agent']) || null,
  };
}

module.exports = { logAudit, diffFields, reqMeta };
