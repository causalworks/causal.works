'use strict';
// Who may read the budget, grants, financial reports and activity routes.

const test = require('node:test');
const assert = require('node:assert');
const { canRead } = require('../../server/organizational/middleware/requireWriteAccess');

const who = (area, roles, perms) => roles.filter((r) => canRead({ coopOrgRole: r, accessPermissions: perms || [] }, area));
const ALL = ['admin', 'finance', 'staff', 'board', 'program', 'fundraising'];

test('financial reports: finance, admins and board; Reports access adds others', () => {
  assert.deepEqual(who('financial_reports', ALL), ['admin', 'finance', 'staff', 'board']);
  assert.deepEqual(who('financial_reports', ['fundraising'], ['reports']), ['fundraising']);
});

test('budget plan: also program leads, not fundraising', () => {
  assert.deepEqual(who('budget_plan', ALL), ['admin', 'finance', 'staff', 'board', 'program']);
  assert.deepEqual(who('budget_plan', ['fundraising'], ['manage_budget']), ['fundraising']);
});

test('grants: fundraising included', () => {
  assert.deepEqual(who('grants_read', ALL), ALL);
});

test('activity feed: every role that can read budget or grants', () => {
  assert.deepEqual(who('activity_feed', ALL), ALL);
});
