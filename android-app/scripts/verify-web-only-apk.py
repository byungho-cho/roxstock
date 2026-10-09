"""Inspect the delivered APK, not just source configuration. Run with Android SDK installed."""
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

apk = Path(sys.argv[1])
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
analyzer = next(sdk.glob('cmdline-tools/*/bin/apkanalyzer'))
manifest = subprocess.check_output([str(analyzer), 'manifest', 'print', str(apk)], text=True)
root = ET.fromstring(manifest)
ns = '{http://schemas.android.com/apk/res/android}'
assert root.attrib['package'] == 'com.roxstock.app.webonly.debug'
permissions = [node.attrib[ns + 'name'] for node in root.findall('uses-permission')]
assert permissions == ['android.permission.INTERNET'], permissions
app = root.find('application')
assert app.attrib.get(ns + 'icon'), 'Launcher icon missing'
assert app.attrib.get(ns + 'roundIcon'), 'Round launcher icon missing'
assert len(app.findall('service')) == 0
assert len(app.findall('receiver')) == 0
for token in ['NotificationListenerService', 'BIND_NOTIFICATION', 'POST_NOTIFICATIONS']:
    assert token not in manifest, token
with zipfile.ZipFile(apk) as archive:
    assert any(name.endswith('/ic_launcher.xml') for name in archive.namelist()), 'Adaptive icon missing'
    assert any(name.endswith('/ic_launcher.png') for name in archive.namelist()), 'Legacy icon missing'
    dex = b''.join(archive.read(name) for name in archive.namelist() if name.endswith('.dex'))
    for token in [b'BrokerNotificationService', b'InboxDb', b'NotificationListenerService', b'RoxStockNative', b'NOTIFICATION_LISTENER_SETTINGS']:
        assert token not in dex, token
apksigner = next(sdk.glob('build-tools/35.0.0/apksigner'))
signature = subprocess.check_output([str(apksigner), 'verify', '--verbose', '--print-certs', str(apk)], text=True)
fingerprint = re.search(r'certificate SHA-256 digest: ([0-9a-f]+)', signature).group(1)
assert fingerprint == '0c419a20f4672e1829ad5427e9d7ea81d6f94f668729c045e564711dcda7ef86', 'Unexpected signing key'
report = {'apk': apk.name, 'applicationId': root.attrib['package'], 'permissions': permissions,
          'services': 0, 'receivers': 0, 'collectorClassesPresent': False, 'signatureVerified': True,
          'launcherIconPresent': True, 'certificateSha256': fingerprint, 'versionName': root.attrib.get(ns + 'versionName'),
          'sha256': hashlib.sha256(apk.read_bytes()).hexdigest()}
output = apk.with_suffix('.verification.json')
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(output.read_text(encoding='utf-8'))
