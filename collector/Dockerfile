FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY collector/package.json collector/package.json
COPY shared/package.json shared/package.json
RUN npm ci --workspace collector --workspace shared --include-workspace-root
COPY shared shared
COPY collector collector
COPY database database
RUN npm run prisma:generate && npm run build:collector

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY collector/package.json collector/package.json
COPY shared/package.json shared/package.json
RUN npm ci --workspace collector --workspace shared --include-workspace-root --omit=dev && npm cache clean --force
COPY --from=build /app/collector/dist collector/dist
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/src/generated shared/src/generated
USER node
CMD ["node", "collector/dist/worker.js", "daemon"]
