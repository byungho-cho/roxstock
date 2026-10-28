FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY collector/package.json collector/package.json
COPY shared/package.json shared/package.json

RUN npm ci --workspace frontend --include-workspace-root=false

COPY frontend frontend
# Pure policies are shared as source; frontend builds do not require Prisma/shared dist.
COPY shared/src/domain/korean-holidays.ts shared/src/domain/market-calendar.ts shared/src/domain/dart-review.ts shared/src/domain/security-data.ts shared/src/domain/security-data-aggregation.ts shared/src/domain/
COPY backend/src/release.json backend/src/release.json

ARG VITE_DATA_SOURCE=mock
ARG VITE_API_ACCOUNT_ID=
ENV VITE_DATA_SOURCE=${VITE_DATA_SOURCE}
ENV VITE_API_ACCOUNT_ID=${VITE_API_ACCOUNT_ID}
RUN npm run build:frontend

FROM nginx:1.28-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
