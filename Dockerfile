# Stage 1: build the frontend.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Stage 2: run. Only the server, shared code, built files and production packages.
FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/feedbacker.db
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown bun:bun /app/data
USER bun
VOLUME /app/data
EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]
