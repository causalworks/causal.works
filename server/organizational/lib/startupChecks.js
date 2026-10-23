'use strict';
// Startup safety checks for the database connection role.

async function assertAppRoleIsRestricted(pool) {
  const r = await pool.query(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
  );
  const role = r.rows[0];
  if (!role) throw new Error('startup check: could not read the current database role');
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `startup check: the app is connected as "${role.rolname}", which bypasses row-level security. ` +
      'Connect as the restricted app role (DB_USER).'
    );
  }
}

async function assertOwnerRightsFunctionsBypass(pool) {
  const r = await pool.query(
    `SELECT p.proname, r.rolname
       FROM pg_proc p
       JOIN pg_roles r ON r.oid = p.proowner
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND n.nspname = 'public' AND NOT (r.rolsuper OR r.rolbypassrls)`
  );
  if (r.rows.length) {
    const list = r.rows.slice(0, 10).map((x) => `${x.proname} (owner ${x.rolname})`).join(', ');
    throw new Error(
      `startup check: ${r.rows.length} owner-rights function(s) are owned by a role that does not bypass row-level security: ${list}`
    );
  }
}

module.exports = { assertAppRoleIsRestricted, assertOwnerRightsFunctionsBypass };
