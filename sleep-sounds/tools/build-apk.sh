#!/usr/bin/env bash
# Gradle 없이 Android SDK 명령줄 도구만으로 서명된 APK 를 만든다.
#
# 필요한 것: JDK 17 이상, aapt2, d8 또는 dx(dalvik-exchange), zipalign, apksigner,
#            그리고 컴파일 기준이 될 android.jar (ANDROID_JAR 로 지정).
# 예) ANDROID_JAR=$ANDROID_HOME/platforms/android-35/android.jar tools/build-apk.sh
#
# 결과: release/danjam.apk
set -euo pipefail
cd "$(dirname "$0")/.."

ANDROID_JAR=${ANDROID_JAR:?ANDROID_JAR 에 android.jar 경로를 지정하세요}
prop() { sed -n "s/^$1=//p" gradle.properties; }
VERSION_CODE=$(prop danjam.versionCode)
VERSION_NAME=$(prop danjam.versionName)
PACKAGE=com.joyong133.danjam
MIN_SDK=24
TARGET_SDK=35
KEYSTORE=keystore/danjam.jks
KEY_PASS=danjam-sleep

OUT=build/apk
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex" release

echo "== 리소스"
sed "s|<manifest |<manifest package=\"$PACKAGE\" |" app/src/main/AndroidManifest.xml > "$OUT/AndroidManifest.xml"
aapt2 compile --dir app/src/main/res -o "$OUT/res.zip"
aapt2 link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$OUT/AndroidManifest.xml" \
    --java "$OUT/gen" --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/res.zip"

echo "== 자바 컴파일"
find app/src/main/java "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac --release 8 -Xlint:-options -encoding UTF-8 -cp "$ANDROID_JAR" -d "$OUT/classes" @"$OUT/sources.txt"

echo "== DEX 변환"
if command -v d8 >/dev/null 2>&1; then
    d8 --release --min-api "$MIN_SDK" --lib "$ANDROID_JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
else
    DX=$(command -v dx || command -v dalvik-exchange)
    "$DX" --dex --min-sdk-version="$MIN_SDK" --output="$OUT/dex/classes.dex" "$OUT/classes"
fi

echo "== 묶기 · 정렬 · 서명"
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && zip -q -X ../unaligned.apk classes.dex)
zipalign -p -f 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
    --v4-signing-enabled false --out release/danjam.apk "$OUT/aligned.apk"
apksigner verify release/danjam.apk
echo "완료: release/danjam.apk ($(du -h release/danjam.apk | cut -f1))"
