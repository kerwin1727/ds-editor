# wx-editor backend (Express)

## Start

```bash
pnpm --filter ./apps/backend dev
```

Default address:

- `http://127.0.0.1:3210`

Default super admin:

- username: `admin`
- password: `kerwin`

## Storage

Data is persisted to:

- `apps/backend/data/wx-editor-resource.json`

## API base for frontend

Frontend defaults to `/wx-editor-api`.

In local dev, Vite proxy rewrites:

- `/wx-editor-api/*` -> `http://127.0.0.1:3210/*`
