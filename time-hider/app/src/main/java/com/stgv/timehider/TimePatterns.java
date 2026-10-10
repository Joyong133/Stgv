package com.stgv.timehider;

import java.util.Locale;
import java.util.regex.Pattern;

/** 글자나 화면 요소가 시각 표시인지 판별한다. */
final class TimePatterns {
    private static final String HOUR = "(?:[01]?\\d|2[0-3])";
    private static final String MINUTE = "[0-5]\\d";
    private static final String COLON = "[:：∶]";

    private static final Pattern INLINE = Pattern.compile(
            // 3:45, 15:45, 03:45:12, 오후 3:45
            "(?<!\\d)" + HOUR + "\\s?" + COLON + "\\s?" + MINUTE + "(?!\\d)"
            // 3시, 오후 3시 45분 (3시간·시즌·시리즈는 제외)
            + "|(?<!\\d)" + HOUR + "\\s?시(?![간즌리])"
            // 3 PM, 11am, 9 a.m.
            + "|(?<![\\d:])(?:1[0-2]|0?[1-9])\\s?(?i:[ap]\\.?m\\.?)(?![a-zA-Z])"
            // 5분 전, 2시간 전, 30초 전 (지금 시각을 짐작할 수 있는 표시)
            + "|(?<!\\d)\\d{1,3}\\s?(?:초|분|시간)\\s?전"
            // 5 min ago, 2 hours ago
            + "|(?<!\\d)\\d{1,3}\\s?(?i:secs?|mins?|minutes?|hrs?|hours?)\\s?(?i:ago)");

    // 시와 분을 두 줄로 쓰는 큰 잠금화면 시계: "15\n45"
    private static final Pattern STACKED = Pattern.compile(
            "\\s*" + HOUR + "\\s*\\n\\s*" + MINUTE + "\\s*");

    // 화면 요소 이름(id)을 단어로 나눈다: keyguard_clock_view, timeText → keyguard / clock / view, time / Text
    private static final Pattern ID_WORDS = Pattern.compile("(?<=[a-z0-9])(?=[A-Z])|[_\\-.]");

    private static final int MAX_LENGTH = 4000;

    private TimePatterns() {}

    static boolean containsTime(CharSequence s) {
        if (s == null || s.length() == 0) return false;
        if (s.length() > MAX_LENGTH) s = s.subSequence(0, MAX_LENGTH);
        return INLINE.matcher(s).find() || STACKED.matcher(s).matches();
    }

    /**
     * 화면 요소 이름이 시계·시각을 뜻하는지. 글자 없이 그림으로 그린 시계(아날로그 시계, 잠금화면 시계,
     * 시계 위젯)와 알림의 "5분" 같은 시각 칸을 잡기 위해 쓴다. 예: com.android.systemui:id/clock, android:id/time
     */
    static boolean isTimeViewId(String viewId) {
        if (viewId == null || viewId.isEmpty()) return false;
        int slash = viewId.lastIndexOf('/');
        String name = slash >= 0 ? viewId.substring(slash + 1) : viewId;
        if (name.toLowerCase(Locale.ROOT).contains("clock")) return true;
        for (String word : ID_WORDS.split(name)) {
            switch (word.toLowerCase(Locale.ROOT)) {
                case "time":
                case "timestamp":
                case "datetime":
                case "hour":
                case "hours":
                case "minute":
                case "minutes":
                    return true;
                default:
                    break;
            }
        }
        return false;
    }
}
