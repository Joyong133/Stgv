#!/usr/bin/env bash
# 터치 잠금 APK 빌드 스크립트 (Android SDK / Gradle 없이 빌드)
#  필요: JDK 17 이상, python3, zip, curl
#  결과: build/touch-lock.apk
set -euo pipefail
cd "$(dirname "$0")"
T=.tools
mkdir -p "$T" build
get() { [ -s "$T/$1" ] || curl -fsSL -o "$T/$1" "$2"; }
get android-30.jar https://raw.githubusercontent.com/Sable/android-platforms/master/android-30/android.jar
get dx.jar https://repo.maven.apache.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar
get apksig.jar https://repo.maven.apache.org/maven2/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar

rm -rf build/classes build/apk && mkdir -p build/classes build/apk

echo "▶ 자바 컴파일"
javac -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$T/android-30.jar" -d build/classes $(find src -name '*.java')

echo "▶ DEX 변환"
java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=26 \
  --output=build/apk/classes.dex build/classes

echo "▶ 매니페스트 변환"
python3 tools/axml.py AndroidManifest.xml build/apk/AndroidManifest.xml

echo "▶ APK 묶기"
rm -f build/unsigned.apk
(cd build/apk && zip -qX ../unsigned.apk AndroidManifest.xml classes.dex)

echo "▶ 서명"
KS=touchlock.p12 PASS=touchlock ALIAS=touchlock
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$PASS" -keypass "$PASS" \
    -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Touch Lock" >/dev/null 2>&1
fi
javac -nowarn -cp "$T/apksig.jar" -d build/signer tools/Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED -cp "build/signer:$T/apksig.jar" Sign "$KS" "$PASS" "$ALIAS" build/unsigned.apk build/touch-lock.apk

echo "✅ 완료: $(pwd)/build/touch-lock.apk"
