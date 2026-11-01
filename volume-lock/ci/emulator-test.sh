#!/bin/bash
# 에뮬레이터에서 볼륨 잠금이 실제로 작동하는지 확인합니다.
set -u
PKG=com.stgv.volumelock
APK=volume-lock/app/build/outputs/apk/debug/app-debug.apk
vol() { adb shell cmd media_session volume --stream 3 --get 2>/dev/null | grep -o 'volume is [0-9]*' | grep -o '[0-9]*$'; }

adb install -r "$APK"
adb shell cmd media_session volume --stream 3 --set 10 >/dev/null
echo "start volume: $(vol)"

# 1) 앱 실행 → 잠금 스위치를 실제 화면에서 누름
adb shell am start -W -n $PKG/.MainActivity
sleep 3
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
B=$(adb shell cat /sdcard/ui.xml | grep -o 'text="볼륨 잠금 켜기"[^>]*bounds="[^"]*"' | grep -o 'bounds="[^"]*"' | grep -o '[0-9]*' | tr '\n' ' ')
set -- $B
adb shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
sleep 2
adb shell run-as $PKG cat shared_prefs/volume_lock.xml

FAIL=0
# 2) 되돌리기 테스트 (접근성 없이)
adb shell cmd media_session volume --stream 3 --set 2 >/dev/null
sleep 1
v=$(vol); echo "restore test: set 2 -> now $v"; [ "$v" = 10 ] || FAIL=1

# 3) 볼륨 버튼 막기 테스트 (접근성 켬)
adb shell settings put secure enabled_accessibility_services $PKG/$PKG.VolumeKeyBlocker
adb shell settings put secure accessibility_enabled 1
sleep 3
adb shell dumpsys accessibility | grep -i -A2 volumelock | head -5
for i in 1 2 3; do adb shell input keyevent KEYCODE_VOLUME_DOWN; done
v=$(vol); echo "key test (immediately): now $v"; [ "$v" = 10 ] || FAIL=1

adb exec-out screencap -p > screen.png
echo "---- app log ----"
adb logcat -d | grep -E "VolumeLock|FATAL|AndroidRuntime" | tail -40
echo "RESULT FAIL=$FAIL"
exit $FAIL
