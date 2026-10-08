#!/usr/bin/env python3
"""Server-local hidden KRX key entry; never deploys or invokes collectors."""
import argparse
import fcntl
import getpass
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import warnings
import errno

ROOT = Path('/opt/roxstock')
ENV = ROOT / 'backend/.env.production'
ENTRY = re.compile(rb'^[ \t]*(?:export[ \t]+)?KRX_API_KEY[ \t]*=')
STAGE = 'startup'


class CheckFailure(Exception):
    pass


def stage(name):
    global STAGE
    STAGE = name


def fail(reason):
    raise CheckFailure(reason)


def replace_key(content, key):
    lines = content.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if ENTRY.match(line)]
    if len(matches) > 1:
        fail('duplicate KRX_API_KEY entries; owner must resolve duplicates without printing values')
    entry = b'KRX_API_KEY=' + key.encode('ascii') + b'\n'
    if matches:
        lines[matches[0]] = entry
        return b''.join(lines)
    return content + (b'\n' if content and not content.endswith(b'\n') else b'') + entry


def checked_content():
    stage('env-file-type')
    info = ENV.lstat()
    if not stat.S_ISREG(info.st_mode):
        fail('production env must be a regular file, not a symlink')
    stage('env-file-mode')
    if stat.S_IMODE(info.st_mode) != 0o600:
        fail('production env permissions must be 600')
    stage('env-file-owner')
    if info.st_uid != os.geteuid():
        fail('run as the production env owner (this server: root)')
    stage('git-untracked')
    tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '--error-unmatch',
                              'backend/.env.production'], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    if tracked.returncode == 0:
        fail('production env is Git tracked; stop and resolve tracking before registration')
    if tracked.returncode != 1:
        fail('Git tracking check failed (exit %d); check repository access and ownership' % tracked.returncode)
    stage('git-ignored')
    ignored = subprocess.run(['git', '-C', str(ROOT), 'check-ignore', '-q',
                              'backend/.env.production'], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    if ignored.returncode != 0:
        fail('Git exclusion check failed (exit %d); production env must match an ignore rule' % ignored.returncode)
    stage('env-file-read')
    return info, ENV.read_bytes()


def register(info, content):
    # Refuse getpass's echoing fallback, redirected input, and shell arguments.
    stage('hidden-input-terminal')
    with open('/dev/tty', 'r+') as tty, warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        key = getpass.getpass('KRX_API_KEY (hidden): ', stream=tty)
        confirm = getpass.getpass('Confirm KRX_API_KEY (hidden): ', stream=tty)
    stage('hidden-input-validation')
    if key != confirm:
        fail('confirmation does not match; no changes made')
    if not re.fullmatch(r'[A-Za-z0-9._~+/=%-]+', key):
        fail('key is empty or contains unsupported characters; no changes made')
    updated = replace_key(content, key)
    del key, confirm
    stage('env-atomic-write')
    fd, temporary = tempfile.mkstemp(prefix='.env.krx-', dir=ENV.parent)
    try:
        with os.fdopen(fd, 'wb') as target:
            os.fchmod(target.fileno(), 0o600)
            os.fchown(target.fileno(), info.st_uid, info.st_gid)
            target.write(updated)
            target.flush()
            os.fsync(target.fileno())
        # Stop if another operator changed the source during hidden input.
        current_info, current = checked_content()
        stage('env-concurrent-change')
        if current != content or current_info.st_ino != info.st_ino:
            fail('production env changed during input; retry after the other operator finishes')
        stage('env-atomic-replace')
        os.replace(temporary, ENV)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    stage('env-save-verification')
    _, saved = checked_content()
    stage('env-save-verification')
    if saved != updated:
        fail('saved file differs from intended update; investigate without printing values')
    print('KRX_API_KEY registered and saved file verified; containers were not changed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--register', action='store_true', help='hidden terminal input')
    args = parser.parse_args()
    print('Production root: /opt/roxstock; env: /opt/roxstock/backend/.env.production')
    print('Execution cwd: ' + os.getcwd() + '; file paths are absolute')
    # Use the existing production deployment lock; no deployment is triggered.
    stage('deployment-lock-open')
    with (ROOT / '.deploy/production.lock').open('r+') as lock:
        stage('deployment-lock-acquire')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        info, content = checked_content()
        entries = [line for line in content.splitlines() if ENTRY.match(line)]
        stage('env-key-duplicates')
        if len(entries) > 1:
            fail('duplicate KRX_API_KEY entries; resolve duplicates without printing values')
        if args.register:
            register(info, content)
        else:
            present = bool(entries and entries[0].split(b'=', 1)[1].strip() not in
                           (b'', b'""', b"''"))
            print('KRX_API_KEY: ' + ('registered' if present else 'not registered'))
            print('Source env: mode 600, untracked, ignored; runtime not checked.')


if __name__ == '__main__':
    try:
        main()
    except CheckFailure as error:
        raise SystemExit('FAILED [%s]: %s' % (STAGE, str(error)))
    except OSError as error:
        reasons = {errno.EACCES: 'permission denied; check execution identity and filesystem restrictions',
                   errno.EPERM: 'operation not permitted; check filesystem restrictions',
                   errno.ENOENT: 'required path or executable is missing',
                   errno.ENXIO: 'no controlling terminal; use a personal interactive server terminal or ssh -t',
                   errno.ENOSPC: 'filesystem is full; registration cannot be saved',
                   errno.EROFS: 'filesystem is read-only'}
        reason = reasons.get(error.errno, 'OS operation failed (errno %s)' % error.errno)
        if STAGE == 'deployment-lock-acquire' and error.errno in (errno.EAGAIN, errno.EACCES):
            reason = 'production deployment lock is held; wait for the active operation to finish; do not delete the lock'
        raise SystemExit('FAILED [%s]: %s' % (STAGE, reason))
    except getpass.GetPassWarning:
        raise SystemExit('FAILED [%s]: secure hidden input unavailable; echo fallback refused' % STAGE)
    except (KeyboardInterrupt, EOFError):
        raise SystemExit('FAILED [%s]: input cancelled; no key value printed' % STAGE)
    except Exception:
        # Never print arbitrary exception text or tracebacks containing secrets.
        raise SystemExit('FAILED [%s]: unexpected failure; investigate this check without dumping environment values' % STAGE)
