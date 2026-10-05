FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json

RUN npm ci --workspace frontend --include-workspace-root=false

COPY frontend frontend

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
