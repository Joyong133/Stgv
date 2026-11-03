#!/usr/bin/env bash
# 넘김 뷰어 APK 만들기 (Gradle · Android Studio 없이)
# 필요한 것 (Ubuntu): sudo apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-17-jdk
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
JAR="$SDK/platforms/android-23/android.jar"
DX="$(command -v dx || echo "$SDK/build-tools/debian/dx")"
OUT=build
APK=dist/neomgim-viewer.apk

rm -rf "$OUT"
mkdir -p "$OUT/assets" "$OUT/gen" "$OUT/classes" dist

# 1) 웹 화면: viewer/index.html 을 그대로 쓰되, 오프라인에서 바로 뜨도록 웹 글꼴 링크만 뺀다
grep -v 'fonts\.g' ../viewer/index.html > "$OUT/assets/index.html"

# 2) 리소스 · 매니페스트
aapt package -f -M AndroidManifest.xml -S res -A "$OUT/assets" -I "$JAR" -J "$OUT/gen" -F "$OUT/app.unsigned.apk"

# 3) 자바 → dex
javac -encoding UTF-8 -source 8 -target 8 -nowarn -Xlint:-options \
  -bootclasspath "$JAR" -classpath "$JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java')
"$DX" --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add -f app.unsigned.apk classes.dex >/dev/null)

# 4) 정렬 · 서명
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
apksigner sign --v4-signing-enabled false --ks debug.keystore --ks-pass pass:android --ks-key-alias neomgim --key-pass pass:android \
  --out "$APK" "$OUT/app.aligned.apk"
apksigner verify "$APK"
echo "완성: android/$APK ($(du -h "$APK" | cut -f1))"
