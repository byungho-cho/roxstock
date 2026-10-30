FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY collector/package.json collector/package.json
COPY shared/package.json shared/package.json
RUN npm ci --workspace backend --workspace shared --include-workspace-root
COPY backend backend
COPY shared shared
COPY database database
RUN npm --workspace backend run prisma:generate
RUN npm --workspace backend run build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates mariadb-client && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3300
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY collector/package.json collector/package.json
COPY shared/package.json shared/package.json
RUN npm ci --workspace backend --workspace shared --include-workspace-root --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/shared/dist shared/dist
COPY database database
USER node
EXPOSE 3300
CMD ["node", "--experimental-websocket", "backend/dist/server.js"]
