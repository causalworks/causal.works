---
name: form-state-debugger
description: Use when budget form edits aren't persisting — traces unsaved changes, verifies network requests, and detects where form state breaks.
user-invocable: true
---

# Form State Debugger

Use this skill to debug budget form issues: unsaved changes, failed persists, stuck loading states, or data not showing.

## When to Use

✅ **Use this skill when:**
- Personnel or account form shows unsaved changes but won't save
- Form appears to save but changes don't persist
- Page shows "Loading..." forever
- Inline edit not working
- Form field doesn't update backend value
- Changes made in UI but don't appear after page reload

❌ **Do NOT use for:**
- General form styling issues (use CSS directly)
- Validation error messages (check console)
- Authorization/permission errors (check logs)

## How to Use

### Browser Console (Real-time)

Paste this in browser DevTools console while using budget form:

```javascript
// Enable form state tracking
window._debugFormState = true;

// Then interact with the form:
// 1. Edit a field
// 2. Look at console output
// 3. Watch for: "Form dirty", "Saving...", "Saved ✓" or "Save failed ✗"
```

### Log Form Changes

```javascript
// Show all form changes as they happen
window._logFormChanges = true;

// Then edit a form field
// Console will show:
// [FORM] Field changed: employee_name from "John" to "John Doe"
// [FORM] Form marked dirty: true
// [FORM] Sending to backend...
// [FORM] Response: 200 OK
```

### Check Current Form State

```javascript
// In budget.js context
console.log({
  dirtyFields: window._formDirty,
  pendingRequest: window._savePending,
  lastError: window._lastFormError,
  unsavedChanges: window._getUnsavedChanges?.()
});
```

### Network Trace

Open DevTools Network tab, then:
1. Edit form field
2. Look for POST/PATCH request
3. Check:
   - **Request body** — what data was sent?
   - **Response status** — 200 (success), 400 (validation), 500 (error)?
   - **Response body** — error message?

---

## Skill Runner (Interactive)

```
/form-state-debugger
```

Launches interactive debugger. You'll be guided through:

1. **Identify the form** — Which form isn't working? (personnel, account, etc.)
2. **Reproduce the issue** — Edit a field, try to save
3. **Capture logs** — Skill instruments the form to capture state changes
4. **Analyze** — Skill shows:
   - What changed
   - What was sent to backend
   - What response came back
   - Why save failed (if it did)

### Output Example

```
=== FORM STATE DEBUG TRACE ===

Form: Personnel (employee_id: 123)

Step 1: Edit form field
  Field: full_name
  Changed from: "John Smith"
  Changed to: "John Q. Smith"
  Form marked dirty: ✓

Step 2: Click Save
  Request sent to: PATCH /api/coop/orgs/test-org/personnel/123
  Request body:
    {
      "full_name": "John Q. Smith",
      "updated_at": "2026-06-11T14:23:00Z"
    }
  
  Response: HTTP 200
  Response body:
    {
      "data": {
        "id": 123,
        "full_name": "John Q. Smith",
        "updated_at": "2026-06-11T14:25:30Z"
      }
    }

Step 3: UI update
  ✓ Form cleared of dirty flag
  ✓ UI updated with new value
  ✓ Success message shown

RESULT: ✓ Save successful
```

---

## Common Issues & Diagnosis

### Issue: "Form won't save (stuck on 'Saving...')"

**Diagnosis steps:**

1. **Check network tab** (DevTools → Network)
   ```
   Look for stuck/pending request
   If found: Network issue or server hang
   If not found: Form not sending request (frontend bug)
   ```

2. **Check console for errors**
   ```
   DevTools → Console
   Look for: "Error", "TypeError", "fetch failed"
   ```

3. **Check backend logs**
   ```bash
   pm2 logs causal-app | grep "PATCH\|POST"
   Look for: Is the endpoint being called? Any errors?
   ```

**Most likely causes:**
- ❌ Authorization header missing (check auth.js)
- ❌ Endpoint URL wrong (check route definition)
- ❌ Request body malformed (check field names)
- ❌ Backend validation failing (returns 400)
- ❌ Server error (returns 500)

### Issue: "Form saves but changes don't persist"

**Diagnosis:**

1. **Check what was saved**
   ```
   DevTools → Network → Request body
   What fields were included? Are they correct?
   ```

2. **Check response body**
   ```
   Did the server echo back the correct values?
   If values are wrong in response, backend didn't save correctly.
   ```

3. **Reload page and check**
   ```
   Does the change persist after reload?
   If not: Backend saved something different than sent
   If yes: Frontend state management issue (shows old value)
   ```

**Most likely causes:**
- ❌ Database column is read-only (migration missing)
- ❌ Backend validation rejects value (returns 400 with error)
- ❌ Field name mismatch (frontend sends `name`, backend expects `full_name`)
- ❌ Timestamp constraint (updated_at conflict with concurrent edit)

### Issue: "Page shows 'Loading...' forever"

**Diagnosis:**

1. **Check which request is hanging**
   ```
   DevTools → Network tab
   Look for requests with no response
   Which endpoint is stuck?
   ```

