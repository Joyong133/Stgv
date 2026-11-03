package com.stgv.warrisk;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.stgv.warrisk.RiskEngine.any;
import static com.stgv.warrisk.RiskEngine.compile;

/**
 * 뉴스 제목에서 군 경계태세 보도를 찾는다.
 *  - 데프콘(DEFCON, 방어준비태세) 1~5 : 한미연합사. 평시 4. 실제 단계는 군사기밀이라 보도로만 알 수 있다.
 *  - 워치콘(WATCHCON, 대북 정보감시태세) 1~5
 *  - 진돗개 하나·둘·셋 : 무장공비 침투 등 국지 도발 대비 경보. 평시 셋, 하나가 최고.
 *  - 통합방위사태 갑종·을종·병종 : 정부가 선포. 갑종이 최고.
 *
 * '데프콘'은 방송인 이름, 'DEF CON'은 해킹 컨퍼런스 이름이기도 하므로
 * 숫자(1~5)와 군사 맥락 단어가 함께 있을 때만 인정한다.
 */
public class AlertStatusDetector {
    public static final int KIND_DEFCON = 0, KIND_WATCHCON = 1, KIND_JINDO = 2, KIND_DEFENSE = 3;
    public static final String[] KIND_NAMES = {"데프콘", "워치콘", "진돗개", "통합방위사태"};

    public static class Hit {
        public int kind;
        public int value; // 데프콘·워치콘 1~5, 진돗개 1~3(하나=1), 통합방위사태 1~3(갑=1). 작을수록 위험.

        public String text() {
            return valueText(kind, value);
        }
    }

    public static String valueText(int kind, int value) {
        switch (kind) {
            case KIND_JINDO: return "진돗개 " + (value == 1 ? "하나" : value == 2 ? "둘" : "셋");
            case KIND_DEFENSE: return "통합방위사태 " + (value == 1 ? "갑종" : value == 2 ? "을종" : "병종");
            default: return KIND_NAMES[kind] + " " + value;
        }
    }

    static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    static final Pattern DEFCON = Pattern.compile(
            "(?:데프콘|def\\s?con|デフコン|戒备等级)\\s*[-–]?\\s*([1-5])(?![0-9])", FLAGS);
    static final Pattern WATCHCON = Pattern.compile(
            "(?:워치콘|watch\\s?con|ウォッチコン)\\s*[-–]?\\s*([1-5])(?![0-9])", FLAGS);
    static final Pattern JINDO = Pattern.compile("진돗개\\s*(하나|둘|셋|1|2|3)(?![0-9])", FLAGS);
    static final Pattern DEFENSE = Pattern.compile("통합\\s*방위\\s*사태\\s*[‘'\"]?\\s*(갑|을|병)", FLAGS);

    /** 데프콘·워치콘이 군사 이야기임을 보여주는 단어. */
    static final Pattern[] MILITARY = compile(
            "발령", "격상", "상향", "하향", "해제", "단계", "경계", "태세", "한미", "연합사", "합참", "국방", "군",
            "북한", "북", "한반도", "전쟁", "raise*", "raising", "lower*", "elevat*", "alert", "readiness", "military",
            "forces", "korea*", "pyongyang", "war", "nuclear", "pentagon", "引き上げ", "警戒", "韓国", "北朝鮮",
            "提升", "朝鲜", "韩国");

    /** 해킹 컨퍼런스·과거 이야기·방송 등 제외. */
    static final Pattern[] NOT_STATUS = compile(
            "hacker*", "hacking", "conference", "las vegas", "security conference", "badge",
            "1976", "1983", "역사", "과거", "회고", "예능", "방송", "출연", "나는 솔로", "나는솔로", "유튜브",
            "드라마", "영화", "게임", "movie", "film", "game", "album", "rapper",
            // 추측·가정 (실제 발령이 아님)
            "가능성", "검토", "만약", "시나리오", "가상", "could", "might", "would", "if", "what is", "explained",
            "可能", "もし");

    /** 이 기사가 보도한 경계태세. 여러 개면 가장 심각한 종류 하나 (데프콘 우선). */
    public static Hit detect(String title) {
        if (title == null) return null;
        if (any(NOT_STATUS, title)) return null;
        boolean military = any(MILITARY, title);

        Matcher m = DEFCON.matcher(title);
        if (m.find() && military) return hit(KIND_DEFCON, Integer.parseInt(m.group(1)));
        m = WATCHCON.matcher(title);
        if (m.find() && military) return hit(KIND_WATCHCON, Integer.parseInt(m.group(1)));
        m = DEFENSE.matcher(title);
        if (m.find()) {
            String g = m.group(1);
            return hit(KIND_DEFENSE, g.equals("갑") ? 1 : g.equals("을") ? 2 : 3);
        }
        m = JINDO.matcher(title);
        if (m.find()) {
            String g = m.group(1);
            int v = g.equals("하나") || g.equals("1") ? 1 : g.equals("둘") || g.equals("2") ? 2 : 3;
            return hit(KIND_JINDO, v);
        }
        return null;
    }

    static Hit hit(int kind, int value) {
        Hit h = new Hit();
        h.kind = kind;
        h.value = value;
        return h;
    }
}
