"""Value-redacting checks for delivered APKs with Windows or Linux SDKs."""
import os,re,subprocess,zipfile
from pathlib import Path
NS='{http://schemas.android.com/apk/res/android}'
CERTIFICATE='0c419a20f4672e1829ad5427e9d7ea81d6f94f668729c045e564711dcda7ef86'
def sdk_tool(sdk,pattern):
    for suffix in ['', '.bat', '.exe']:
        for p in sdk.glob(pattern+suffix):
            if p.is_file():return str(p)
    raise AssertionError('Required Android SDK tool missing')
def expected_version(flavor):
    text=(Path(__file__).resolve().parents[1]/'app/build.gradle').read_text(encoding='utf-8')
    version=re.search(r"\bversionName\s+'([^']+)'",text).group(1)
    code=int(re.search(r'\bversionCode\s+(\d+)',text).group(1))
    return (version+('-webonly' if flavor=='webOnly' else ''),code)
def verify_common(root,apk,sdk,flavor):
    version,code=expected_version(flavor)
    assert root.attrib[NS+'versionName']==version,'Unexpected version name'
    assert int(root.attrib[NS+'versionCode'])==code,'Unexpected version code'
    assert root.find('application').attrib.get(NS+'debuggable','false')=='false','Delivery APK must not be debuggable'
    assert root.find('application').attrib.get(NS+'testOnly','false')=='false','Delivery APK must not be test-only'
    signature=subprocess.check_output([sdk_tool(sdk,'build-tools/35.0.0/apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True,encoding="utf-8")
    fingerprint=re.search(r'certificate SHA-256 digest: ([0-9a-f]+)',signature).group(1)
    assert fingerprint==CERTIFICATE,'Unexpected signing key'
    with zipfile.ZipFile(apk) as archive:
        dex=b''.join(archive.read(n) for n in archive.namelist() if n.endswith('.dex'))
        for name in archive.namelist():
            assert not re.search(r'(google-services|service[-_]?account).*\.json$',name,re.I),'Configuration JSON must not be packaged'
            data=archive.read(name)
            assert not re.search(rb'"private_key"\s*:',data),'Server credential field found'
            assert b'-----BEGIN PRIVATE KEY-----' not in data and b'-----BEGIN RSA PRIVATE KEY-----' not in data,'Private key found'
    supplied=[os.environ.get('ROXSTOCK_FCM_'+k,'') for k in ['APP_ID','API_KEY','PROJECT_ID','SENDER_ID']]
    assert not any(supplied) or all(supplied),'Incomplete verifier Firebase environment'
    if flavor=='notifications':
        if all(supplied):assert all(v.encode() in dex for v in supplied),'APK Firebase values do not match the expected configuration'
        configured=all(supplied) and all(v.encode() in dex for v in supplied)
    else:
        assert b'Lcom/google/firebase/' not in dex,'Firebase SDK found in web-only APK'
        assert all(not v or v.encode() not in dex for v in supplied),'Firebase configuration found in web-only APK'
        configured=False
    return {'certificateSha256':fingerprint,'versionCode':code,'debuggable':False,'serverCredentialsAbsent':True,'firebaseConfigured':bool(configured)}