2. **Check server logs**
   ```bash
   pm2 logs causal-app
   Is the request reaching the server?
   Is it hanging on a database query?
   ```

3. **Set timeout and check error**
   ```javascript
   // After 10 seconds, log what's still pending
   setTimeout(() => {
     console.log('Still loading:', window._pendingRequests);
   }, 10000);
   ```

**Most likely causes:**
- ❌ Database query too slow (missing index)
- ❌ API hanging on external call (Xero integration?)
- ❌ Promise.all() with one failing promise (use Promise.allSettled())
- ❌ Missing await in async code
- ❌ Circular dependency in data loading

### Issue: "Changes made but UI doesn't update"

**Diagnosis:**

1. **Backend saved correctly?**
   ```
   Check response body in Network tab
   Does it contain the new value?
   ```

2. **Frontend updating state?**
   ```
   Add this in console:
   console.log('Form value:', document.querySelector('input[name=full_name]').value);
   console.log('Cache value:', window._formCache?.full_name);
   
   Do they match what you edited?
   ```

3. **Reload page and check**
   ```
   Does the value appear after refresh?
   If yes: Frontend state issue (didn't update UI)
   If no: Backend didn't save (go to "Save failed" diagnosis)
   ```

**Most likely causes:**
- ❌ Frontend not parsing response correctly
- ❌ DOM element not in response (check selector)
- ❌ Cache invalidation missing (old data shown)
- ❌ Component re-render skipped

---

## Instrumentation Guide

For real-time debugging, add this to budget.js:

```javascript
// Minimal form state tracking
function logFormState(action, data) {
  console.log(`[FORM] ${action}:`, data);
}

// Track field changes
document.addEventListener('change', (e) => {
  if (e.target.matches('input, select, textarea')) {
    logFormState('Field changed', {
      field: e.target.name,
      value: e.target.value,
      dirty: true
    });
  }
}, true);

// Track save attempts
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (String(args[0]).includes('/api/coop') && (args[1]?.method === 'PATCH' || args[1]?.method === 'POST')) {
    logFormState('Fetch request', { url: args[0], method: args[1]?.method });
  }
  return originalFetch.apply(this, args);
};
```

---

## Backend Debugging

When frontend looks correct but backend isn't saving:

```bash
# Check for validation errors
grep -n "res.status(400)\|res.status(422)" server/coop/routes/personnel.js

# Check if field is in update query
grep -n "UPDATE.*personnel" server/coop/routes/personnel.js

# Check auth middleware
grep -n "requireAdminRole\|requireAuth" server/coop/routes/personnel.js

# Test endpoint with curl
curl -X PATCH "http://localhost:3000/api/coop/orgs/test-org/personnel/123" \
  -H "Content-Type: application/json" \
  -d '{"full_name": "John Q. Smith"}'
```

---

## Network Tab Checklist

When debugging form saves:

- [ ] Request URL is correct (check org slug, ID)
- [ ] Request method is PATCH or POST (not GET)
- [ ] Request has `Content-Type: application/json` header
- [ ] Request body has all changed fields
- [ ] Authorization header exists (check cookies)
- [ ] Response status is 200 or 201 (not 400, 500)
- [ ] Response body echoes back correct values
- [ ] Response time < 2 seconds (not hanging)

---

## Adaptive Design

This skill gracefully handles:
- ✓ Different form frameworks (inline edit, modal form, etc.)
- ✓ Different backend APIs (personnel, accounts, allocations)
- ✓ Missing response fields (reports "not in response")
- ✓ Network delays (has timeout detection)
- ✓ Validation errors (captures and explains)

If a form structure changes (new fields, new endpoint), the skill will:
1. Attempt to auto-detect new structure
2. Report what changed
3. Suggest next debugging steps

---

## Examples

### Quick Test (Copy-Paste to Console)

```javascript
// Test if form is wired to backend
const testInput = document.querySelector('input[name="full_name"]');
testInput.value = "Test " + Date.now();
testInput.dispatchEvent(new Event('change', { bubbles: true }));

// Wait 2 seconds, then check if Network tab shows request
console.log('Check Network tab for POST/PATCH request...');
```

### Full Interactive Debug

```
You: /form-state-debugger

Skill: Which form would you like to debug?
  [ ] Personnel edit
  [ ] Account edit
  [ ] Budget line edit
  [ ] Other (specify)

You: Personnel edit

Skill: I'll track form state changes. Edit an employee name and hit save.
       (Instrumentation enabled...)

You: (Edit name in UI and save)

Skill: Captured form state change:
  Field: full_name
  Old: "John Smith"
  New: "John Q. Smith"
  Sent to: PATCH /api/coop/orgs/test-org/personnel/123
  Response: 200 OK
  ✓ Successfully saved!
```

---

## Notes

- Form debugging is non-destructive (reads only)
- Console logging can be toggled on/off without page reload
- Instrumentation shows frontend + backend interaction
- Network trace reveals any connectivity issues
- Most form issues are field-name mismatches or missing endpoints
