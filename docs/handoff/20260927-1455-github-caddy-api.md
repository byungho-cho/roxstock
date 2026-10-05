# RoxStock Caddy API routing activation handoff

## Document info

- Owner: GitHub / CI-CD
- Date: 2026-09-27 KST
- Target: https://newrox.cafe24.com
- Backend workflow: Backend Test Build Deploy #6
- Backend image: newrox/roxstock-backend:sha-5e63475

## Current verified state

GitHub Actions #6 completed successfully:

- Backend Test: success
- Backend Build: success
- Production image smoke test: success
- Docker build/push: success
- Server deployment: success
- Prisma migrate status: database schema up to date
- Prisma migrate deploy: no pending migrations
- roxstock-backend: running / healthy
- backend image: newrox/roxstock-backend:sha-5e63475
- backend host port publishing: none
- internal port: 3300
- DB target resolved as roxstock-mariadb:3306
- /health and /health/db passed during deployment

The remaining task is to activate the prepared Caddy /api routing and verify that external API responses are really backend JSON rather than frontend HTML.

## Server owner: final activation

### 1. Pre-check

Before changing Caddy, verify:

- roxstock-backend is still running / healthy
- roxstock-proxy is running / healthy
- roxstock-frontend is running / healthy
- roxstock-mariadb is running / healthy
- roxstock-backend is attached to roxstock_app and roxstock-db_default
- host 3300 is not published
- MariaDB remains bound only to 127.0.0.1:3306 on the host

If backend is not healthy, stop and report. Do not change Caddy.

### 2. Back up the live Caddyfile

Back up:

/opt/roxstock/infra/caddy/Caddyfile

to a timestamped path under the existing .ops-backups area.

Do not replace or delete infra/caddy as a directory.
Do not touch roxstock_caddy_data or roxstock_caddy_config volumes.

### 3. Add API routing

Preserve the existing global Caddy options and HTTPS configuration.

For newrox.cafe24.com, route only /api and /api/* to:

roxstock-backend:3300

Preserve the /api prefix.

All non-API requests must continue to:

frontend:80

Use a Caddy configuration equivalent to:

newrox.cafe24.com {
    @api path /api /api/*
    handle @api {
        reverse_proxy roxstock-backend:3300
    }

    handle {
        reverse_proxy frontend:80
    }
}

Use syntax compatible with the installed Caddy version.

Do not publicly proxy /health or /health/db unless explicitly required; they remain internal backend health endpoints.

### 4. Validate before reload

Validate the exact live candidate configuration using the existing Caddy container/image.

If validation fails:
- do not reload
- restore/keep the previous live file
- report the validation error

If validation succeeds, perform a graceful Caddy reload. Do not recreate Caddy or delete its volumes.

If reload fails:
- restore the backup Caddyfile
- validate the restored configuration
- reload the restored configuration
- report the failure and recovery

### 5. External verification

After reload, verify response status AND content type/body semantics.

Required:

- GET https://newrox.cafe24.com/api/accounts
  - HTTP success
  - JSON response, not text/html
- GET https://newrox.cafe24.com/api/securities
  - HTTP success
  - JSON response, not text/html
- GET https://newrox.cafe24.com/api/__handoff_nonexistent
  - backend-style 404
  - must not return frontend index.html
- GET https://newrox.cafe24.com/
  - frontend remains HTTP 200
- direct frontend route /detail/assets
  - HTTP 200
  - refresh/direct request remains valid
- HTTP newrox.cafe24.com
  - still redirects to HTTPS
- TLS remains valid

Do not call POST/PUT/PATCH/DELETE endpoints and do not create test trading data.

### 6. Final infrastructure verification

Record:

- roxstock-backend image/tag, image ID, health
- backend networks
- no host publishing for 3300
- Prisma migrate status
- roxstock-mariadb health and 127.0.0.1-only 3306 binding
- roxstock-proxy health
- roxstock-frontend health
- external accounts/securities JSON status
- nonexistent API 404 status
- frontend home/direct route status
- HTTP -> HTTPS status

### 7. Result handoff

Create a new KST timestamped document:

docs/handoff/YYYYMMDD-HHMM-server-backend-final.md

Include:

- Caddy backup path
- exact routing change (no secrets)
- Caddy validate result
- reload result
- backend image/tag and image ID
- backend health/networks
- Prisma status
- accounts/securities HTTP + content-type result
- nonexistent API 404 result
- frontend/HTTPS verification
- 3300/3306 exposure verification
- Caddy/frontend/MariaDB final health
- any failure/recovery

Never include passwords, DATABASE_URL, private keys, tokens, or certificate private keys.

Commit/push only the handoff document using the established Handoff Writer key. Do not commit the live Caddyfile, .env.production, logs, backups, or operating-tree changes.

## After this step

Once this final handoff confirms JSON API routing and existing frontend/HTTPS health, the initial RoxStock backend production deployment can be considered complete.

Future backend-related pushes to main should use the existing Backend Test Build Deploy workflow and immutable sha image deployment.
