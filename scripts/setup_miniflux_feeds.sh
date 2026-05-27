#!/usr/bin/env bash
set -euo pipefail

MINIFLUX_URL="${MINIFLUX_URL:-http://localhost:8080}"
MINIFLUX_USER="${MINIFLUX_ADMIN:-admin}"
MINIFLUX_PASS="${MINIFLUX_PASSWORD:-admin123}"

FEEDS=(
  "https://hnrss.org/best|Hacker News Best"
  "https://techcrunch.com/feed/|TechCrunch"
  "https://www.theverge.com/rss/index.xml|The Verge"
  "https://www.jiqizhixin.com/rss|机器之心"
  "https://sspai.com/feed|少数派"
)

echo "Adding RSS feeds to Miniflux at ${MINIFLUX_URL} ..."

for entry in "${FEEDS[@]}"; do
  IFS='|' read -r url title <<< "$entry"
  echo -n "  ${title} ... "
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${MINIFLUX_USER}:${MINIFLUX_PASS}" \
    -H "Content-Type: application/json" \
    -X POST "${MINIFLUX_URL}/v1/feeds" \
    -d "{\"feed_url\": \"${url}\", \"category_id\": 1}")
  if [ "$status" = "201" ] || [ "$status" = "200" ]; then
    echo "OK"
  elif [ "$status" = "409" ]; then
    echo "already exists"
  else
    echo "FAILED (HTTP ${status})"
  fi
done

echo "Done."
