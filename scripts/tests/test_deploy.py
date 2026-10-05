"""Run with: python3 -B -m unittest discover -s scripts/tests -v

Exercises deployment failure boundaries without contacting Docker or replacing containers.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]

DOCKER = '''#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  'container inspect --format '*com.docker.compose.project*) echo "$OWNER" ;;
  'container inspect --format '*missing-healthcheck*) echo "$HEALTH" ;;
  *' pull frontend') exit "${PULL_EXIT:-0}" ;;
  *' logs --tail=100 frontend') echo 'diagnostic logs' ;;
esac
'''


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        shutil.copy(ROOT / 'scripts/deploy.sh', self.root / 'scripts/deploy.sh')
        shutil.copy(ROOT / 'compose.yml', self.root / 'compose.yml')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for name, content in {
            'docker': DOCKER,
            'curl': '#!/usr/bin/env bash\nexit "${CURL_EXIT:-0}"\n',
        }.items():
            path = self.bin / name
            path.write_text(content)
            path.chmod(0o755)
        self.log = self.root / 'calls'

    def deploy(self, tag='sha-f5016c0', **overrides):
        env = dict(os.environ, PATH=f'{self.bin}:{os.environ["PATH"]}',
                   CALL_LOG=str(self.log), OWNER='roxstock', HEALTH='healthy')
        env.update(overrides)
        result = subprocess.run(['bash', str(self.root / 'scripts/deploy.sh'), tag],
                                cwd='/tmp', env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, universal_newlines=True,
                                timeout=10)
        calls = self.log.read_text() if self.log.exists() else ''
        return result, calls

    def test_compose_success_from_other_directory(self):
        result, calls = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f'--project-name roxstock --file {self.root}/compose.yml', calls)
        self.assertNotIn('container stop', calls)
        self.assertIn('up -d --force-recreate --no-deps --pull never frontend', calls)

    def test_manual_container_migration_pulls_before_stopping(self):
        result, calls = self.deploy(OWNER='')
        self.assertEqual(result.returncode, 0)
        self.assertLess(calls.index('pull frontend'), calls.index('container stop'))
        self.assertLess(calls.index('container rm'), calls.index('up -d'))

    def test_pull_failure_preserves_container(self):
        result, calls = self.deploy(OWNER='', PULL_EXIT='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('container stop', calls)
        self.assertNotIn('up -d', calls)

    def test_foreign_project_is_rejected(self):
        result, calls = self.deploy(OWNER='another-project')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('pull frontend', calls)
        self.assertNotIn('container stop', calls)

    def test_health_and_http_failures_print_diagnostics(self):
        for overrides in ({'HEALTH': 'unhealthy'}, {'HEALTH': 'exited'},
                          {'HEALTH': 'missing-healthcheck'}, {'CURL_EXIT': '22'}):
            with self.subTest(overrides=overrides):
                result, calls = self.deploy(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('diagnostic logs', result.stdout)
                self.assertIn('Redeploy the previous SHA tag', result.stdout)

    def test_latest_is_rejected_before_docker(self):
        result, calls = self.deploy('latest')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, '')

    def test_concurrent_deployment_is_rejected(self):
        import fcntl
        with (self.root / '.deploy.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result, calls = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Another deployment is running', result.stdout)
        self.assertNotIn('pull frontend', calls)


if __name__ == '__main__':
    unittest.main()
