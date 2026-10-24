"""Stage the fixed public Python dependencies used by the optional signer.

This does not install into Hermes or copy any locally installed package.
Wheels and the missing upstream construct license are checked by SHA-256.
"""

import hashlib
import io
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import shutil
import stat
import urllib.parse
import urllib.request
import uuid
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
TARGET = PROJECT / "dist-electron/tiyi-runtime/signing-dependencies"
CACHE = PROJECT / "build/tiyi-signing-cache"
LOCK = PROJECT / "runtime/tiyi/signing-lock.json"


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def checked_generated(path, relative):
    expected = PROJECT.joinpath(*PurePosixPath(relative).parts)
    resolved = path.resolve()
    if (
        path != expected
        or path.is_symlink()
        or resolved != expected
        or not resolved.is_relative_to(PROJECT)
    ):
        raise RuntimeError(
            "Signing dependency output escaped its exact project folder."
        )
    return resolved


def child_path(root, relative):
    if (
        not isinstance(relative, str)
        or not relative
        or "\\" in relative
        or PurePosixPath(relative).is_absolute()
        or PureWindowsPath(relative).drive
        or any(part in ("", ".", "..") for part in relative.split("/"))
    ):
        raise RuntimeError("Signing dependency path is not a plain relative file.")
    # Do not compare two roots that have both followed the same junction.
    # The lexical expected folder is anchored to the resolved project root.
    checked_generated(root, root.relative_to(PROJECT).as_posix())
    destination = root.joinpath(*PurePosixPath(relative).parts)
    if not destination.resolve().is_relative_to(root):
        raise RuntimeError("Signing dependency file escaped its resource folder.")
    return destination


def declared_entries(files):
    return set(files) | {
        parent.as_posix() + "/"
        for name in files
        for parent in PurePosixPath(name).parents
        if parent != PurePosixPath(".")
    }


def resource_entries(root):
    checked_generated(root, root.relative_to(PROJECT).as_posix())
    if not root.exists():
        return set()
    files, pending = set(), [root]
    while pending:
        for entry in pending.pop().iterdir():
            # Inspect before descending; an unlisted junction must not expand
            # the copied tree even when every listed file still hashes well.
            if (
                entry.is_symlink()
                or entry.resolve() != entry
                or not entry.resolve().is_relative_to(root)
            ):
                raise RuntimeError(
                    "Signing dependency tree contains a redirected path."
                )
            if entry.is_dir():
                files.add(entry.relative_to(root).as_posix() + "/")
                pending.append(entry)
            elif entry.is_file():
                files.add(entry.relative_to(root).as_posix())
            else:
                raise RuntimeError("Signing dependency tree contains a non-file entry.")
    return files


def download(url, expected):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in (
        "files.pythonhosted.org",
        "raw.githubusercontent.com",
    ):
        raise RuntimeError("Unexpected signing dependency source.")
    checked_generated(CACHE, "build/tiyi-signing-cache")
    cached = child_path(CACHE, expected)
    if cached.is_file() and digest(cached.read_bytes()) == expected:
        return cached.read_bytes()
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024 or digest(raw) != expected:
        raise RuntimeError("Signing dependency did not match its fixed SHA-256.")
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(raw)
    return raw


def stage():
    # Validate before any cached manifest can return, including parent junctions.
    checked_generated(TARGET, "dist-electron/tiyi-runtime/signing-dependencies")
    checked_generated(CACHE, "build/tiyi-signing-cache")
    lock_raw = LOCK.read_bytes()
    lock = json.loads(lock_raw)
    manifest_file = child_path(TARGET, "manifest.json")
    if manifest_file.is_file():
        previous = json.loads(manifest_file.read_text("utf8"))
        expected_files = {"manifest.json"}
        for item in previous.get("files", []):
            child_path(TARGET, item["path"])
            expected_files.add(item["path"])
        expected_tree = declared_entries(expected_files)
        actual_tree = resource_entries(TARGET)
        if actual_tree - expected_tree:
            # Preserve unfamiliar files instead of packaging or deleting them.
            raise RuntimeError(
                "Signing dependency tree contains files absent from its manifest."
            )
        if (
            previous.get("lockSha256") == digest(lock_raw)
            and previous.get("files")
            and previous.get("packages") == lock["packages"]
            and all(
                child_path(TARGET, item["path"]).is_file()
                and digest(child_path(TARGET, item["path"]).read_bytes())
                == item["sha256"]
                for item in previous.get("files", [])
            )
            and actual_tree == expected_tree
        ):
            return previous
    elif resource_entries(TARGET):
        raise RuntimeError(
            "Existing signing dependency files have no resource manifest."
        )
    staging = TARGET.with_name(TARGET.name + ".next-" + uuid.uuid4().hex)
    staging_relative = "dist-electron/tiyi-runtime/" + staging.name
    checked_generated(staging, staging_relative)
    staging.mkdir(parents=True)
    files = []

    def write(relative, raw, distribution):
        destination = child_path(staging, relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        files.append(
            {
                "path": relative,
                "sha256": digest(raw),
                "bytes": len(raw),
                "distribution": distribution,
            }
        )

    try:
        for package in lock["packages"]:
            raw = download(package["url"], package["sha256"])
            with zipfile.ZipFile(io.BytesIO(raw)) as wheel:
                for member in wheel.infolist():
                    path = PurePosixPath(member.filename)
                    if (
                        member.is_dir()
                        or "__pycache__" in path.parts
                        or "SelfTest" in path.parts
                        or path.suffix == ".pyc"
                    ):
                        continue
                    module = path.parts[0] == package["module"]
                    metadata = path.parts[0] == package["metadata"] and (
                        path.name in ("METADATA", "WHEEL", "LICENSE", "LICENSE.rst")
                        or "licenses" in path.parts
                    )
                    if not (module or metadata):
                        continue
                    if stat.S_ISLNK(member.external_attr >> 16):
                        raise RuntimeError(
                            "Signing dependency symlinks are not allowed."
                        )
                    write(member.filename, wheel.read(member), package["distribution"])
        for license_file in lock["additionalLicenses"]:
            write(
                license_file["path"],
                download(license_file["url"], license_file["sha256"]),
                "bundled-construct",
            )
        manifest = {
            "schema": 1,
            "lockSha256": digest(lock_raw),
            "platform": lock["platform"],
            "packages": lock["packages"],
            "files": files,
            "excludes": [
                "SelfTest",
                "official client assets",
                "native signing component",
                "certificate",
                "account data",
            ],
        }
        (staging / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), "utf8"
        )
        if resource_entries(staging) != declared_entries(
            {"manifest.json", *(item["path"] for item in files)}
        ):
            raise RuntimeError(
                "Signing dependency staging tree differs from its manifest."
            )
        # These are exact generated resource paths inside this project. Never
        # remove a resolved path outside their known parent or follow a symlink.
        checked_generated(TARGET, "dist-electron/tiyi-runtime/signing-dependencies")
        checked_generated(staging, staging_relative)
        if TARGET.exists():
            shutil.rmtree(TARGET)
        staging.replace(TARGET)
        return manifest
    finally:
        if staging.exists():
            checked_generated(staging, staging_relative)
            shutil.rmtree(staging)


if __name__ == "__main__":
    result = stage()
    print(
        json.dumps(
            {
                "signingDependencies": len(result["files"]),
                "packages": [
                    item["distribution"] + "==" + item["version"]
                    for item in result["packages"]
                ],
            }
        )
    )
