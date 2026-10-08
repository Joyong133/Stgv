#!/usr/bin/env bash
# 방어전 APK 빌드 스크립트.
# Android SDK 없이 Maven Central의 apktool(aapt2 + smali 포함)과 apksig만으로 APK를 만든다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${TOOLS_CACHE:-$HOME/.cache/stgv-apk-tools}"
BUILD="$ROOT/build"
M=https://repo1.maven.org/maven2
APKTOOL="$CACHE/apktool-cli-3.0.3.jar"
APKSIG="$CACHE/apksig-2.3.0.jar"

mkdir -p "$CACHE" "$BUILD"
[ -f "$APKTOOL" ] || curl -fsSL -o "$APKTOOL" "$M/org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar"
[ -f "$APKSIG" ]  || curl -fsSL -o "$APKSIG"  "$M/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar"

# 앱 소스 + 게임(웹) 파일을 assets 로 합친다
rm -rf "$BUILD/app"
cp -r "$ROOT/android" "$BUILD/app"
rm -f "$BUILD/app/release.keystore"
mkdir -p "$BUILD/app/assets"
cp -r "$ROOT/defense/." "$BUILD/app/assets/"

java -jar "$APKTOOL" b "$BUILD/app" -o "$BUILD/unsigned.apk" -f
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$APKSIG" "$ROOT/tools/Sign.java" "$ROOT/android/release.keystore" stgvdefense stgv \
  "$BUILD/unsigned.apk" "$ROOT/dist/GuardianKnights-Defense.apk"
