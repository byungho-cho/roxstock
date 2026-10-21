"""Inspect and verify the signed notifications APK without outputting Firebase client values."""
import hashlib,json,os,re,subprocess,sys,xml.etree.ElementTree as ET
from pathlib import Path
apk=Path(sys.argv[1]); sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
analyzer=next(sdk.glob('cmdline-tools/*/bin/apkanalyzer')); ns='{http://schemas.android.com/apk/res/android}'
root=ET.fromstring(subprocess.check_output([str(analyzer),'manifest','print',str(apk)],text=True))
assert root.attrib['package']=='com.roxstock.app.debug'
assert root.attrib[ns+'versionName']=='0.1.6-test'
assert any(n.attrib[ns+'name']=='android.permission.POST_NOTIFICATIONS' for n in root.findall('uses-permission'))
services=root.find('application').findall('service')
assert any(n.attrib[ns+'name']=='com.roxstock.app.AppPushService' and n.attrib.get(ns+'exported')=='false' for n in services)
signature=subprocess.check_output([str(next(sdk.glob('build-tools/35.0.0/apksigner'))),'verify','--verbose','--print-certs',str(apk)],text=True)
fingerprint=re.search(r'certificate SHA-256 digest: ([0-9a-f]+)',signature).group(1)
assert fingerprint=='0c419a20f4672e1829ad5427e9d7ea81d6f94f668729c045e564711dcda7ef86'
configured=all(os.environ.get('ROXSTOCK_FCM_'+k) for k in ['APP_ID','API_KEY','PROJECT_ID','SENDER_ID'])
report={'applicationId':root.attrib['package'],'versionName':root.attrib[ns+'versionName'],'signatureVerified':True,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'firebaseConfigured':configured}
apk.with_suffix('.verification.json').write_text(json.dumps(report)+'\n');print(json.dumps(report))
