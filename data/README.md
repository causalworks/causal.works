Data directory
==============

This folder holds supporting data files for Causal.

Subdirectories
--------------

- `cache/` — optional local cache for regenerable downloads (gitignored). The **live** US legislator JSON used by the app is under **`server/rep/data/`** (see `server/rep/us-reps.js`).
- `static/` — hand‑maintained or rarely changed seed/reference data (add JSON/CSV here, not JS code).

Refreshing cached data
----------------------

The congressional data files can be refreshed with:

```bash
# Example: refresh into app-owned rep data (paths may match your deploy layout)
curl -s https://unitedstates.github.io/congress-legislators/legislators-current.json \
  -o server/rep/data/legislators-current.json
```

These files are safe to delete and regenerate; they are not user data.

