## Element Call embedded build
FROM --platform=$BUILDPLATFORM node:24.13.1-alpine AS element-call-builder

RUN apk add --no-cache git

WORKDIR /element-call

ARG ELEMENT_CALL_COMMIT=ecef381c246c177af28b8c99c5076da19878a136
RUN git init && \
    git remote add origin https://github.com/melogale/element-call.git && \
    git fetch --depth=1 origin ${ELEMENT_CALL_COMMIT} && \
    git checkout FETCH_HEAD

RUN cd embedded/web && npm ci && npm run build

## Builder
FROM --platform=$BUILDPLATFORM node:24.13.1-alpine AS builder

WORKDIR /src

ARG VITE_BUILD_HASH
ARG VITE_IS_RELEASE_TAG=false
ENV VITE_BUILD_HASH=$VITE_BUILD_HASH
ENV VITE_IS_RELEASE_TAG=$VITE_IS_RELEASE_TAG

# Copy the pre-built element-call embedded package so npm ci can resolve the
# file: dependency and vite can find the dist/ assets to copy.
COPY --from=element-call-builder /element-call/embedded/web /src/element-call/embedded/web

COPY .npmrc package.json package-lock.json /src/
RUN npm ci --ignore-scripts
COPY . /src/
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run build

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
