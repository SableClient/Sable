#!/usr/bin/env bash
export SHARP_IGNORE_GLOBAL_LIBVIPS=1
npm ci
npm run build

rsync -av --delete dist/ /srv/http/sable.melogale.space
