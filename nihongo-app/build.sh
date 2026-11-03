#!/usr/bin/env bash
# 일본어 말하기 APK 빌드 스크립트 (Android SDK 없이 aapt + dx + apksigner로 빌드)
# 필요: JDK, aapt, dalvik-exchange(dx), zipalign, apksigner
#   Ubuntu: sudo apt-get install aapt dalvik-exchange zipalign apksigner
set -euo pipefail
cd "$(dirname "$0")"

API=34
TOOLS=.tools
JAR=$TOOLS/android-$API.jar
OUT=build
APK=release/nihongo-speaking.apk

mkdir -p $TOOLS
if [ ! -f "$JAR" ]; then
  echo "android.jar(API $API) 다운로드..."
  curl -fsSL -o "$JAR" "https://raw.githubusercontent.com/Sable/android-platforms/master/android-$API/android.jar"
fi

DX=$(command -v dalvik-exchange || command -v dx)

rm -rf $OUT && mkdir -p $OUT/gen $OUT/classes $OUT/dex release

echo "[1/5] 리소스 처리 (aapt)"
aapt package -f -m -J $OUT/gen -M AndroidManifest.xml -S res -I "$JAR"

echo "[2/5] 자바 컴파일"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$JAR" -d $OUT/classes \
  $(find src $OUT/gen -name '*.java')

echo "[3/5] DEX 변환"
"$DX" --dex --min-sdk-version=21 --output=$OUT/dex/classes.dex $OUT/classes

echo "[4/5] APK 패키징"
aapt package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" \
  -0 arsc -F $OUT/unsigned.apk
( cd $OUT/dex && aapt add -f ../unsigned.apk classes.dex >/dev/null )
zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk

echo "[5/5] 서명"
KS=keystore/nihongo.keystore
if [ ! -f "$KS" ]; then
  mkdir -p keystore
  keytool -genkeypair -keystore "$KS" -storepass nihongo123 -keypass nihongo123 \
    -alias nihongo -keyalg RSA -keysize 2048 -validity 36500 \
    -dname "CN=Nihongo Speaking, O=Stgv, C=KR" >/dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-pass pass:nihongo123 --key-pass pass:nihongo123 \
  --ks-key-alias nihongo --min-sdk-version 21 --out "$APK" $OUT/aligned.apk
apksigner verify "$APK"
echo "완료: $APK ($(du -h "$APK" | cut -f1))"
