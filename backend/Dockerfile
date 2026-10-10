# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=development

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# dev: source is bind-mounted by docker-compose.yml; node_modules lives in a named volume
# seeded from this layer.
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chmod +x docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json knexfile.js docker-entrypoint.sh ./
COPY src ./src
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 4000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
