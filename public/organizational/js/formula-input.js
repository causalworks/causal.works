/* formula-input.js — shared "type a formula into a money field" helper for Purchases, Sales,
 * and Expense Claims amount inputs (found needed 2026-09-17: breaking a bill/invoice down into
 * several account/program lines by hand meant re-adding printed sub-amounts on a calculator
 * first). Lets a field take "=192+268.50" (or just "192+268.50", no leading "=" required) and
 * resolves it to a plain number on blur/Enter -- never on every keystroke, so a half-typed
 * expression isn't clobbered mid-entry.
 *
 * A hand-rolled recursive-descent parser, not eval()/Function() -- not primarily a security
 * concern here (the input is the signed-in user's own browser), but a strict grammar means a
 * typo reliably fails closed (field is flagged, value untouched) instead of doing something
 * silently wrong with a money amount. Supports + - * / ( ) and decimals only.
 *
 * Usage: change the input from type="number" to type="text" inputmode="decimal", and add the
 * "organizational-formula-amount" class alongside its own class. That's it -- wiring is a single
 * delegated listener on `document` (below), not a per-element attach() call, so it keeps working
 * for lines added/removed dynamically after a panel's initial render without every add-line
 * button needing to remember to re-wire anything.
 */
(function () {
  'use strict';

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (c === ' ') { i++; continue; }
      if ('+-*/()'.includes(c)) { tokens.push(c); i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
        const numStr = expr.slice(i, j);
        if (!/^\d*\.?\d+$/.test(numStr)) return null; // malformed number, e.g. "1.2.3"
        tokens.push(Number(numStr));
        i = j;
        continue;
      }
      return null; // any other character -- not a formula we understand
    }
    return tokens;
  }

  /** Recursive-descent parser/evaluator over a flat token array. Returns a number, or null on any syntax error. */
  function parseTokens(tokens) {
    let pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }

    function parseFactor() {
      const t = peek();
      if (t === '-') { next(); const v = parseFactor(); return v == null ? null : -v; }
      if (t === '+') { next(); return parseFactor(); }
      if (t === '(') {
        next();
        const v = parseExpr();
        if (v == null || peek() !== ')') return null;
        next();
        return v;
      }
      if (typeof t === 'number') { next(); return t; }
      return null;
    }
    function parseTerm() {
      let v = parseFactor();
      if (v == null) return null;
      while (peek() === '*' || peek() === '/') {
        const op = next();
        const rhs = parseFactor();
        if (rhs == null) return null;
        if (op === '/') { if (rhs === 0) return null; v = v / rhs; } else { v = v * rhs; }
      }
      return v;
    }
    function parseExpr() {
      let v = parseTerm();
      if (v == null) return null;
      while (peek() === '+' || peek() === '-') {
        const op = next();
        const rhs = parseTerm();
        if (rhs == null) return null;
        v = op === '+' ? v + rhs : v - rhs;
      }
      return v;
    }

    const result = parseExpr();
    if (result == null || pos !== tokens.length || !Number.isFinite(result)) return null;
    return result;
  }

  /** True if `raw` looks like something meant as a formula rather than a plain typed number. */
  function isFormulaLike(raw) {
    const s = String(raw || '').trim();
    if (!s) return false;
    if (s[0] === '=') return true;
    if (/^-?\d*\.?\d+$/.test(s)) return false; // plain number -- nothing to evaluate
    return /[+*/]/.test(s) || /\d\s*-\s*\d/.test(s) || s.includes('(');
  }

  /** Evaluates a formula string (leading "=" optional, "$"/","/whitespace tolerated). Returns a number or null. */
  function evaluateFormula(raw) {
    let s = String(raw || '').trim();
    if (s[0] === '=') s = s.slice(1);
    s = s.replace(/[$,]/g, '').trim();
    if (!s) return null;
    const tokens = tokenize(s);
    if (!tokens || !tokens.length) return null;
    return parseTokens(tokens);
  }

  // Some marked fields (e.g. invoices-ui.js's FMV field) already carry their own static
  // `title` tooltip -- cache it once so an error/clear cycle restores it instead of wiping it.
  function restoreOriginalTitle(input) {
    if (input.dataset.formulaOrigTitle) input.title = input.dataset.formulaOrigTitle;
    else input.removeAttribute('title');
  }

  function resolveInput(input) {
    if (input.dataset.formulaOrigTitle === undefined) input.dataset.formulaOrigTitle = input.getAttribute('title') || '';
    const raw = input.value;
    if (!isFormulaLike(raw)) { input.classList.remove('organizational-formula-error'); restoreOriginalTitle(input); return; }
    const result = evaluateFormula(raw);
    if (result == null || result < 0) {
      input.classList.add('organizational-formula-error');
      input.title = 'Could not evaluate this formula -- fix it or enter a plain number.';
      return;
    }
    input.classList.remove('organizational-formula-error');
    restoreOriginalTitle(input);
    input.value = result.toFixed(2);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const MARKER_CLASS = 'organizational-formula-amount';

  // Delegated on `document`, once, for the life of the page -- covers every current and future
  // field carrying the marker class, including rows inserted later by an "+ Add line" button,
  // with no per-render wiring needed. `focusout` (not `blur`) because it bubbles.
  document.addEventListener('focusout', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains(MARKER_CLASS)) resolveInput(e.target);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains(MARKER_CLASS)) {
      e.preventDefault();
      resolveInput(e.target);
    }
  });

  window.OrganizationalFormulaInput = { evaluateFormula: evaluateFormula, isFormulaLike: isFormulaLike };
})();
