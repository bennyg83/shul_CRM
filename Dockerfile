# One image for a whole shul: the API serves the built web app, so this is one
# process on one port. Node 24 is required — the API uses node:sqlite and runs
# TypeScript directly, so there is no compile step for the server.
#
#   docker build -t shulcrm .
#   docker run -p 3000:3000 -v shulcrm-data:/data shulcrm

# --- install -----------------------------------------------------------------
# Only the manifests, so this layer is reused until a dependency changes.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# --- build the web app -------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build -w @shulcrm/web

# --- runtime ------------------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# A second install, without dev dependencies. packages/shared has to be in place first:
# npm links the workspace into node_modules rather than copying it.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared ./packages/shared
RUN npm ci --omit=dev && npm cache clean --force

COPY apps/api/src ./apps/api/src
COPY --from=build /app/apps/web/dist ./apps/web/dist

# The database, its backups and the logo all live in one directory, so one volume is the
# whole shul. It is the only path the app writes to, and the only one `node` owns.
ENV CRM_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data

# Serve the container's network, not just its loopback. HTTPS belongs in front of this.
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "apps/api/src/index.ts"]
