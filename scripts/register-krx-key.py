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

ROOT = Path('/opt/roxstock')
ENV = ROOT / 'backend/.env.production'
ENTRY = re.compile(rb'^[ \t]*(?:export[ \t]+)?KRX_API_KEY[ \t]*=')


def replace_key(content, key):
    lines = content.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if ENTRY.match(line)]
    if len(matches) > 1:
        raise ValueError('duplicate entry')
    entry = b'KRX_API_KEY=' + key.encode('ascii') + b'\n'
    if matches:
        lines[matches[0]] = entry
        return b''.join(lines)
    return content + (b'\n' if content and not content.endswith(b'\n') else b'') + entry


def checked_content():
    info = ENV.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('production env must be a regular mode-600 file')
    if info.st_uid != os.geteuid():
        raise ValueError('run as production env owner')
    tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '--error-unmatch',
                              'backend/.env.production'], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    ignored = subprocess.run(['git', '-C', str(ROOT), 'check-ignore', '-q',
                              'backend/.env.production'], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    if tracked.returncode != 1 or ignored.returncode != 0:
        raise ValueError('env must be untracked and ignored')
    return info, ENV.read_bytes()


def register(info, content):
    # Refuse getpass's echoing fallback, redirected input, and shell arguments.
    with open('/dev/tty', 'r+') as tty, warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        key = getpass.getpass('KRX_API_KEY (hidden): ', stream=tty)
        confirm = getpass.getpass('Confirm KRX_API_KEY (hidden): ', stream=tty)
    if key != confirm or not re.fullmatch(r'[A-Za-z0-9._~+/=%-]+', key):
        raise ValueError('empty, unsupported, or mismatched key')
    updated = replace_key(content, key)
    del key, confirm
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
        if current != content or current_info.st_ino != info.st_ino:
            raise ValueError('production env changed concurrently')
        os.replace(temporary, ENV)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('KRX_API_KEY registered in source env; containers were not changed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--register', action='store_true', help='hidden terminal input')
    args = parser.parse_args()
    # Use the existing production deployment lock; no deployment is triggered.
    with (ROOT / '.deploy/production.lock').open('r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        info, content = checked_content()
        entries = [line for line in content.splitlines() if ENTRY.match(line)]
        if len(entries) > 1:
            raise ValueError('duplicate key entry')
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
    except (Exception, KeyboardInterrupt):
        # No traceback, exception values, env contents, or key fragments.
        raise SystemExit('Registration/check stopped. Check file ownership, mode 600, '
                         'Git exclusion, deployment lock, duplicate entries, and hidden input.')
