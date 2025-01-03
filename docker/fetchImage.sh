#!/bin/bash

cd /Twitter-Downloader/bin

node cli.js image \
    --verbose "${VERBOSE}" \
    --webhook "${WEBHOOK_URL}" \
    --webhook-token "${WEBHOOK_TOKEN}"