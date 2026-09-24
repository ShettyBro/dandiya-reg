#!/usr/bin/env bash
# Polls origin/main; if it has moved, resets the working tree to it, rebuilds the Docker image,
# and restarts the api/worker containers. If the build fails, the previous (working) containers
# are left running untouched — a broken commit never takes production down, it just fails to
# deploy and gets logged.
#
# Does NOT run database migrations automatically — a commit that adds a new Prisma migration
# still needs `cd server && npx prisma migrate deploy` run by hand (deliberately, since
# unattended schema changes are a bigger risk than unattended code deploys).
#
# Installed on the deployment host via cron: */5 * * * * /opt/projects/dandiya/scripts/auto-deploy.sh
set -euo pipefail

REPO_DIR="/opt/projects/dandiya"
LOG="$REPO_DIR/scripts/auto-deploy.log"
LOCK="$REPO_DIR/scripts/.auto-deploy.lock"

exec 200>"$LOCK"
flock -n 200 || exit 0

cd "$REPO_DIR"
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

{
  echo "[$(date -u +%FT%TZ)] New commit detected: $LOCAL -> $REMOTE"
  git reset --hard origin/main

  if docker compose build; then
    docker compose up -d
    echo "[$(date -u +%FT%TZ)] Deployed $REMOTE successfully"
  else
    echo "[$(date -u +%FT%TZ)] BUILD FAILED for $REMOTE — previous containers left running, not restarted"
  fi
} >> "$LOG" 2>&1
