---
name: async-trace-debug
description: Use when an async function hangs or doesn't complete — adds systematic logging and timeout guards to trace exactly where the execution stalls.
user-invocable: true
---

# Debug Hanging Async Functions

Use this skill when an async function never completes, a Promise never resolves, or code execution stalls silently. Examples:
- A page shows "Loading..." forever but no error appears
- `await someFunction()` never returns
- A parallel `Promise.all()` or `Promise.allSettled()` hangs indefinitely

## When to Use This Skill

- An async function execution stalls with no visible error
- You need to find which exact step in a sequence hangs
- A fetch call or Promise chain doesn't reject but doesn't resolve either
- You want to add timeout guards to long-running operations
- A page load hangs despite the server being healthy

**Do NOT use this skill for:**
- Synchronous code errors (use a regular debugger)
- Expected delays (e.g., intentional async waits)
- Errors you can already see in the console

## Overview: The Tracing Process

Hanging code often has **no error** — a Promise just never resolves. The solution:

1. **Add logging** at each step to see exactly where execution stops
2. **Add timeouts** to long-running operations so they reject instead of hang
3. **Inspect Promise results** to find failed or pending states
4. **Test with truncated logic** to isolate the culprit

## Step 1: Identify the Async Function

Find the function that hangs. Example:

```javascript
// In coop-budget.js, around line 1959
async function load() {
  const slug = parseSlug();
  const out = await apiJson('/api/coop/orgs/' + slug);
  // ... more code ...
  await Promise.all([loadProgramsForSelectors(slug), loadGrants(slug)]);
  // ... never gets here?
  await loadBudgetVsActualGrid({ explicitLoad: false });
}
```

**Evidence it hangs:**
- Page shows "Loading..." spinner forever
- No JavaScript console errors
- Browser DevTools shows the function was called but never returned

## Step 2: Add Tracing Logs

Insert `console.log()` at each step so you can see execution progress in the browser console:

```javascript
async function load() {
  console.log('1. load() started');
  
  const slug = parseSlug();
  console.log('2. slug parsed:', slug);
  
  const out = await apiJson('/api/coop/orgs/' + slug);
  console.log('3. org fetched:', out?.data?.org?.display_name);
  
  if (!slug || !out?.data?.org) {
    console.log('ERROR: missing slug or org data');
    return;
  }
  
  console.log('4. starting parallel loads');
  const [programs, grants] = await Promise.all([
    loadProgramsForSelectors(slug),
    loadGrants(slug)
  ]);
  console.log('5. parallel loads done');
  
  console.log('6. starting budget grid load');
  await loadBudgetVsActualGrid({ explicitLoad: false });
  console.log('7. budget grid done');
  
  console.log('8. load() complete!');
}
```

**Test it:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Navigate to the page
4. Watch the console — you'll see which log message is the last one before it hangs

**Example output:**
```
1. load() started
2. slug parsed: test-org
3. org fetched: Test Organization
4. starting parallel loads
5. parallel loads done
6. starting budget grid load
[stops here — loadBudgetVsActualGrid never completes]
```

Now you know exactly where it hangs.

## Step 3: Add Timeout Guards

Long-running operations should have timeouts so they reject instead of hang forever:

```javascript
// Helper: wrap a Promise in a timeout
function withTimeout(promise, ms, name = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// Usage:
async function load() {
  console.log('1. load() started');
  
  try {
    const slug = parseSlug();
    console.log('2. slug parsed:', slug);
    
    // Wrap the API call with a 10-second timeout
    const out = await withTimeout(
      apiJson('/api/coop/orgs/' + slug),
      10000,
      'fetch org data'
    );
    console.log('3. org fetched:', out?.data?.org?.display_name);
    
    // ... rest of function
  } catch (error) {
    console.error('load() failed:', error.message);
    // Show error to user instead of hanging
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) errorEl.textContent = 'Failed to load: ' + error.message;
  }
}
```

**What this does:**
- If the operation doesn't complete in 10 seconds, it rejects with "timed out"
- The `catch` block catches the timeout and shows the error instead of hanging forever
- You'll see the timeout error in the console, telling you which step is slow

