#!/bin/bash
# 에뮬레이터에서 볼륨 잠금이 실제로 작동하는지 확인합니다.
PKG=com.stgv.volumelock
APK=volume-lock/app/build/outputs/apk/debug/app-debug.apk
vol() { adb shell cmd media_session volume --stream 3 --get 2>/dev/null | tr -d '\r'; }
mvol() { vol | grep -o 'volume is [0-9]*' | grep -o '[0-9]*$'; }

adb install -r "$APK"
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
for i in 1 2 3 4 5 6 7 8 9 10; do adb shell input keyevent KEYCODE_VOLUME_UP; done
adb shell input keyevent KEYCODE_VOLUME_DOWN; adb shell input keyevent KEYCODE_VOLUME_DOWN
sleep 1
START=$(mvol); echo "start: $(vol) => $START"; [ -n "$START" ] || { echo "cannot read volume"; exit 1; }

adb shell am start -W -n $PKG/.MainActivity
sleep 3
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
B=$(adb shell cat /sdcard/ui.xml | grep -o 'text="볼륨 잠금 켜기"[^>]*bounds="[^"]*"' | grep -o 'bounds="[^"]*"' | grep -o '[0-9]*' | tr '\n' ' ')
echo "switch bounds: $B"
set -- $B
adb shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
sleep 2
adb shell run-as $PKG cat shared_prefs/volume_lock.xml
adb shell input keyevent KEYCODE_HOME
sleep 1

FAIL=0
# 1) 되돌리기 (접근성 없이 버튼으로 줄임 → 다시 돌아와야 함)
adb shell input keyevent KEYCODE_VOLUME_DOWN; adb shell input keyevent KEYCODE_VOLUME_DOWN
sleep 1
v=$(mvol); echo "restore test: start $START -> now $v"; [ "$v" = "$START" ] || FAIL=1

# 2) 버튼 막기 (접근성 켬 → 줄어들지 않아야 함)
adb shell settings put secure enabled_accessibility_services $PKG/$PKG.VolumeKeyBlocker
adb shell settings put secure accessibility_enabled 1
sleep 5
echo "---- dumpsys accessibility ----"
adb shell dumpsys accessibility | grep -i -E "volumelock|Bound services|Enabled services|installed|crashed" | head -20
for i in 1 2 3; do adb shell input keyevent KEYCODE_VOLUME_DOWN; done
v=$(mvol); echo "key test (no wait): start $START -> now $v"; [ "$v" = "$START" ] || FAIL=1

adb shell am start -n $PKG/.MainActivity; sleep 2
adb exec-out screencap -p > screen.png
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb shell cat /sdcard/ui.xml | grep -o 'text="[^"]*진단[^"]*"'
echo "---- app log ----"
adb logcat -d | grep -i -E "VolumeLock|FATAL|E AndroidRuntime|Accessibility.*(volumelock|bind|error)" | tail -40
echo "RESULT FAIL=$FAIL"
exit $FAIL
