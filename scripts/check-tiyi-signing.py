"""Validate and stage the optional official signing component.

The school's application library and certificate are not redistributed with
this project. Point ``--signer-directory`` at a directory that already holds
the original ``main.py``, ``native_signer.py``, ``libAMapSDK_Location_v6_6_0.so``
and ``app-cert.der``. This tool only checks them and can run an offline
self-test through the long-lived service used by the connector.

Usage:
  python scripts/stage-tiyi-signing.py --signer-directory <dir>
  python scripts/stage-tiyi-signing.py --signer-directory <dir> --self-test
  python scripts/stage-tiyi-signing.py --signer-directory <dir> \
      --dependencies <dir-with-unicorn-and-pycryptodome>

Output is one JSON object. It never prints the secret, a signature or a header.
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
INTEGRATIONS = ROOT / "src" / "main" / "integrations"
SERVICE = INTEGRATIONS / "tiyi-signing-service.py"
REQUIRED = (
    "main.py",
    "native_signer.py",
    "libAMapSDK_Location_v6_6_0.so",
    "app-cert.der",
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--signer-directory", required=True)
    parser.add_argument("--dependencies")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    directory = pathlib.Path(args.signer_directory).resolve()
    report = {"signerDirectory": str(directory), "files": {}, "service": str(SERVICE)}
    missing = []
    for name in REQUIRED:
        exists = (directory / name).is_file()
        report["files"][name] = exists
        if not exists:
            missing.append(name)
    if not SERVICE.is_file():
        missing.append("tiyi-signing-service.py")
    report["ready"] = not missing
    if missing:
        report["missing"] = missing
        print(json.dumps(report, ensure_ascii=False))
        return 2
    if not args.self_test:
        print(json.dumps(report, ensure_ascii=False))
        return 0

    env = {
        key: value
        for key, value in os.environ.items()
        if not __import__("re").search(
            r"API_KEY|TOKEN|AUTHORIZATION|COOKIE|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY",
            key,
            __import__("re").I,
        )
    }
    env.update(
        {
            "PYTHONUTF8": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "TIYI_SIGNER_DIRECTORY": str(directory),
        }
    )
    paths = [str(directory)]
    if args.dependencies:
        paths.append(str(pathlib.Path(args.dependencies).resolve()))
    env["PYTHONPATH"] = os.pathsep.join(paths)
    started = time.time()
    process = subprocess.Popen(
        [sys.executable, str(SERVICE)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf8",
        env=env,
        creationflags=0x08000000 if os.name == "nt" else 0,
    )
    try:
        ready = process.stdout.readline()
        report["startup"] = json.loads(ready) if ready else None
        report["startupSeconds"] = round(time.time() - started, 2)
        if report["startup"] and report["startup"].get("ready"):
            # Deliberately invalid secret: proves the native path runs and the
            # service rejects bad input without touching the school.
            process.stdin.write(
                json.dumps({"secret": "invalid-test-secret", "uri": "/api/l/v6/u/info"})
                + "\n"
            )
            process.stdin.flush()
            answer = process.stdout.readline()
            report["selfTest"] = json.loads(answer) if answer else None
    finally:
        try:
            process.stdin.close()
        except OSError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report.get("startup", {}).get("ready") else 1


if __name__ == "__main__":
    raise SystemExit(main())
