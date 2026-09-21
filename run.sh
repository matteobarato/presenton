#!/bin/bash
set -a
source .env
DETACH=""
if [ "$1" = "-d" ]; then
    DETACH="-d"
fi
docker compose -f docker-compose.yml up $DETACH