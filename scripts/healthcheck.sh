#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:3000/api/v1/health}"

if curl --fail --silent --show-error "$URL" > /dev/null; then
  echo "healthy: $URL"
  exit 0
fi

echo "unhealthy: $URL"
exit 1
