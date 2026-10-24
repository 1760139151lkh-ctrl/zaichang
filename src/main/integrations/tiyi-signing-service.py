"""Long-lived stdin/stdout signing service for the school's application protocol.

This file contains no proprietary binary. It imports ``native_signer`` and the
official application library from the host-provided signer directory, so the
original APK assets stay outside the repository.

Wire protocol (one JSON object per line):

  request:  {"secret": "...", "uri": "/api/...", "now": 1712345678901,
             "deviceId": "..."}
  response: {"ok": true, "headers": {...}, "parts": ["...", ...]}
            or {"ok": false, "error": "..."}

The service never logs the secret, the signed URI or any header value.
"""

import base64
import hashlib
import json
import os
import pathlib
import re
import sys
import time

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad


def fail(message):
    print(
        json.dumps({"ok": False, "error": message[:160]}, separators=(",", ":")),
        flush=True,
    )


def main():
    signer_directory = pathlib.Path(
        os.environ.get("TIYI_SIGNER_DIRECTORY", "")
    ).resolve()
    if not signer_directory.is_dir():
        fail("TIYI_SIGNER_DIRECTORY is not a directory")
        return 2
    sys.path.insert(0, str(signer_directory))
    try:
        from native_signer import Signer
    except Exception as error:
        fail("native_signer unavailable: " + type(error).__name__)
        return 2

    library = signer_directory / "libAMapSDK_Location_v6_6_0.so"
    certificate = signer_directory / "app-cert.der"
    if not library.is_file() or not certificate.is_file():
        fail("official signing library or certificate missing")
        return 2

    print(json.dumps({"ok": True, "ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            secret = request["secret"]
            uri = request["uri"]
            now = int(request.get("now") or time.time() * 1000)
            device_id = request.get("deviceId") or ""
            if (
                not isinstance(secret, str)
                or not 16 <= len(secret) <= 8192
                or not isinstance(uri, str)
                or not uri.startswith(("/api/", "/app/"))
                or len(uri) > 8192
                or not isinstance(device_id, str)
                or len(device_id) > 256
            ):
                raise ValueError("invalid signing input")
            engine = Signer(str(library), now=now)
            parts = engine.sign(secret, uri).split("|")
            if len(parts) < 4:
                code = re.search(r"-\d+", "".join(parts)[:120])
                raise RuntimeError(
                    "native signing status "
                    + (code.group(0) if code else "unrecognized")
                )
            client = json.dumps(
                {"root": "0", "heap": "0", "t": str(now)}, separators=(",", ":")
            ).encode()
            encoded = base64.b64encode(
                AES.new(secret[:16].encode(), AES.MODE_ECB).encrypt(pad(client, 16))
            ).decode()
            headers = {
                "timestamp": parts[1],
                "sign": parts[3],
                "imei": device_id or hashlib.md5(str(now).encode()).hexdigest(),
                "v1": hashlib.md5(str(now).encode()).hexdigest(),
                "client": encoded,
            }
            if any(
                not isinstance(value, str) or re.search(r"[\r\n\0]", value)
                for value in headers.values()
            ):
                raise ValueError("invalid header value")
            print(
                json.dumps(
                    {"ok": True, "headers": headers, "parts": parts},
                    separators=(",", ":"),
                ),
                flush=True,
            )
        except Exception as error:
            code = re.search(r"-\d+", str(error))
            fail(type(error).__name__ + (":" + code.group(0) if code else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
