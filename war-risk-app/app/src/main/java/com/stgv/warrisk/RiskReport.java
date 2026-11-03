package com.stgv.warrisk;

import java.util.ArrayList;
import java.util.List;

/** 한 번 확인한 결과: 위험 지수, 단계, 근거 신호, 기사 목록. */
public class RiskReport {
    public static final int LEVEL_LOW = 0;      // 관심
    public static final int LEVEL_CAUTION = 1;  // 주의
    public static final int LEVEL_ALERT = 2;    // 경계
    public static final int LEVEL_SEVERE = 3;   // 심각

    public static final String[] LEVEL_NAMES = {"관심", "주의", "경계", "심각"};
    public static final String[] LEVEL_DESC = {
            "평소 수준입니다. 특별한 군사 충돌 징후가 보도되지 않았습니다.",
            "미사일 발사·도발 등 긴장 요인이 보도되고 있습니다.",
            "핵실험·포격·침범 등 심각한 군사 행동이 여러 언론에 보도되고 있습니다.",
            "교전·사상자·전쟁 관련 보도가 집중되고 있습니다. 공식 발표를 꼭 확인하세요."
    };

    public static class SignalHit {
        public String name;
        public int weight;          // 신호 기본 가중치 (음수면 완화 신호)
        public int articles;        // 이 신호가 잡힌 기사 수
        public double contribution; // 지수에 실제로 더해진 점수

        public SignalHit(String name, int weight, int articles, double contribution) {
            this.name = name;
            this.weight = weight;
            this.articles = articles;
            this.contribution = contribution;
        }
    }

    /** 같은 나라·장소·유형의 철수 소식 묶음. */
    public static class EmbassyEvent {
        public int type;          // EmbassyDetector.TYPE_*
        public String location;   // EmbassyDetector.LOC_*
        public String country;
        public int articles;
        public long latestMs;
        public String title;      // 가장 최근 기사 제목
        public String url;

        public String typeName() {
            return EmbassyDetector.TYPE_NAMES[type];
        }
    }

    /** 전쟁 확률을 몇 배 올렸는지 보여주는 요인. */
    public static class OddsFactor {
        public String name;
        public double multiplier;

        public OddsFactor(String name, double multiplier) {
            this.name = name;
            this.multiplier = multiplier;
        }
    }

    public long checkedAt;
    public double warProb;      // 0~1, 향후 30일 전쟁 가능성 어림값
    public List<OddsFactor> warFactors = new ArrayList<>();
    public List<EmbassyEvent> embassyEvents = new ArrayList<>();
    public int score;           // 0~100
    public int level;
    public int totalArticles;   // 중복 제거 후 관련 기사 수
    public int riskyArticles;   // 위험 신호가 하나라도 잡힌 기사 수
    public int sourceCount;     // 서로 다른 언론사 수
    public int regionCount;     // 서로 다른 나라/판 수
    public List<SignalHit> signals = new ArrayList<>();
    public List<Article> articles = new ArrayList<>();
    public List<String> errors = new ArrayList<>(); // 실패한 수집 경로 (부분 실패 안내용)

    public static int levelFor(int score) {
        if (score >= 75) return LEVEL_SEVERE;
        if (score >= 50) return LEVEL_ALERT;
        if (score >= 25) return LEVEL_CAUTION;
        return LEVEL_LOW;
    }
}
