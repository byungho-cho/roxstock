"""Exercise the actual workflow verifier and publication manifest writer without SSH/Docker."""
import json,re,subprocess,sys,tempfile,textwrap,unittest
from pathlib import Path
from apk_verification import expected_version
ROOT=Path(__file__).resolve().parents[2]
class ApkPublicationTest(unittest.TestCase):
    def test_workflow_requires_matching_verified_source_version(self):
        workflow=(ROOT/'.github/workflows/production-deploy.yml').read_text()
        script=textwrap.dedent(re.search(r'apk_metadata="\$\(python3 .*?<<\'PY\'\n(.*?)\n          PY',workflow,re.S).group(1))
        version,code=expected_version('notifications');digest='a'*64
        with tempfile.TemporaryDirectory() as directory:
            apk=Path(directory)/'test.apk';report=apk.with_suffix('.verification.json')
            valid={'sha256':digest,'signatureVerified':True,'applicationId':'com.roxstock.app.debug','versionName':version,'versionCode':code,'firebaseConfigured':True}
            for change in [{},{'versionCode':code-1},{'versionName':'0.0.0'},{'sha256':'b'*64},{'signatureVerified':False},{'applicationId':'other.package'}]:
                report.write_text(json.dumps({**valid,**change}))
                result=subprocess.run([sys.executable,'-',str(apk),digest],input=script,text=True,capture_output=True,cwd=ROOT)
                if not change:self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),f'true {version} {code}')
                else:self.assertNotEqual(result.returncode,0);self.assertEqual(result.stdout,'')
    def test_published_manifest_uses_verified_version_and_code(self):
        path=ROOT/'android-app/publish-notifications-apk.sh';source=path.read_text()
        script=re.search(r"<<'PY'\n(.*?)\nPY",source,re.S).group(1)
        version,code=expected_version('notifications');sha='a'*40;digest='b'*64
        with tempfile.TemporaryDirectory() as directory:
            manifest=Path(directory)/'latest.json';filename=f'roxstock-notifications-{version}-{sha[:12]}-{digest[:12]}.apk'
            subprocess.run([sys.executable,'-',str(manifest),filename,sha,digest,'true',version,str(code)],input=script,text=True,check=True)
            result=json.loads(manifest.read_text());self.assertEqual(result['version'],version);self.assertEqual(result['versionCode'],code);self.assertEqual(result['sha256'],digest);self.assertEqual(result['url'],'/downloads/android/'+filename);self.assertTrue(result['firebaseConfigured'])
        for version_arg,code_arg in [('bad','10'),('0.1.9','0'),('0.1.9','bad')]:
            result=subprocess.run(['bash',str(path),sha,digest,'true',version_arg,code_arg],capture_output=True)
            self.assertEqual(result.returncode,2)
if __name__=='__main__':unittest.main()
