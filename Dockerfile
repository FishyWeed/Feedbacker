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
# No VOLUME line: Railway rejects it. The host attaches the data volume at /app/data (compose, fly.toml, Railway).
RUN mkdir -p /app/data && chown bun:bun /app/data
EXPOSE 3000
# Some hosts (Fly.io, Railway) mount the data volume owned by root. Start as root only to give the folder to the bun user,
# then run the server as bun, without root rights.
ENTRYPOINT ["/bin/sh", "-c", "chown -R bun:bun /app/data && exec setpriv --reuid=bun --regid=bun --init-groups -- \"$@\"", "sh"]
CMD ["bun", "run", "server/index.ts"]
