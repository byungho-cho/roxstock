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
from apk_verification import sdk_tool,verify_common

apk = Path(sys.argv[1])
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
analyzer = sdk_tool(sdk,'cmdline-tools/*/bin/apkanalyzer')
manifest = subprocess.check_output([str(analyzer), 'manifest', 'print', str(apk)], text=True,encoding="utf-8")
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
    # Release AAPT2 shortens file names. Resolve symbolic icons via resources.arsc.
    resources=subprocess.check_output([sdk_tool(sdk,'build-tools/35.0.0/aapt2'),'dump','resources',str(apk)],text=True,encoding='utf-8')
    for icon in ['ic_launcher','ic_launcher_round']:
        marker='mipmap/'+icon+'\n'
        assert marker in resources,'Launcher resource missing'
        block=resources.split(marker,1)[1].split('resource ',1)[0]
        paths=re.findall(r'\(file\) (\S+) type=',block)
        assert 'anydpi-v26' in block and any(p.endswith('.xml') for p in paths),'Adaptive icon missing'
        assert any(p.endswith('.png') for p in paths),'Legacy icon missing'
        assert all(p in archive.namelist() for p in paths),'Launcher asset missing'
    dex = b''.join(archive.read(name) for name in archive.namelist() if name.endswith('.dex'))
    for token in [b'BrokerNotificationService', b'InboxDb', b'NotificationListenerService', b'RoxStockNative', b'NOTIFICATION_LISTENER_SETTINGS']:
        assert token not in dex, token
common=verify_common(root,apk,sdk,'webOnly')
fingerprint=common['certificateSha256']
report = {**common,'apk': apk.name, 'applicationId': root.attrib['package'], 'permissions': permissions,
          'services': 0, 'receivers': 0, 'collectorClassesPresent': False, 'signatureVerified': True,
          'launcherIconPresent': True, 'certificateSha256': fingerprint, 'versionName': root.attrib.get(ns + 'versionName'),
          'sha256': hashlib.sha256(apk.read_bytes()).hexdigest()}
output = apk.with_suffix('.verification.json')
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(output.read_text(encoding='utf-8'))
