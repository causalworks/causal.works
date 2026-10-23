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

module.exports = { assertAppRoleIsRestricted };
