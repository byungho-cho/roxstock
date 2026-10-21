#!/usr/bin/env bash
# Server-only: publish the verified, signed APK without changing proxy configuration.
set -Eeuo pipefail
SHA="${1:?commit SHA required}"
EXPECTED="${2:?APK digest required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ && "$EXPECTED" =~ ^[0-9a-f]{64}$ ]] || exit 2
APK="/tmp/roxstock-webonly-$SHA.apk"
PUBLIC_FILE="roxstock-web-only-0.1.6-${SHA:0:12}-${EXPECTED:0:12}.apk"
printf '%s  %s\n' "$EXPECTED" "$APK" | sha256sum -c -
BACKUP="/opt/roxstock/.deploy/apk-news-$SHA"
install -d -m 700 "$BACKUP"
docker cp roxstock-proxy:/data/roxstock-public/downloads/android/latest.json "$BACKUP/latest.json.previous" 2>/dev/null || true
docker exec roxstock-proxy mkdir -p /data/roxstock-public/downloads/android
docker cp "$APK" "roxstock-proxy:/data/roxstock-public/downloads/android/$PUBLIC_FILE"
docker exec roxstock-proxy chmod 644 "/data/roxstock-public/downloads/android/$PUBLIC_FILE"
python3 - "$SHA" "$EXPECTED" "$BACKUP/latest.json" "$PUBLIC_FILE" <<'PY'
import datetime,json,sys
sha,digest,path,filename=sys.argv[1:]
with open(path,'w') as f:json.dump({'version':'0.1.6-webonly-test','versionCode':7,'certificateSha256':'0c419a20f4672e1829ad5427e9d7ea81d6f94f668729c045e564711dcda7ef86','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':'/downloads/android/'+filename,'sha256':digest,'commit':sha},f)
PY
curl --fail --silent --show-error --max-time 60 "https://newrox.cafe24.com/downloads/android/$PUBLIC_FILE" -o "$BACKUP/downloaded.apk"
printf '%s  %s\n' "$EXPECTED" "$BACKUP/downloaded.apk" | sha256sum -c -
docker cp "$BACKUP/latest.json" roxstock-proxy:/data/roxstock-public/downloads/android/latest.json.new
docker exec roxstock-proxy sh -c 'chmod 644 /data/roxstock-public/downloads/android/latest.json.new && mv /data/roxstock-public/downloads/android/latest.json.new /data/roxstock-public/downloads/android/latest.json'
curl --fail --silent --show-error --max-time 20 https://newrox.cafe24.com/downloads/android/latest.json
rm -f "$APK"
echo 'Signed APK published; previous APK files and manifest backup retained.'
