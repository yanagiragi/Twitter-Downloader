#!/bin/bash

cd /Twitter-Downloader/bin

node cli.js "mediaInfo" \
    -c "${COOKIE}" \
    -s "true" \
    --verbose "${VERBOSE}"