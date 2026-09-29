# Multi-stage build: a fat builder compiles the app, a slim runtime ships only what
# `node build` (and the Discord bot) need. Keeps the image small for a 512MB / 10GB droplet.

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
# openssl for Prisma's query engine; must precede bun install (postinstall runs generate).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.4.0
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
# Strip devDependencies, then regenerate the Prisma client so it survives the prune.
# bcrypt/esbuild/tsx are prod deps, so their built binaries are kept.
RUN rm -rf node_modules && bun install --production --frozen-lockfile && bunx prisma generate

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
# Prisma's engine needs libssl at runtime; the global bun serves the compose commands.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.4.0
ENV NODE_ENV=production
# Copy the built app + pruned prod node_modules (incl. generated Prisma client + tsx).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "build"]
