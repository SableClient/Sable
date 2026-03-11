## Base
FROM --platform=$BUILDPLATFORM node:24.13.1-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apk add --no-cache git

## Builder
FROM base AS builder

WORKDIR /src

ARG VITE_BUILD_HASH
ARG VITE_IS_RELEASE_TAG=false
ENV VITE_BUILD_HASH=$VITE_BUILD_HASH
ENV VITE_IS_RELEASE_TAG=$VITE_IS_RELEASE_TAG
COPY pnpm-lock.yaml pnpm-workspace.yaml /src/
RUN pnpm fetch
COPY . /src/
RUN pnpm install --offline --frozen-lockfile
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN pnpm run build

## Dist
FROM scratch AS site-dist
COPY --from=builder /src/dist /

## App
FROM caddy:2-alpine

# Strip the file capability set by the base image (cap_net_bind_service=+ep).
# With --cap-drop=ALL the bounding set is empty, and the kernel refuses to exec
# any binary that has file capabilities not present in the bounding set — even
# if those capabilities aren't actually needed at runtime (we listen on :8080).
RUN setcap -r /usr/bin/caddy

COPY --from=site-dist / /app
COPY Caddyfile /etc/caddy/Caddyfile
