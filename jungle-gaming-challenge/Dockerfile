# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY mikro-orm.config.ts ./mikro-orm.config.ts
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "dist/main.js"]
