# Build Vite → serve com nginx (SPA) + proxy /api → Nest
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api/v1
ARG VITE_USE_API=true
ARG VITE_UI_PREVIEW=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_USE_API=$VITE_USE_API
ENV VITE_UI_PREVIEW=$VITE_UI_PREVIEW

RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
