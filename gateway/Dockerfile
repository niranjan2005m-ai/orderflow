# Multi-stage build for gateway
FROM node:20-alpine AS builder
WORKDIR /app
COPY gateway/package*.json ./
RUN npm ci
COPY proto /proto
COPY gateway/tsconfig.json ./
COPY gateway/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /proto /proto
EXPOSE 4000
CMD ["node", "dist/server.js"]
