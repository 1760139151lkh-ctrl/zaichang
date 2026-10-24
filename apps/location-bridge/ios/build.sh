#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
sdk="${APPLE_SDK:-iphonesimulator}"
arch="${APPLE_ARCH:-$(uname -m)}"
out="${1:-build}"
if [ "$sdk" = iphoneos ]; then
  arch=arm64
  target=arm64-apple-ios16.0
else
  target="$arch-apple-ios16.0-simulator"
fi
mkdir -p "$out/ZaichangLocation.app"
app="$out/ZaichangLocation.app"
xcrun --sdk "$sdk" swiftc -swift-version 6 -parse-as-library -O -target "$target" -sdk "$(xcrun --sdk "$sdk" --show-sdk-path)" \
  -framework SwiftUI -framework CoreLocation LocationBridge.swift -o "$app/ZaichangLocation"
cp Info.plist "$app/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleSupportedPlatforms array" "$app/Info.plist"
if [ "$sdk" = iphoneos ]; then
  /usr/libexec/PlistBuddy -c "Add :CFBundleSupportedPlatforms:0 string iPhoneOS" "$app/Info.plist"
else
  /usr/libexec/PlistBuddy -c "Add :CFBundleSupportedPlatforms:0 string iPhoneSimulator" "$app/Info.plist"
fi
codesign --force --sign - "$app"
codesign --verify --strict "$app"
printf '%s\n' "$app"
