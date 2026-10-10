package com.stgv.timehider;

import java.util.regex.Pattern;

/** 글자 안에 시각 표시가 들어 있는지 판별한다. */
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
            + "|(?<![\\d:])(?:1[0-2]|0?[1-9])\\s?(?i:[ap]\\.?m\\.?)(?![a-zA-Z])");

    // 시와 분을 두 줄로 쓰는 큰 잠금화면 시계: "15\n45"
    private static final Pattern STACKED = Pattern.compile(
            "\\s*" + HOUR + "\\s*\\n\\s*" + MINUTE + "\\s*");

    private static final int MAX_LENGTH = 4000;

    private TimePatterns() {}

    static boolean containsTime(CharSequence s) {
        if (s == null || s.length() == 0) return false;
        if (s.length() > MAX_LENGTH) s = s.subSequence(0, MAX_LENGTH);
        return INLINE.matcher(s).find() || STACKED.matcher(s).matches();
    }
}