## Step 4: Check Promise States (Advanced)

If you have a `Promise.all()` or `Promise.allSettled()`, check each result:

```javascript
console.log('6. starting parallel loads');
const results = await Promise.allSettled([
  withTimeout(loadProgramsForSelectors(slug), 5000, 'load programs'),
  withTimeout(loadGrants(slug), 5000, 'load grants')
]);

// Inspect each result
results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`  [${index}] ✓ fulfilled`);
  } else {
    console.log(`  [${index}] ✗ rejected:`, result.reason.message);
  }
});

console.log('7. parallel loads done (some may have failed)');
```

This tells you if any Promise in the group failed (and why).

## Step 5: Simplify to Isolate

If logging doesn't pinpoint the issue, strip the function down to find the culprit:

```javascript
async function load() {
  console.log('1. load() started');
  
  const slug = parseSlug();
  console.log('2. slug:', slug);
  
  const out = await apiJson('/api/coop/orgs/' + slug);
  console.log('3. org fetched');
  
  // COMMENT OUT everything else to see if it's the org fetch or later code
  // const [programs, grants] = await Promise.all([...]);
  // await loadBudgetVsActualGrid(...);
  
  console.log('4. done');
}
```

If it completes, the hang is in the code you commented out. Re-add one step at a time:

```javascript
// Re-add one operation
const programs = await withTimeout(loadProgramsForSelectors(slug), 5000, 'load programs');
console.log('5a. programs loaded');

const grants = await withTimeout(loadGrants(slug), 5000, 'load grants');
console.log('5b. grants loaded');
```

Now you'll see which operation hangs.

## Step 6: Fix & Test

Once you've found the culprit:

1. **If it's a timeout:** The operation is too slow. Investigate why or increase the timeout.
2. **If it's an error:** The Promise rejected silently. Add error handling:
   ```javascript
   try {
     const result = await loadBudgetVsActualGrid(...);
   } catch (error) {
     console.error('Budget grid failed:', error);
   }
   ```
3. **If it's indefinite:** The Promise never resolves or rejects. Likely a bug in the called function — trace into it with the same logging technique.

## Common Patterns: Why Promises Hang

| Pattern | Cause | Fix |
|---------|-------|-----|
| `await someFunc()` never returns | Function has an un-awaited async operation | Add `await` inside the function |
| `Promise.all([...])` never resolves | One Promise in the array hangs | Use `Promise.allSettled()` to see which failed |
| Fetch hangs without timeout | Network is slow or stuck | Add `AbortController` timeout |
| Parallel operations (Promise.all) hide errors | One rejects, others hang | Use `Promise.allSettled()` to see all results |
| DOM element doesn't exist | Code tries to access `element.textContent` on null | Add null checks before DOM access |

## Code Template: Production-Ready Async Wrapper

Use this for async functions that need timeout + error handling:

```javascript
async function loadWithTrace(name, fn, timeoutMs = 10000) {
  const startTime = performance.now();
  
  try {
    console.log(`[${name}] starting`);
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    
    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(`[${name}] ✓ done in ${elapsed}ms`);
    return result;
  } catch (error) {
    console.error(`[${name}] ✗ failed:`, error.message);
    throw error;
  }
}

// Usage:
const org = await loadWithTrace('fetch org', () => apiJson('/api/coop/orgs/' + slug));
const programs = await loadWithTrace('load programs', () => loadProgramsForSelectors(slug), 5000);
```

## Browser DevTools Tips

1. **Open Console:** F12 or Ctrl+Shift+I, then "Console" tab
2. **Filter by level:** Click "Log" to show only `console.log()` (not warnings)
3. **Timestamp each message:** Settings → Advanced → "Show Timestamps"
4. **Copy console output:** Right-click → "Save as..." to save for inspection

## Notes

- **Don't ship with excessive logging:** Remove trace logs before committing. Keep critical errors only.
- **Timeouts are band-aids:** If you add a timeout, ask why the operation is slow. Fix the root cause if possible.
- **Errors are better than hangs:** Even a timeout error is more useful than a silent hang.
- **Test in different conditions:** Some hangs only appear on slow networks. Throttle in DevTools: Network → "Slow 3G".
