---
name: xero-sync-audit
description: Use when debugging Xero integration — verifies data freshness, compares Xero vs Causal accounts, flags sync issues and missing account mappings.
user-invocable: true
---

# Xero Sync Audit

Use this skill to verify Xero integration health and detect sync mismatches.

## When to Use

✅ **Use this skill to:**
- Verify Xero data freshness after a sync
- Find accounts in Xero that haven't been imported to Causal
- Detect unmapped accounts (Xero exists but no mapping in Causal)
- Check account balance discrepancies
- Verify Xero OAuth token is still valid
- Audit P&L actuals sync status

❌ **Do NOT use for:**
- Troubleshooting individual Xero API errors (check PM2 logs)
- Fixing Xero authentication (use Postmark integration instead)
- Changing account mappings (use budget UI)

## How to Use

### Basic Audit (Current Org)

```
/xero-sync-audit
```

Skill will prompt for org slug, then run full audit:
1. Check Xero connection status
2. List all Xero accounts
3. Compare with Causal accounts
4. Flag unmapped/orphaned accounts
5. Verify balance freshness

### With Specific Org

```
/xero-sync-audit test-org
```

Runs audit for that org immediately.

### With Options

```
/xero-sync-audit test-org --full
```

`--full`: Include detailed balance comparison and P&L actuals

---

## Output

### Connection Status

```
✓ Xero connection active
  Last sync: 2026-06-11 14:23 UTC (23 minutes ago)
  Token expires: 2026-06-18 (6 days)
  Accounts last pulled: 2026-06-11 14:23
```

### Account Comparison

```
=== ACCOUNTS SUMMARY ===
Xero: 47 total accounts
Causal: 42 mapped accounts
Unmapped: 5 accounts in Xero not in Causal

=== UNMAPPED ACCOUNTS (in Xero, missing from Causal) ===
1. Xero account: 50600 — Meals & Entertainment
   Status: Active
   Balance: $1,234.56
   → Action: Should this be imported? Check budget_scope setting.

2. Xero account: 41000 — Prepaid Expenses
   Status: Active
   Balance: $5,678.90
   → Action: Asset account; verify if needed in Causal.

=== ORPHANED ACCOUNTS (in Causal, not in current Xero) ===
1. Causal: expenses:office-supplies
   Xero mapping: 51200 (now archived in Xero)
   → Action: Check if account is still in use; consider archiving mapping.
```

### Balance Freshness

```
=== BALANCE FRESHNESS ===
Account: 40000 — Revenue
  Xero balance: $123,456.78
  Causal balance: $123,456.78 (synced 2026-06-11 14:23)
  ✓ Match

Account: 50000 — Salaries
  Xero balance: $45,678.90
  Causal balance: $45,670.00 (synced 2026-06-11 14:00)
  ⚠ Difference: $8.90 (possible pending transactions)
  → Sync again or check Xero for recent transactions
```

### P&L Actuals Status

```
=== P&L ACTUALS SYNC ===
Last sync: 2026-06-10 (1 day ago)
Period covered: 2026-06-01 to 2026-06-10
Accounts with actuals: 23
Accounts missing actuals: 3

Missing actuals:
  - 50600 (Meals) — not in Xero's P&L
  - 51200 (Office Supplies) — not in Xero's P&L
  → These may be zero; re-sync to confirm
```

---

## What Gets Checked

### 1. Xero Connection

- ✓ OAuth token exists and valid
- ✓ Token not expired
- ✓ Can reach Xero API
- ✓ Organization in Xero is accessible

### 2. Account Mapping

- ✓ All Xero accounts have been listed
- ✓ Active Xero accounts are mapped in Causal
- ✓ No Causal accounts point to archived Xero accounts
- ✓ Account codes match between systems

### 3. Balance Sync

- ✓ Account balances in Causal match Xero (within tolerance)
- ✓ No stale balances (older than 24 hours)
- ✓ P&L actuals are up to date

### 4. Data Integrity

- ✓ Account hierarchy is consistent (parent/child relationships)
- ✓ No duplicate account mappings
- ✓ All Xero account types are recognized

---

## Interpreting Results

### Red Flags 🚨

| Finding | Meaning | Action |
|---------|---------|--------|
| ❌ Xero connection inactive | OAuth token missing/expired | Re-authenticate in Integrations settings |
| ❌ Large balance difference | $100+ mismatch | Manual sync or check for pending transactions |
| ❌ Actuals older than 48 hours | P&L sync is stale | Check server logs; may need manual trigger |
| ❌ Unmapped active accounts | 5+ Xero accounts not in Causal | Import missing accounts via onboarding wizard |

### Yellow Warnings ⚠️

| Finding | Meaning | Action |
|---------|---------|--------|
| ⚠️ Unmapped accounts | <5 Xero accounts not in Causal | Verify if needed; skip if intentional |
| ⚠️ Orphaned accounts | Causal mapping points to archived Xero | Update or remove mapping |
| ⚠️ Balance difference <$100 | Rounding or pending transactions | Monitor; re-sync if persists |
| ⚠️ Actuals sync 12–48 hours old | Slightly stale data | Not urgent; will auto-update daily |

### Green Status ✓

- ✓ Connection active, token valid
- ✓ <2 unmapped accounts
- ✓ Balances match within tolerance
- ✓ Actuals synced within 24 hours
- ✓ No orphaned accounts

---

## Examples

### Full Audit

```
You: /xero-sync-audit test-org --full

Skill: Running full Xero sync audit for test-org...

✓ Xero connection active
  Token: valid until 2026-06-18
  Last sync: 23 minutes ago

=== ACCOUNTS ===
✓ 42 / 47 Xero accounts mapped
  5 unmapped (listed below)
  0 orphaned

=== UNMAPPED ===
1. 50600 — Meals & Entertainment (Active, $1,234.56)
2. 41000 — Prepaid Expenses (Active, $5,678.90)

=== BALANCE CHECK ===
✓ All mapped accounts match within tolerance
✓ No balances older than 24 hours

=== P&L ACTUALS ===
✓ Last synced: 2026-06-10 (1 day ago)
✓ 23 / 25 accounts have actuals

Ready to import unmapped accounts? Or export audit as CSV?
```

### Quick Status Check

```
You: /xero-sync-audit test-org

✓ Xero active
  Token valid, 47 accounts, 42 mapped
  Last sync: 23 minutes ago
  ⚠ 5 unmapped accounts (use --full for details)
```

---

## Adaptive Design

This skill gracefully handles:
- ✓ Missing Xero integration tables (reports "not configured")
- ✓ Missing account mapping columns (reports "mapping unavailable")
- ✓ Partial sync (audits what's available)
- ✓ Schema changes (detects missing tables and suggests next steps)
- ✓ Different Xero account hierarchies

If required tables are missing, you'll see:
```
⚠ Cannot verify P&L actuals (table not found)
  Suggestion: Create coop_xero_actuals table or run migration
```

---

## Next Steps

Based on audit results:
1. **Unmapped accounts** → Use budget onboarding to import
2. **Orphaned accounts** → Remove Xero mapping or unarchive in Xero
3. **Stale balances** → Manual re-sync via Integrations → Xero → Refresh
4. **Token expired** → Re-authenticate via Integrations → Xero → Connect

## Notes

- Tolerance for balance differences: ±$0.01 per account (rounding)
- P&L actuals considered "fresh" if within 24 hours
- Xero OAuth tokens valid for ~30 days (refresh ~7 days before expiry)
- Archived Xero accounts are not imported (intentional)
- Audit is read-only — no changes made
