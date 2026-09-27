# RoxStock backend production handoff

## Document info

- Owner: GitHub / CI-CD
- Date: 2026-09-27 KST
- Repository: byungho-cho/roxstock
- Target: https://newrox.cafe24.com
- Latest CI commit: cd99ee39aec24342319b7974b31f4e5f955134d9
- Backend workflow run: Backend Test Build Deploy #3

## GitHub work completed

The following production backend files are now on main:

- backend/Dockerfile
- infra/docker/compose.prod-backend.yml
- scripts/deploy-backend.sh
- .github/workflows/backend-deploy.yml
- .dockerignore updated so Prisma schema/migrations are included in the backend image context.

CI result for run #3:

- Backend Test: success
- Backend Build: success
- Backend Docker Build / Docker Hub push: success
- Backend Deploy: intentionally stopped before container changes because /opt/roxstock/backend/.env.production does not exist.

The deploy reached the server over SSH and fast-forwarded main successfully. No backend container was started by run #3.

## Production topology encoded in GitHub

Backend container:

- name: roxstock-backend
- internal port: 3300
- host port publishing: none
- restart: unless-stopped
- app network: roxstock_app
- DB network: roxstock-db_default
- DB DNS target: roxstock-mariadb:3306

Health paths:

- /health
- /health/db

API prefix remains /api.

## Server owner: next work

Perform the following carefully on /opt/roxstock. Preserve the existing frontend, Caddy, MariaDB, volumes, and infra/caddy content.

### 1. Synchronize safely

The server has operating-tree changes. Do not use git reset --hard or git clean.

Confirm that main contains the latest GitHub backend files. If local operating changes prevent a safe fast-forward, stop and report instead of overwriting them.

### 2. Create backend production environment file

Create only on the server:

/opt/roxstock/backend/.env.production

Mode must be 600.

Required non-secret settings:

NODE_ENV=production
HOST=0.0.0.0
PORT=3300

DATABASE_URL must use the existing production DB credentials but change the host to the Docker DNS name:

roxstock-mariadb:3306/roxstock

Do not copy the full DATABASE_URL or password into this handoff, Git, logs, issues, or commits.

Verify:

stat -c '%a %n' /opt/roxstock/backend/.env.production

Expected mode: 600.

### 3. Validate networks without recreating them

Read-only verify:

- roxstock_app exists
- roxstock-db_default exists
- roxstock-mariadb is healthy on roxstock-db_default

Do not recreate these networks or MariaDB.

### 4. Caddy change

Back up the live Caddyfile first. Do not replace infra/caddy as a directory and do not alter Caddy data/config volumes.

Current site behavior must remain frontend:80 for non-API routes.

Add a route for /api requests that preserves the /api prefix and proxies only those requests to:

roxstock-backend:3300

Conceptually the site must behave as:

newrox.cafe24.com {
    handle /api/* {
        reverse_proxy roxstock-backend:3300
    }

    handle {
        reverse_proxy frontend:80
    }
}

Use the syntax appropriate for the installed Caddy version and validate it before reload.

Important: /health and /health/db are backend internal health paths and do not need to become public merely to deploy the API.

Run caddy validate (or equivalent inside the existing Caddy container) before reload. Prefer reload, not container replacement. If validation or reload fails, restore the Caddyfile backup immediately.

### 5. First backend deployment

After .env.production and the Caddy configuration are prepared, run the repository deployment script with the immutable image corresponding to commit cd99ee39:

bash /opt/roxstock/scripts/deploy-backend.sh sha-cd99ee3

The script must:

- verify env file mode 600
- verify existing networks
- pull the immutable backend image
- run Prisma migrate status
- run prisma migrate deploy only for pending migrations
- start only roxstock-backend
- wait for /health
- verify /health/db

Do not run migrate reset, migrate dev, db push, DROP DATABASE, compose down --volumes, or delete any DB volume.

### 6. Verify after deployment

Verify and record:

- roxstock-backend is running/healthy
- exact backend image/tag and image ID
- backend is attached to roxstock_app and roxstock-db_default
- no host port is published for 3300
- MariaDB remains healthy
- MariaDB host binding remains only 127.0.0.1:3306
- Caddy remains healthy
- frontend remains healthy
- HTTP -> HTTPS redirect remains normal
- HTTPS home remains normal
- GET https://newrox.cafe24.com/api/accounts returns expected HTTP success
- GET https://newrox.cafe24.com/api/securities returns expected HTTP success
- a nonexistent /api path returns normal 404
- frontend direct-route refresh still works
- Prisma migrate status reports up to date

Do not call mutating trade APIs.

## Failure policy

If backend deployment fails before Caddy routing is enabled, leave frontend/Caddy/MariaDB unchanged.

If the Caddy change causes a problem, restore the Caddyfile backup and reload the previous valid configuration.

If a new backend image fails health checks, stop the failed backend and report. Application image rollback may use the previous known SHA, but never automatically roll back Prisma schema changes.

## Required server result handoff

After completing the work, create a new file:

docs/handoff/YYYYMMDD-HHMM-server-backend-deploy.md

Use KST in the filename.

Record:

- Git commit used
- backend image tag and image ID
- backend container health
- connected networks
- Caddy change and validation/reload result
- /health and /health/db result
- external accounts/securities/404 result
- Prisma migration status
- frontend/Caddy/MariaDB final health
- 3300/3306 exposure result
- files changed on server
- rollback information
- any failure and recovery performed

Do not include passwords, DATABASE_URL, private keys, tokens, or other secrets.

Commit and push only that handoff document using the established handoff write key. Do not commit the live Caddyfile, .env.production, DB compose changes, or other operating-tree files.

## GitHub automatic deployment note

Once the first server preparation is complete, future backend-related pushes to main will run:

Backend Test -> Backend Build -> Backend Docker Build/Push -> Backend Deploy -> external /api verification.

Existing GitHub Secrets reused by the workflow:

- DOCKERHUB_USERNAME
- DOCKERHUB_TOKEN
- DEPLOY_HOST
- DEPLOY_PORT
- DEPLOY_USER
- DEPLOY_SSH_KEY
- DEPLOY_KNOWN_HOSTS

No DB secret is stored in GitHub Actions; production DB configuration remains only in the server-side mode-600 environment file.
