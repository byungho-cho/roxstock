FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY collector/package.json collector/package.json
COPY shared/package.json shared/package.json
RUN npm ci --workspace shared --include-workspace-root
COPY shared shared
COPY database database
RUN npm run prisma:generate

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Seoul
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared shared
COPY --from=build /app/database database
COPY investor-crawler/src investor-crawler/src
RUN mkdir -p /var/lib/roxstock/kis-tokens && chown node:node /var/lib/roxstock/kis-tokens && chmod 700 /var/lib/roxstock/kis-tokens
USER node
CMD ["node","investor-crawler/src/worker.mjs"]
