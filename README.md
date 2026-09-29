# causal.works (causal-app)

Nonprofit and cooperative platform with two apps:
- **Agency** (`/individual/`) — personal civic action SPA
- **Cooperative** (`/organizational/`) — nonprofit workspace for budgeting, grants, accounting, and compliance

## Quick orientation

- **Agency app:** `public/individual/index.html` (SPA, hashed routes in `public/individual/js/router.js`)
- **Cooperative app:** `public/organizational/` (multi-page HTML, server-side routing)
- **Shared infrastructure:** `public/shared/` (auth, design tokens, PWA assets, project brief)
- **Server:** `server/server.js` (Express 5, PostgreSQL)
- **Project instructions:** [`CLAUDE.md`](CLAUDE.md) (how to work with this codebase)
- **Platform overview:** positioning and product summary live in the Project Brief page at `public/shared/project-brief/` (source: `docs/Project_Brief.md`)
- **Extra specs:** [`docs/README.md`](docs/README.md)

## Run locally

```bash
npm install
# Configure .env (secrets not committed — see team for values)
# Apply migrations (see db/README.md), then:
node server/server.js
```

Production commonly uses **PM2** (`pm2 restart causal-app` after backend changes).

## License

ISC — see `LICENSE`.
