FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY server/package*.json ./
COPY server/tsconfig*.json ./
COPY server/prisma ./prisma
COPY server/src ./src
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 --create-home appuser
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
USER appuser
EXPOSE 3000
CMD ["node", "dist/app/server.js"]
