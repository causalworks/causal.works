---
name: rest-api-scaffold
description: Use when building REST API endpoints — generates route handlers with error handling, validation, and logging patterns. Supports GET, POST, PUT, DELETE.
user-invocable: true
---

# REST API Endpoint Scaffolding

Use this skill to generate boilerplate for new REST endpoints. Examples:
- `GET /api/reps/:id/votes` — fetch voting record for a representative
- `POST /api/watch/contribute` — log a user contact action
- `PUT /api/actions/:id` — update an action with new data
- `DELETE /api/actions/:id` — archive/delete an action

This skill produces:
- **Route handler** with error handling and logging
- **Validation pattern** for inputs
- **Response format** matching your codebase conventions
- **Database query structure** (if applicable)
- **Test/verification commands** (curl examples)

## When to Use This Skill

- Creating a new endpoint from scratch
- Adding a variant of an existing endpoint (new method or path)
- Ensuring consistent error handling across endpoints
- Generating curl examples for manual testing

**Do NOT use this skill for:**
- Simple tweaks to existing endpoints (edit directly)
- Query-only operations without side effects (might not need an endpoint)
- Endpoints that don't need structured response formats

## Overview

The process:
1. **Define** the endpoint (method, path, purpose)
2. **Plan** inputs (URL params, query params, request body)
3. **Plan** outputs (response format, status codes)
4. **Generate** handler code with error handling
5. **Add** to server.js with proper routing
6. **Test** with curl

## Step 1: Define the Endpoint

Provide:
- **Method:** GET, POST, PUT, DELETE
- **Path:** `/api/reps/:id/votes` (include path parameters in `:name` format)
- **Purpose:** What does it do? Who calls it?

**Example:**
```
Method: GET
Path: /api/reps/:bioguide_id/votes
Purpose: Fetch voting record for a representative (called by civic profile panel)
```

## Step 2: Plan Inputs

**For GET:**
- Path parameters (e.g., `:bioguide_id`)
- Query parameters (e.g., `?limit=10&offset=0`)
- No request body (by convention)

**For POST/PUT/DELETE:**
- Path parameters (if any)
- Query parameters (if any)
- Request body (JSON object)

**Example for GET /api/reps/:bioguide_id/votes:**
```
Path params:
  bioguide_id (string, required) — congressional bioguide ID

Query params:
  limit (integer, optional, default 50) — max votes to return
  substantive_only (boolean, optional, default true) — filter by is_substantive flag

Request body: none
```

## Step 3: Plan Output

Define the response format:

```json
{
  "data": {
    "votes": [
      {
        "vote_id": "HR1234-2024-05-15-passage",
        "bill_id": "HR1234",
        "bill_title": "Clean Energy Act",
        "position": "Yea",
        "date": "2024-05-15",
        "turnarounds": ["Energy", "Inequality"]
      }
    ]
  },
  "meta": {
    "count": 10,
    "total": 45,
    "limit": 50,
    "offset": 0
  }
}
```

Also plan error responses:
- 400 Bad Request (invalid params)
- 401 Unauthorized (auth required)
- 404 Not Found (resource doesn't exist)
- 500 Server Error (unexpected failure)

## Step 4: Generate Handler Code

**Pattern for GET endpoint:**

```javascript
app.get('/api/reps/:bioguide_id/votes', async (req, res) => {
  const { bioguide_id } = req.params;
  const limit = parseInt(req.query.limit || 50);
  const substantiveOnly = req.query.substantive_only !== 'false';
  
  // Validation
  if (!bioguide_id || bioguide_id.trim().length === 0) {
    return res.status(400).json({ error: 'bioguide_id is required' });
  }
  
  if (isNaN(limit) || limit < 1 || limit > 500) {
    return res.status(400).json({ error: 'limit must be 1–500' });
  }
  
  try {
    // Query database
    const query = `
      SELECT 
        v.vote_id, v.bill_id, v.position, v.vote_date,
        b.title AS bill_title,
        b.turnarounds
      FROM rep_votes_cache v
      JOIN bills_cache b ON v.bill_id = b.bill_id
      WHERE v.bioguide_id = $1
      ${substantiveOnly ? 'AND v.is_substantive = true' : ''}
      ORDER BY v.vote_date DESC
      LIMIT $2
      OFFSET $3
    `;
    
    const offset = 0; // Add pagination later if needed
    const result = await db.query(query, [bioguide_id, limit, offset]);
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM rep_votes_cache WHERE bioguide_id = $1' +
      (substantiveOnly ? ' AND is_substantive = true' : ''),
      [bioguide_id]
    );
    const total = parseInt(countResult.rows[0].count);
    
    // Response
    res.json({
      data: {
        votes: result.rows
      },
      meta: {
        count: result.rows.length,
        total: total,
        limit: limit,
        offset: offset
      }
    });
    
  } catch (error) {
    console.error(`GET /api/reps/${bioguide_id}/votes error:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Pattern for POST endpoint (logging/side effects):**

```javascript
app.post('/api/watch/contribute', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { action_id, contact_type, contact_date } = req.body;
  
  // Validation
  if (!action_id) {
    return res.status(400).json({ error: 'action_id is required' });
  }
  
  const validTypes = ['call', 'email', 'letter', 'social', 'other'];
  if (contact_type && !validTypes.includes(contact_type)) {
    return res.status(400).json({ 
      error: `contact_type must be one of: ${validTypes.join(', ')}` 
    });
  }
  
  try {
    // Insert contribution log
    const result = await db.query(
      `INSERT INTO contributions (user_id, action_id, contact_type, contact_date, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
      [userId, action_id, contact_type || 'other', contact_date || new Date()]
    );
    
    res.json({
      data: {
        contribution_id: result.rows[0].id,
        logged_at: result.rows[0].created_at
      }
    });
    
  } catch (error) {
    console.error('POST /api/watch/contribute error:', error.message);
    res.status(500).json({ error: 'Failed to log contribution' });
  }
});
```

## Step 5: Add to server.js

Insert the route handler in `server/server.js`:

1. **Find the section** where similar endpoints live (grouped by resource)
2. **Add the handler** in the correct order (specific routes before generic ones)
3. **Restart server:** `pm2 restart causal-app`

**Example insertion point:**
```javascript
// ===== Representatives API =====
app.get('/api/reps/:bioguide_id/votes', async (req, res) => { ... });  // ← NEW
app.get('/api/reps/:id', async (req, res) => { ... });

