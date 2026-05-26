# ---- Stage 1: install production dependencies ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create the two upload dirs and hand them to the non-root `node` user
# so the named volumes inherit writable ownership on first creation.
RUN mkdir -p /app/uploads /app/public/img/uploads \
  && chown -R node:node /app/uploads /app/public/img

USER node
EXPOSE 3000
CMD ["node", "server.js"]