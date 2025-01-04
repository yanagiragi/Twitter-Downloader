#!/bin/bash

REPO_ROOT=${REPO_ROOT:-/Twitter-Downloader}

docker compose -f "${REPO_ROOT}/docker/docker-compose.yml" run --rm "twitter-dl" "fetchInfo"
docker compose -f "${REPO_ROOT}/docker/docker-compose.yml" run --rm "twitter-dl" "fetchImage"