// ===== Actions API =====
app.get('/api/actions', async (req, res) => { ... });
```

**Important routing rules:**
- **Specific routes first:** `/api/reps/bills-rationale` BEFORE `/api/reps/:id`
- **GET before POST:** No hard rule, but group by method for readability
- **Auth middleware:** If `requireAuth` is needed, declare it on the route

## Step 6: Test with curl

Once deployed, test manually:

```bash
# Test GET endpoint
curl -X GET "http://localhost:3000/api/reps/C000127/votes?limit=5"

# Test POST endpoint
curl -X POST "http://localhost:3000/api/watch/contribute" \
  -H "Content-Type: application/json" \
  -d '{"action_id": "act123", "contact_type": "call"}'

# Test with auth header
curl -X GET "http://localhost:3000/api/watch/profile" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Check response:**
- Status code (200, 400, 500?)
- Response body (JSON format correct?)
- Error messages (helpful?)

## Common Patterns

### Pattern 1: Fetch with Related Data (GET)

```javascript
app.get('/api/actions/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      `SELECT a.*, 
              json_agg(json_build_object(
                'id', r.id, 'name', r.name
              )) AS related_reps
       FROM actions a
       LEFT JOIN action_reps ar ON a.id = ar.action_id
       LEFT JOIN representatives r ON ar.rep_id = r.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }
    
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error(`GET /api/actions/${id} error:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Pattern 2: Create with Validation (POST)

```javascript
app.post('/api/actions', async (req, res) => {
  const { title, turnarounds, scenario_label } = req.body;
  
  // Required field validation
  if (!title || title.trim().length === 0) {
    return res.status(400).json({ error: 'title is required' });
  }
  
  // Enum validation
  const validLabels = ['Tipping Point', 'Giant Leap', 'Too Little Too Late'];
  if (scenario_label && !validLabels.includes(scenario_label)) {
    return res.status(400).json({ 
      error: `scenario_label must be one of: ${validLabels.join(', ')}` 
    });
  }
  
  try {
    const result = await db.query(
      `INSERT INTO actions (title, turnarounds, scenario_label, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [title, turnarounds || [], scenario_label]
    );
    
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('POST /api/actions error:', error.message);
    res.status(500).json({ error: 'Failed to create action' });
  }
});
```

### Pattern 3: Update with Partial Fields (PUT)

```javascript
app.put('/api/actions/:id', async (req, res) => {
  const { id } = req.params;
  const { title, scenario_label, timing_confidence } = req.body;
  
  try {
    // Build dynamic UPDATE based on provided fields
    const fields = [];
    const values = [id];
    let paramIndex = 2;
    
    if (title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (scenario_label !== undefined) {
      fields.push(`scenario_label = $${paramIndex++}`);
      values.push(scenario_label);
    }
    if (timing_confidence !== undefined) {
      fields.push(`timing_confidence = $${paramIndex++}`);
      values.push(timing_confidence);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await db.query(
      `UPDATE actions SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }
    
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error(`PUT /api/actions/${id} error:`, error.message);
    res.status(500).json({ error: 'Failed to update action' });
  }
});
```

## Key Conventions in This Codebase

- **Response format:** Always `{ data: ... }` or `{ data: ..., meta: ... }`
- **Errors:** Return `{ error: "message" }` with appropriate HTTP status
- **Status codes:** 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 500 (Server Error)
- **Auth:** Use `requireAuth` middleware for protected endpoints
- **Logging:** Always log to console on error — helps with debugging in pm2 logs
- **Database:** Use parameterized queries (`$1`, `$2`) to prevent SQL injection

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Returning error without status code | Always use `res.status(400).json(...)` not just `res.json(...)` |
| Not validating inputs | Check required fields, enum values, string length, numeric ranges |
| Logging personal data | Don't log user IDs, emails, or auth tokens to console |
| N+1 queries | Use `json_agg` or `JOIN` to fetch related data in one query, not a loop |
| Generic error messages | "Internal server error" is correct for 500, but log the actual error |
| Wrong route order | Specific routes (`/api/reps/bills`) must come BEFORE generic ones (`/api/reps/:id`) |
| Forgetting `await` on db.query | Will cause "Cannot read property rows" errors |

## Template Checklist

Before submitting a new endpoint:

- [ ] Validation: all required fields checked
- [ ] Response format: matches `{ data: ... }` convention
- [ ] Error handling: try-catch wraps DB calls
- [ ] Logging: console.error on failure
- [ ] Status codes: 201 for POST success, 404 for missing resources
- [ ] Route order: specific routes before generic ones
- [ ] Auth: requireAuth middleware if needed
- [ ] SQL: parameterized queries, no string concatenation
- [ ] Test: curl works with expected response
- [ ] Server restarted: `pm2 restart causal-app`
