#!/usr/bin/env bash
# Server-only: publish the verified, signed APK without changing proxy configuration.
set -Eeuo pipefail
SHA="${1:?commit SHA required}"
EXPECTED="${2:?APK digest required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ && "$EXPECTED" =~ ^[0-9a-f]{64}$ ]] || exit 2
APK="/tmp/roxstock-webonly-$SHA.apk"
printf '%s  %s\n' "$EXPECTED" "$APK" | sha256sum -c -
BACKUP="/opt/roxstock/.deploy/apk-news-$SHA"
install -d -m 700 "$BACKUP"
docker cp roxstock-proxy:/data/roxstock-public/downloads/android/latest.json "$BACKUP/latest.json.previous" 2>/dev/null || true
docker exec roxstock-proxy mkdir -p /data/roxstock-public/downloads/android
docker cp "$APK" roxstock-proxy:/data/roxstock-public/downloads/android/roxstock-web-only-0.1.3.apk
docker exec roxstock-proxy chmod 644 /data/roxstock-public/downloads/android/roxstock-web-only-0.1.3.apk
python3 - "$SHA" "$EXPECTED" "$BACKUP/latest.json" <<'PY'
import datetime,json,sys
sha,digest,path=sys.argv[1:]
with open(path,'w') as f:json.dump({'version':'0.1.3-webonly-test','versionCode':4,'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':'/downloads/android/roxstock-web-only-0.1.3.apk','sha256':digest,'commit':sha},f)
PY
curl --fail --silent --show-error --max-time 60 https://newrox.cafe24.com/downloads/android/roxstock-web-only-0.1.3.apk -o "$BACKUP/downloaded.apk"
printf '%s  %s\n' "$EXPECTED" "$BACKUP/downloaded.apk" | sha256sum -c -
docker cp "$BACKUP/latest.json" roxstock-proxy:/data/roxstock-public/downloads/android/latest.json.new
docker exec roxstock-proxy sh -c 'chmod 644 /data/roxstock-public/downloads/android/latest.json.new && mv /data/roxstock-public/downloads/android/latest.json.new /data/roxstock-public/downloads/android/latest.json'
curl --fail --silent --show-error --max-time 20 https://newrox.cafe24.com/downloads/android/latest.json
rm -f "$APK"
echo 'Signed APK published; previous APK files and manifest backup retained.'
