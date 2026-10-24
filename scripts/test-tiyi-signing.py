"""Offline tests for the Tiyi signing service and exercise payload contract.

Run with:  python -m unittest scripts/test-tiyi-signing.py
Set ZAICHANG_TIYI_INTEGRATION=1 (plus the signer/session paths) to include the
live-signing assertion against the local session already stored by the app.
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
INTEGRATIONS = ROOT / "src" / "main" / "integrations"
sys.path.insert(0, str(INTEGRATIONS))

SIGNER = os.environ.get("ZAICHANG_TIYI_SIGNER_DIRECTORY", "")
DEPS = os.environ.get("ZAICHANG_TIYI_SIGNER_DEPENDENCIES", "")
PRIVATE = os.environ.get(
    "ZAICHANG_TIYI_PRIVATE_DIRECTORY", str(pathlib.Path.home() / ".zaichang-tiyi-test")
)


class SigningServiceContract(unittest.TestCase):
    def test_stage_reports_missing_component(self):
        script = ROOT / "scripts" / "check-tiyi-signing.py"
        result = subprocess.run(
            [
                sys.executable,
                str(script),
                "--signer-directory",
                str(ROOT / "does-not-exist"),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf8",
        )
        self.assertEqual(result.returncode, 2)
        report = json.loads(result.stdout)
        self.assertFalse(report["ready"])
        self.assertIn("missing", report)

    @unittest.skipUnless(
        SIGNER and pathlib.Path(SIGNER).is_dir(),
        "official signer directory not configured",
    )
    def test_stage_self_test_starts_service(self):
        script = ROOT / "scripts" / "check-tiyi-signing.py"
        command = [
            sys.executable,
            str(script),
            "--signer-directory",
            SIGNER,
            "--self-test",
        ]
        if DEPS:
            command += ["--dependencies", DEPS]
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf8",
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ready"])
        self.assertTrue(report["startup"]["ready"])
        # A deliberately invalid secret must not be accepted.
        self.assertFalse(report["selfTest"]["ok"])

    @unittest.skipUnless(
        SIGNER and pathlib.Path(SIGNER).is_dir(),
        "official signer directory not configured",
    )
    def test_signer_headers_shape(self):
        from tiyi_signer import TiyiSigner

        signer = TiyiSigner(SIGNER, DEPS, "unit-test-device", time.monotonic() + 90)
        try:
            signer.set_secret("invalid-secret-for-shape")
            headers = signer.headers("/api/l/v6/u/info")
            self.assertIsNone(headers)
        finally:
            signer.close()

    @unittest.skipUnless(
        os.environ.get("ZAICHANG_TIYI_INTEGRATION") == "1", "live signing not requested"
    )
    def test_signer_live_headers(self):
        import tiyi_connector as connector
        from tiyi_signer import TiyiSigner

        session = connector.load(pathlib.Path(PRIVATE) / "session.dpapi")
        self.assertTrue(session and session.get("secret"))
        signer = TiyiSigner(SIGNER, DEPS, "unit-test-device", time.monotonic() + 90)
        try:
            signer.set_secret(session["secret"])
            headers = signer.headers("/api/l/v6/u/info?xh=" + session["user"])
        finally:
            signer.close()
        self.assertTrue(headers)
        self.assertEqual({"timestamp", "sign", "imei", "v1", "client"}, set(headers))
        self.assertTrue(
            all(headers[key] and "\n" not in headers[key] for key in headers)
        )


class ExercisePayloadContract(unittest.TestCase):
    def test_payload_requires_real_track(self):
        from tiyi_modules import upload
        from tiyi_modules.common import Failure

        class Connection:
            session = {"user": "3250104350"}

        args = {
            "sportId": "7127e528-53dc-454f-a51d-1b1e20d8bed6",
            "sportTypeId": "18",
            "name": "紫金港田径场",
            "beginTime": "2026-10-25 10:00:00",
            "endTime": "2026-10-25 10:20:00",
            "track": [],
        }
        with self.assertRaises(Failure) as caught:
            upload.build_payload(Connection(), args)
        self.assertEqual(caught.exception.code, "SPORT_INPUT_INVALID")

    def test_payload_accepts_monotonic_track(self):
        from tiyi_modules import upload

        class Connection:
            session = {"user": "3250104350"}

        args = {
            "sportId": "7127e528-53dc-454f-a51d-1b1e20d8bed6",
            "sportTypeId": "18",
            "name": "紫金港田径场",
            "beginTime": "2026-10-25 10:00:00",
            "endTime": "2026-10-25 10:20:00",
            "track": [
                {
                    "latitude": 30.3052,
                    "longitude": 120.0827,
                    "time": 1793000000000,
                    "accuracy": 5,
                    "speed": 2.5,
                    "distance": 0,
                },
                {
                    "latitude": 30.3053,
                    "longitude": 120.0828,
                    "time": 1793000060000,
                    "accuracy": 5,
                    "speed": 2.6,
                    "distance": 500,
                },
            ],
        }
        payload = upload.build_payload(Connection(), args)
        self.assertEqual(payload["xh"], "3250104350")
        self.assertEqual(payload["coordinate"][0]["a"], 30.3052)
        self.assertEqual(payload["beganPoint"], "30.3052|120.0827")
        self.assertGreater(float(payload["odometer"]), 0)

    def test_payload_rejects_backwards_time(self):
        from tiyi_modules import upload
        from tiyi_modules.common import Failure

        class Connection:
            session = {"user": "3250104350"}

        args = {
            "sportId": "7127e528-53dc-454f-a51d-1b1e20d8bed6",
            "sportTypeId": "18",
            "name": "紫金港田径场",
            "beginTime": "2026-10-25 10:00:00",
            "endTime": "2026-10-25 10:20:00",
            "track": [
                {"latitude": 30.3052, "longitude": 120.0827, "time": 1793000060000},
                {"latitude": 30.3053, "longitude": 120.0828, "time": 1793000000000},
            ],
        }
        with self.assertRaises(Failure) as caught:
            upload.build_payload(Connection(), args)
        self.assertEqual(caught.exception.code, "SPORT_INPUT_INVALID")


if __name__ == "__main__":
    unittest.main()
