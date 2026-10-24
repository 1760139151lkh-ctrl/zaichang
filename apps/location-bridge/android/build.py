"""Build the product's debug-only USB location provider with the Android SDK.

No Gradle downloads, global PATH changes or Codex runtime are required.
"""
from pathlib import Path
import argparse
import os
import subprocess
import sys
import zipfile


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT"))
    parser.add_argument("--java-home", type=Path, default=os.environ.get("JAVA_HOME"))
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "build")
    args = parser.parse_args()
    local = Path.home() / "AppData/Local/Zaichang/android-development"
    sdk = args.sdk or local / "sdk"
    java = args.java_home or next(local.glob("jdk-17*"), Path("jdk-not-found"))
    tools = sdk / "build-tools/35.0.0"
    android = sdk / "platforms/android-35/android.jar"
    suffix = ".exe" if os.name == "nt" else ""
    for path in [java / ("bin/javac" + suffix), android, tools / ("aapt" + suffix)]:
        if not path.is_file():
            raise SystemExit(f"Required development dependency missing: {path}")
    root = Path(__file__).resolve().parent
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    classes = output / "classes"
    dex = output / "dex"
    classes.mkdir(exist_ok=True)
    dex.mkdir(exist_ok=True)
    env = dict(os.environ, JAVA_HOME=str(java), PATH=str(java / "bin") + os.pathsep + os.environ.get("PATH", ""))

    def run(*command):
        # Older Windows JDK launchers use the active ANSI code page for argv.
        # Relative project paths keep Unicode checkout names out of that conversion.
        def argument(part):
            if isinstance(part, Path) and part.is_absolute() and part.is_relative_to(root):
                return str(part.relative_to(root))
            return str(part)
        subprocess.run([argument(part) for part in command], check=True, env=env, cwd=root)

    run(java / ("bin/javac" + suffix), "-encoding", "UTF-8", "--release", "8", "-classpath", android, "-d", classes, *root.glob("src/**/*.java"))
    run(java / ("bin/java" + suffix), "-cp", tools / "lib/d8.jar", "com.android.tools.r8.D8", "--min-api", "26", "--lib", android, "--output", dex, *classes.glob("**/*.class"))
    unsigned = output / "unsigned.apk"
    run(tools / ("aapt" + suffix), "package", "-f", "-M", root / "AndroidManifest.xml", "-I", android, "-F", unsigned)
    with zipfile.ZipFile(unsigned, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(dex / "classes.dex", "classes.dex")
    aligned = output / "aligned.apk"
    run(tools / ("zipalign" + suffix), "-f", "4", unsigned, aligned)
    keystore = Path.home() / ".android/debug.keystore"
    if not keystore.exists():
        keystore.parent.mkdir(exist_ok=True)
        run(java / ("bin/keytool" + suffix), "-genkeypair", "-keystore", keystore, "-storepass", "android", "-keypass", "android", "-alias", "androiddebugkey", "-dname", "CN=Android Debug,O=Android,C=US", "-keyalg", "RSA", "-validity", "10000")
    apk = output / "zaichang-location-bridge-debug.apk"
    run(java / ("bin/java" + suffix), "-jar", tools / "lib/apksigner.jar", "sign", "--ks", keystore, "--ks-key-alias", "androiddebugkey", "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", apk, aligned)
    run(java / ("bin/java" + suffix), "-jar", tools / "lib/apksigner.jar", "verify", apk)
    print(apk)


if __name__ == "__main__":
    main()
