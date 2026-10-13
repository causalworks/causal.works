---
name: pm2-restart-health-check
description: Use after editing server-side code — restart the Node.js app via PM2, verify it's running, and confirm health.
user-invocable: true
---

# PM2 Restart & Health Check

Use this skill after editing any files under `server/` (routes, middleware, jobs, etc.) to restart the app and verify it's healthy.

**One-liner:**
```
/pm2-restart-health-check
```

## What This Skill Does

1. **Restart the app** via `pm2 restart causal-app`
2. **Verify status** via `pm2 status` — confirms process is running
3. **Check health** via curl to `/api/health` endpoint (if it exists)
4. **Report results** — running status, uptime, any errors

## When to Use

✅ **Use this skill after:**
- Editing `server/server.js` (routes, middleware)
- Editing `server/auth.js` (authentication)
- Editing `server/ai-service.js` (Gemini integration)
- Editing `server/timing-job.js` (cron jobs)
- Any backend code changes

❌ **Do NOT use for:**
- Frontend-only changes (editing `public/civic/`, `public/coop/`, `public/shared/`)
- Database migrations (use `pm2-db-migration-apply` instead)
- Configuration changes (use `pm2 restart` manually if needed)

## Output

The skill reports:
- **Process status** — running, stopped, error
- **Memory usage** — helps catch memory leaks
- **Uptime** — how long the process has been running
- **Health check result** — success or failure details

## Example

```
You: "I updated the /api/actions endpoint. Can you restart the server?"

Skill:
✓ Restarting causal-app...
✓ causal-app is running (PID 12345, uptime 0m 5s, memory 45MB)
✓ Health check passed (HTTP 200 from /api/health)

Server is ready!
```

## Notes

- Safe to run multiple times — no harm if process is already running
- If restart fails, the skill will report the error and suggest investigation steps
- Memory usage is shown — useful for spotting memory leaks after changes
- Health check timeout is 5 seconds
