"""Build/install this native location sampler through the user's local Mac.

Uses Windows OpenSSH and the user's private apple-location.json; no Codex runtime,
cloud Mac, Python packages, saved passwords or automatic simulator selection.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import uuid
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--configuration', type=Path, default=Path(os.environ.get('ZAICHANG_IOS_SSH_CONFIG') or Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'Zaichang/apple-location.json'))
    parser.add_argument('--device', help='Explicit, already booted CoreSimulator UDID; omit to build only.')
    args = parser.parse_args()
    config = json.loads(args.configuration.read_text(encoding='utf-8-sig'))
    if config.get('host') != '127.0.0.1' or not isinstance(config.get('port'), int) or not 1 <= config['port'] <= 65535:
        raise SystemExit('Only the configured local Mac is supported.')
    if not re.fullmatch(r'[a-zA-Z0-9_.@-]{1,128}', config.get('username', '')):
        raise SystemExit('Invalid local Mac account.')
    if not re.fullmatch(r'/Applications/[a-zA-Z0-9 ._/-]+/Contents/Developer', config.get('developerDirectory', '')):
        raise SystemExit('Invalid Xcode developer directory.')
    for key in ('identityFile', 'knownHostsFile'):
        if not Path(config.get(key, '')).is_absolute() or not Path(config[key]).is_file():
            raise SystemExit('The configured SSH identity or known-host record is missing.')
    if args.device and not re.fullmatch(r'[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}', args.device):
        raise SystemExit('Invalid simulator UDID.')
    common = ['-F', 'none', '-i', config['identityFile'], '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
              '-o', 'StrictHostKeyChecking=yes', '-o', f"UserKnownHostsFile={config['knownHostsFile']}", '-o', 'ConnectTimeout=5']
    target = config['username'] + '@127.0.0.1'

    def remote(command):
        return subprocess.run(['ssh', *common, '-T', '-p', str(config['port']), target,
                               'export DEVELOPER_DIR=' + shlex.quote(config['developerDirectory']) + '; ' + command], check=True)

    root = Path(__file__).resolve().parent
    remote_root = 'Library/Application Support/Zaichang/LocationBridge/builds/' + str(uuid.uuid4())
    with tempfile.TemporaryDirectory(prefix='zaichang-location-build-') as work:
        archive = Path(work) / 'source.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
            manifest = {}
            for name in ('LocationBridge.swift', 'Info.plist', 'build.sh'):
                data = (root / name).read_bytes()
                package.writestr(name, data)
                manifest[name] = hashlib.sha256(data).hexdigest()
            package.writestr('source-manifest.json', json.dumps(manifest, indent=2))
        remote('/bin/mkdir -p ' + shlex.quote(remote_root))
        subprocess.run(['scp', *common, '-P', str(config['port']), str(archive), target + ':' + remote_root + '/source.zip'], check=True)
        command = 'cd ' + shlex.quote(remote_root) + ' && /usr/bin/unzip -qo source.zip && /bin/bash build.sh'
        if args.device:
            device = shlex.quote(args.device)
            command += ' && /usr/bin/xcrun simctl install ' + device + ' build/ZaichangLocation.app'
            command += ' && /usr/bin/xcrun simctl launch ' + device + ' cn.zaichang.location'
        remote(command)
    print('Native source manifest:', json.dumps(manifest))
    print('Build retained on the configured local Mac:', remote_root)


if __name__ == '__main__':
    main()
