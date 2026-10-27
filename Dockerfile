FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y python3 python3-invoke pkg-config build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS server

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y python3 python3-invoke pkg-config build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN chown -R node:node /app
USER node
RUN npm ci --omit=dev

COPY --chown=node:node --from=build /app/server-dist ./server-dist

EXPOSE 3001
EXPOSE 40000-49999/udp
EXPOSE 40000-49999/tcp

HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start:server"]

FROM nginx:1.28-alpine AS web

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
