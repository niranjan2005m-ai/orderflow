# Multi-stage build for notification-service
FROM node:20-alpine AS builder
WORKDIR /app
COPY notification-service/package*.json ./
RUN npm ci
COPY notification-service/tsconfig.json ./
COPY notification-service/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./
CMD ["node", "dist/index.js"]
