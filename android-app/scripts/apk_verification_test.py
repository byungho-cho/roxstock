import os,tempfile,unittest,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from apk_verification import CERTIFICATE,NS,expected_version,verify_common

class ApkVerificationTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name);tool=self.base/'build-tools/35.0.0/apksigner';tool.parent.mkdir(parents=True);tool.touch()
        self.apk=self.base/'app.apk'
        self.env={k:'' for k in ['ROXSTOCK_FCM_APP_ID','ROXSTOCK_FCM_PROJECT_ID','ROXSTOCK_FCM_SENDER_ID','ROXSTOCK_FCM_API_KEY']}
    def root(self,flavor='notifications',debug=False):
        version,code=expected_version(flavor);r=ET.Element('manifest',{NS+'versionName':version,NS+'versionCode':str(code)});ET.SubElement(r,'application',{NS+'debuggable':str(debug).lower()});return r
    def apk_data(self,data):
        with zipfile.ZipFile(self.apk,'w') as z:z.writestr('classes.dex',data)
    def check(self,flavor='notifications',root=None):
        with patch.dict(os.environ,self.env),patch('apk_verification.subprocess.check_output',return_value='certificate SHA-256 digest: '+CERTIFICATE):return verify_common(root if root is not None else self.root(flavor),self.apk,self.base,flavor)
    def test_configured_means_values_are_in_apk(self):
        self.env={k:'fixture_'+str(i) for i,k in enumerate(self.env)};self.apk_data(' '.join(self.env.values()).encode());self.assertTrue(self.check()['firebaseConfigured'])
        self.apk_data(b'missing');self.assertRaises(AssertionError,self.check)
    def test_reject_private_key_or_debuggable_delivery(self):
        for data in [b'{"private_key":"example"}',b'-----BEGIN PRIVATE KEY-----']:
            self.apk_data(data);self.assertRaises(AssertionError,self.check)
        self.apk_data(b'clean');self.assertRaises(AssertionError,lambda:self.check(root=self.root(debug=True)))
    def test_webonly_cannot_include_firebase_or_client_values(self):
        self.apk_data(b'Lcom/google/firebase/FirebaseApp;');self.assertRaises(AssertionError,lambda:self.check('webOnly'))
        self.env={k:'fixture_'+str(i) for i,k in enumerate(self.env)};self.apk_data(' '.join(self.env.values()).encode());self.assertRaises(AssertionError,lambda:self.check('webOnly'))
        self.apk_data(b'clean');self.assertFalse(self.check('webOnly')['firebaseConfigured'])
    def test_reject_incomplete_configuration(self):
        self.env['ROXSTOCK_FCM_APP_ID']='fixture';self.apk_data(b'fixture');self.assertRaises(AssertionError,self.check)

if __name__=='__main__':unittest.main()
