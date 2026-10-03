# Multi-stage build for inventory-service
FROM node:20-alpine AS builder
WORKDIR /app
COPY inventory-service/package*.json ./
RUN npm ci
COPY proto /proto
COPY inventory-service/tsconfig.json ./
COPY inventory-service/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /proto /proto
EXPOSE 50052
CMD ["node", "dist/server.js"]
