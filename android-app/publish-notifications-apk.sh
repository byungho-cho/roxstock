#!/usr/bin/env bash
set -Eeuo pipefail
SHA="${1:?commit required}"
EXPECTED="${2:?digest required}"
CONFIGURED="${3:?configuration flag required}"
VERSION="${4:?APK version required}"
VERSION_CODE="${5:?APK version code required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ && "$EXPECTED" =~ ^[0-9a-f]{64}$ && "$CONFIGURED" =~ ^(true|false)$ ]] || exit 2
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || exit 2
[[ "$CONFIGURED" == true ]] || { echo "Configured Firebase APK required" >&2; exit 2; }
APK="/tmp/roxstock-notifications-$SHA.apk"
printf '%s  %s\n' "$EXPECTED" "$APK" | sha256sum -c -
BACKUP="/opt/roxstock/.deploy/apk-notifications-$SHA"
install -d -m 700 "$BACKUP"
PUBLIC_FILE="roxstock-notifications-${VERSION}-${SHA:0:12}-${EXPECTED:0:12}.apk"
docker cp roxstock-proxy:/data/roxstock-public/downloads/android/notifications-latest.json "$BACKUP/latest.previous.json" 2>/dev/null || true
docker cp roxstock-proxy:/data/roxstock-public/downloads/android/latest.json "$BACKUP/default.previous.json" 2>/dev/null || true

docker exec roxstock-proxy mkdir -p /data/roxstock-public/downloads/android
docker cp "$APK" "roxstock-proxy:/data/roxstock-public/downloads/android/$PUBLIC_FILE"
docker exec roxstock-proxy chmod 644 "/data/roxstock-public/downloads/android/$PUBLIC_FILE"
curl --fail --silent --show-error --max-time 60 "https://newrox.cafe24.com/downloads/android/$PUBLIC_FILE" -o "$BACKUP/downloaded.apk"
printf '%s  %s\n' "$EXPECTED" "$BACKUP/downloaded.apk" | sha256sum -c -
python3 - "$BACKUP/latest.json" "$PUBLIC_FILE" "$SHA" "$EXPECTED" "$CONFIGURED" "$VERSION" "$VERSION_CODE" <<'PY'
import datetime,json,sys
path,filename,sha,digest,configured,version,code=sys.argv[1:]
with open(path,'w') as f:json.dump({'version':version,'versionCode':int(code),'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':'/downloads/android/'+filename,'commit':sha,'sha256':digest,'firebaseConfigured':configured=='true'},f)
PY
docker cp "$BACKUP/latest.json" roxstock-proxy:/data/roxstock-public/downloads/android/notifications-latest.json.new
docker exec roxstock-proxy sh -c 'chmod 644 /data/roxstock-public/downloads/android/notifications-latest.json.new && mv /data/roxstock-public/downloads/android/notifications-latest.json.new /data/roxstock-public/downloads/android/notifications-latest.json'
# Keep the legacy default manifest pointing to the same unified APK.
docker cp "$BACKUP/latest.json" roxstock-proxy:/data/roxstock-public/downloads/android/latest.json.new
docker exec roxstock-proxy sh -c 'chmod 644 /data/roxstock-public/downloads/android/latest.json.new && mv /data/roxstock-public/downloads/android/latest.json.new /data/roxstock-public/downloads/android/latest.json'
curl --fail --silent --show-error --max-time 20 https://newrox.cafe24.com/downloads/android/notifications-latest.json
rm -f "$APK"
echo 'Notifications APK published; real FCM delivery requires matching private server and client configuration.'
