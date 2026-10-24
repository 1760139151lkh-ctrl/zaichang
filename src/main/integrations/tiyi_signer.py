"""Process-local client for the long-lived school signing service.

The service is optional: when the host has not installed the official
application library, ``available()`` is false and the connector keeps its
one-shot signer path. No proprietary binary is carried in this repository.

The service is started lazily, speaks one JSON object per line and is reused
for every API call made by one connector process. The host adapter terminates
the whole connector tree, so no signer survives a cancelled query.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time


class TiyiSigner:
    def __init__(self, directory, dependencies=None, device_id=None, deadline=None):
        self.directory = Path(directory).resolve() if directory else None
        self.dependencies = Path(dependencies).resolve() if dependencies else None
        self.device_id = device_id or ""
        self.deadline = deadline
        self._process = None
        self._lock = threading.Lock()
        self._failure = None
        self._secret = ""
        self._started_at = None

    def available(self):
        return bool(
            self.directory
            and (self.directory / "main.py").is_file()
            and (self.directory / "native_signer.py").is_file()
            and (self.directory / "libAMapSDK_Location_v6_6_0.so").is_file()
            and (self.directory / "app-cert.der").is_file()
        )

    def _service_script(self):
        here = Path(__file__).resolve().parent
        for candidate in (
            here / "tiyi-signing-service.py",
            here.parent.parent.parent / "scripts" / "tiyi-signing-service.py",
        ):
            if candidate.is_file():
                return candidate
        return None

    def _environment(self):
        env = {
            key: value
            for key, value in os.environ.items()
            if not __import__("re").search(
                r"API_KEY|TOKEN|AUTHORIZATION|COOKIE|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY",
                key,
                __import__("re").I,
            )
        }
        env.update({"PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1"})
        paths = [str(self.directory)]
        if self.dependencies:
            paths.append(str(self.dependencies))
        packaged = Path(__file__).resolve().parent / "signing-dependencies"
        if packaged.is_dir():
            paths.append(str(packaged))
        env["PYTHONPATH"] = os.pathsep.join(paths)
        env["TIYI_SIGNER_DIRECTORY"] = str(self.directory)
        return env

    def _start(self):
        script = self._service_script()
        if script is None:
            raise RuntimeError("signing service script missing")
        remaining = self._remaining()
        if remaining <= 0:
            raise RuntimeError("signing deadline exceeded")
        process = subprocess.Popen(
            [sys.executable, str(script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf8",
            env=self._environment(),
            creationflags=0x08000000 if os.name == "nt" else 0,
        )
        ready = self._read(process, min(30, remaining))
        if not ready or ready.get("ready") is not True:
            self._stop(process)
            raise RuntimeError("signing service did not start")
        self._process = process

    def _remaining(self):
        if self.deadline is None:
            return 60.0
        return self.deadline - time.monotonic()

    def _read(self, process, timeout):
        line = process.stdout.readline()
        if not line or len(line) > 2 * 1024 * 1024:
            return None
        try:
            return json.loads(line)
        except ValueError:
            return None

    def _stop(self, process):
        try:
            stdin = process.stdin
            if stdin is not None and not stdin.closed:
                stdin.close()
        except OSError:
            pass
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
        for stream in (process.stdout, process.stderr):
            try:
                if stream is not None:
                    stream.close()
            except OSError:
                pass

    def close(self):
        with self._lock:
            if self._process is not None:
                self._stop(self._process)
                self._process = None

    def headers(self, uri):
        """Return signing headers for an ``/api/...`` URI, or ``None``."""
        if not self.available() or not self._secret:
            return None
        with self._lock:
            for attempt in (0, 1):
                try:
                    if self._process is None or self._process.poll() is not None:
                        self._process = None
                        self._start()
                    stdin = self._process.stdin
                    if stdin is None:
                        raise RuntimeError("signing stdin unavailable")
                    request = json.dumps(
                        {
                            "secret": self._secret,
                            "uri": uri,
                            "deviceId": self.device_id,
                        },
                        separators=(",", ":"),
                    )
                    stdin.write(request + "\n")
                    stdin.flush()
                    reply = self._read(self._process, min(40, self._remaining()))
                    if reply and reply.get("ok") is True:
                        headers = reply.get("headers")
                        if isinstance(headers, dict) and all(
                            isinstance(headers.get(key), str)
                            and headers[key]
                            and "\n" not in headers[key]
                            and "\r" not in headers[key]
                            for key in ("timestamp", "sign", "imei", "v1", "client")
                        ):
                            return {
                                key: headers[key]
                                for key in ("timestamp", "sign", "imei", "v1", "client")
                            }
                    if reply is None and attempt == 0:
                        # The service died; restart once inside this call.
                        if self._process is not None and self._process.poll() is None:
                            self._stop(self._process)
                        self._process = None
                        continue
                    raise RuntimeError("signing service rejected the request")
                except (OSError, RuntimeError, ValueError) as error:
                    self._failure = type(error).__name__
                    if self._process is not None and self._process.poll() is None:
                        self._stop(self._process)
                    self._process = None
                    if attempt == 1:
                        return None
        return None

    def set_secret(self, secret):
        """The service receives the session secret from the owning connector."""
        self._secret = secret
