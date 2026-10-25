'use strict';

// Statement tree: lines carry amounts, parents are the weighted sum of their children, and checks gate the output.

class StatementIntegrityError extends Error {
  constructor(failures) {
    super('Statement failed its own checks: ' + failures.map((f) => f.message).join('; '));
    this.name = 'StatementIntegrityError';
    this.failures = failures;
  }
}

function line(label, cents, extra = {}) {
  return { label, cents: Number(cents), ...extra };
}

function group(label, children, extra = {}) {
  return { label, children, ...extra };
}

function amountOf(node) {
  if (!node.children) return node.cents;
  return node.children.reduce((s, c) => s + amountOf(c), 0);
}

// Flattens the tree into display rows; each group is followed by its total row.
function flatten(node, depth, rows) {
  if (!node.children) {
    rows.push({ kind: 'line', label: node.label, code: node.code || '', account_id: node.account_id || null, amount_cents: node.cents, indent: depth, key: node.key || null });
    return;
  }
  if (node.header !== false) rows.push({ kind: 'header', label: node.label, amount_cents: null, indent: depth, key: node.key || null });
  node.children.forEach((c) => flatten(c, depth + (node.header === false ? 0 : 1), rows));
  if (node.total) {
    rows.push({ kind: node.totalKind || 'subtotal', label: node.total, amount_cents: amountOf(node), indent: depth, key: node.key || null });
  }
}

// Re-adds the printed line rows under each total row and compares; guards the flatten step.
function footRows(rows) {
  const failures = [];
  const stack = [];
  rows.forEach((r, i) => {
    if (r.kind === 'header') stack.push({ idx: i, sum: 0, label: r.label });
    else if (r.kind === 'line' && stack.length) stack[stack.length - 1].sum += r.amount_cents;
    else if ((r.kind === 'subtotal' || r.kind === 'total') && stack.length) {
      const g = stack.pop();
      if (g.sum !== r.amount_cents) failures.push({ message: `${r.label} is ${r.amount_cents} but its lines add to ${g.sum}`, row: i });
      if (stack.length) stack[stack.length - 1].sum += r.amount_cents;
    }
  });
  return failures;
}

function runChecks(checks) {
  return checks.filter((c) => c.left !== c.right).map((c) => ({
    severity: c.severity || 'block',
    message: `${c.name}: ${c.left} vs ${c.right} (difference ${c.left - c.right})`,
    name: c.name, left: c.left, right: c.right,
  }));
}

function buildStatement(roots, checks) {
  const rows = [];
  roots.forEach((r) => flatten(r, 0, rows));
  const failed = [...footRows(rows).map((f) => ({ ...f, severity: 'block' })), ...runChecks(checks)];
  const blocking = failed.filter((f) => f.severity === 'block');
  if (blocking.length) throw new StatementIntegrityError(blocking);
  return { rows, warnings: failed.map((f) => f.message) };
}

module.exports = { StatementIntegrityError, line, group, amountOf, buildStatement, footRows, runChecks };
