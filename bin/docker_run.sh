#!/bin/bash

REPO_ROOT=/Twitter-Downloader
DOCKER_IMAGE_TAG=twitterdl

MODE=$1

# use rootless mode
~/bin/docker run \
	-v $(pwd)/data:/$REPO_ROOT/bin/data \
	-v $(pwd)/Storage:$REPO_ROOT/bin/Storage \
	$DOCKER_IMAGE_TAG \
	/usr/local/bin/node $REPO_ROOT/bin/cli.js --mode $MODE
