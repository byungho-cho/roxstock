"""Verify delivered notifications APK without outputting Firebase client values."""
import hashlib,json,os,subprocess,sys,xml.etree.ElementTree as ET
from pathlib import Path
from apk_verification import NS,sdk_tool,verify_common
apk=Path(sys.argv[1]);sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
root=ET.fromstring(subprocess.check_output([sdk_tool(sdk,'cmdline-tools/*/bin/apkanalyzer'),'manifest','print',str(apk)],text=True,encoding="utf-8"))
assert root.attrib['package']=='com.roxstock.app.debug','Unexpected package'
permissions=[n.attrib[NS+'name'] for n in root.findall('uses-permission')]
assert 'android.permission.POST_NOTIFICATIONS' in permissions
services=root.find('application').findall('service')
assert any(n.attrib[NS+'name']=='com.roxstock.app.AppPushService' and n.attrib.get(NS+'exported')=='false' for n in services)
assert any(n.attrib[NS+'name']=='com.roxstock.app.BrokerNotificationService' and n.attrib.get(NS+'permission')=='android.permission.BIND_NOTIFICATION_LISTENER_SERVICE' for n in services)
assert root.find('application').attrib[NS+'name']=='com.roxstock.app.PushApplication'
assert any(n.attrib[NS+'name']=='firebase_messaging_auto_init_enabled' and n.attrib.get(NS+'value')=='false' for n in root.find('application').findall('meta-data'))
report={**verify_common(root,apk,sdk,'notifications'),'applicationId':root.attrib['package'],'versionName':root.attrib[NS+'versionName'],'signatureVerified':True,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'notificationServicePreserved':True,'brokerServicePreserved':True}
apk.with_suffix('.verification.json').write_text(json.dumps(report)+'\n');print(json.dumps(report))
