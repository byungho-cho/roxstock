#!/usr/bin/env bash
# Run on the RoxStock host after uploading the verified APK and candidate Caddyfile.
set -Eeuo pipefail
APK=/tmp/roxstock-web-only-0.1.1.apk
EXPECTED=61cb8ae68a64cf8e0021e30cf6e374c980a7e1fb794360f1c4e6778c32fdd470
printf '%s  %s\n' "$EXPECTED" "$APK" | sha256sum -c -
docker cp /tmp/roxstock-apk-Caddyfile roxstock-proxy:/tmp/apk-Caddyfile
docker exec roxstock-proxy caddy validate --config /tmp/apk-Caddyfile --adapter caddyfile
BACKUP="/opt/roxstock/.deploy/apk-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
cp /opt/roxstock/infra/caddy/Caddyfile "$BACKUP/Caddyfile"
docker exec roxstock-proxy mkdir -p /data/roxstock-public/downloads/android
docker cp "$APK" roxstock-proxy:/data/roxstock-public/downloads/android/roxstock-web-only-0.1.1.apk
docker exec roxstock-proxy chmod 644 /data/roxstock-public/downloads/android/roxstock-web-only-0.1.1.apk
printf '%s\n' '{"version":"0.1.1-webonly-test","updatedAt":"2026-10-10","url":"/downloads/android/roxstock-web-only-0.1.1.apk","sha256":"61cb8ae68a64cf8e0021e30cf6e374c980a7e1fb794360f1c4e6778c32fdd470"}' > "$BACKUP/latest.json"
docker cp "$BACKUP/latest.json" roxstock-proxy:/data/roxstock-public/downloads/android/latest.json
docker exec roxstock-proxy chmod 644 /data/roxstock-public/downloads/android/latest.json
cat /tmp/roxstock-apk-Caddyfile > /opt/roxstock/infra/caddy/Caddyfile
if ! docker exec roxstock-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
  cat "$BACKUP/Caddyfile" > /opt/roxstock/infra/caddy/Caddyfile
  docker exec roxstock-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  exit 1
fi
curl --fail --silent --show-error https://newrox.cafe24.com/downloads/android/roxstock-web-only-0.1.1.apk -o "$BACKUP/downloaded.apk"
printf '%s  %s\n' "$EXPECTED" "$BACKUP/downloaded.apk" | sha256sum -c -
curl --fail --silent --show-error https://newrox.cafe24.com/downloads/android/latest.json
curl --fail --silent --show-error https://newrox.cafe24.com/ -o /dev/null
echo "APK published; proxy backup: $BACKUP/Caddyfile"
