# syntax=docker/dockerfile:1
# Build context: the repository root (pnpm workspace). Produces a Next.js standalone image.

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
RUN npm install --global pnpm@11.5.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile --filter @maximusflow/web...
COPY apps/web apps/web
# Rewrites of /api/* are compiled at build time; inside Compose the API is reachable as http://api:8080.
ARG API_URL=http://api:8080
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @maximusflow/web build

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
RUN addgroup -S os && adduser -S os -G os
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=os:os /repo/apps/web/.next/standalone ./
COPY --from=build --chown=os:os /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=os:os /repo/apps/web/public ./apps/web/public
USER os
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
