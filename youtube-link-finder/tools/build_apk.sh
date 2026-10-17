#!/usr/bin/env bash
# Builds app-release.apk without Gradle: aapt2 -> javac -> dx -> zipalign -> apksig.
# Needs in $TOOLS: android.jar (API 34), aapt2, dalvik-dx-*.jar, apksig-*.jar
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${TOOLS:?set TOOLS to the directory with android.jar, aapt2, dx and apksig jars}"
ANDROID_JAR="$TOOLS/android.jar"
AAPT2="$TOOLS/aapt2"
DX_JAR="$(ls "$TOOLS"/dalvik-dx-*.jar | head -1)"
APKSIG_JAR="$(ls "$TOOLS"/apksig-*.jar | head -1)"
SRC="$HERE/app/src/main"
OUT="$HERE/build"
KEYSTORE="${KEYSTORE:-$HERE/keystore/release.p12}"
KEYPASS="${KEYPASS:-ytfinder}"

rm -rf "$OUT" && mkdir -p "$OUT"/{res,gen,classes,dex,signer}

echo "[1/5] resources"
"$AAPT2" compile --dir "$SRC/res" -o "$OUT/res/compiled.zip"
"$AAPT2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$SRC/AndroidManifest.xml" \
  --java "$OUT/gen" --auto-add-overlay "$OUT/res/compiled.zip"

echo "[2/5] javac"
find "$SRC/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -encoding UTF-8 --release 8 -nowarn -Xlint:-options -classpath "$ANDROID_JAR" \
  -d "$OUT/classes" @"$OUT/sources.txt"

echo "[3/5] dex"
java -cp "$DX_JAR" com.android.dx.command.Main --dex --min-sdk-version=24 \
  --output="$OUT/dex/classes.dex" "$OUT/classes"
(cd "$OUT/dex" && zip -q -X "$OUT/base.apk" classes.dex)
python3 "$HERE/tools/zipalign.py" "$OUT/base.apk" "$OUT/aligned.apk"

echo "[4/5] keystore"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$KEYPASS" -keypass "$KEYPASS" \
    -alias ytfinder -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=YouTube Link Finder" >/dev/null 2>&1
fi

echo "[5/5] sign"
javac -encoding UTF-8 -nowarn -cp "$APKSIG_JAR" -d "$OUT/signer" "$HERE/tools/SignApk.java"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED \
  --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$APKSIG_JAR:$OUT/signer" SignApk "$KEYSTORE" "$KEYPASS" ytfinder "$OUT/aligned.apk" "$OUT/app-release.apk"
ls -la "$OUT/app-release.apk"
