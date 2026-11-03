package com.stgv.warrisk;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * '향후 30일 안에 남북 간 전쟁(대규모 무력충돌)이 일어날 가능성'을 어림한다.
 *
 * 로지스틱 모형: 확률 = 1 / (1 + e^(−z)),
 *   z = 기본값 + 0.045×위험지수 + 1.0×(서울 대사관 철수 국가, 최대 3)
 *       + 0.6×(자국민 철수·여행금지 국가, 최대 3) + 0.3×(평양 대사관 철수 국가, 최대 2)
 *       + 0.015×(최근 1~3일 평균 대비 위험지수 상승폭, 최대 40)
 *   철수 국가는 기사 2건 이상이면 1개국, 1건뿐이면 0.5개국으로 센다 (오보 한 건에 크게 흔들리지 않게).
 *
 * 대략: 평시 0.2% · 미사일 발사 1% · 핵실험+ICBM 4% · 교전+사상자 10~15% · 여기에 여러 나라 대사관 철수까지 겹치면 50% 안팎.
 *
 * 기본값 −6.2 → 평시 약 0.2%/30일. 1953년 정전 이후 70여 년간 전면전이 없었고,
 * 국지 도발·교전은 몇 년에 한 번꼴이었다는 점을 반영한 보수적인 출발점이다.
 * 요인마다 확률의 '배수'(odds 배수 = e^항)를 함께 보여줘 왜 이 숫자인지 알 수 있게 한다.
 *
 * 과거 데이터로 맞춘 통계 모형이 아니라 경험적 어림값이다. 앱에서도 참고용으로만 안내한다.
 */
public class WarOdds {
    static final double BASE = -6.2;
    static final double PER_SCORE = 0.045;
    static final double PER_SEOUL_EMBASSY = 1.0;
    static final double PER_CITIZEN = 0.6;
    static final double PER_PY_EMBASSY = 0.3;
    static final double PER_RISE = 0.015;
    static final double MIN_P = 0.001, MAX_P = 0.9;

    public static double baseProbability() {
        return 1 / (1 + Math.exp(-BASE));
    }

    /** history: [시각, 점수] 목록 (이번 결과 이전 기록). */
    public static void compute(RiskReport r, List<long[]> history, long now) {
        r.warFactors.clear();

        // 나라별 기사 수 (같은 나라가 서울·평양 양쪽에 잡히면 각각 센다)
        Map<String, Integer> seoul = new HashMap<>(), py = new HashMap<>(), citizen = new HashMap<>();
        for (RiskReport.EmbassyEvent e : r.embassyEvents) {
            Map<String, Integer> m = e.type == EmbassyDetector.TYPE_CITIZEN ? citizen
                    : EmbassyDetector.LOC_SEOUL.equals(e.location) ? seoul : py;
            Integer prev = m.get(e.country);
            m.put(e.country, (prev == null ? 0 : prev) + e.articles);
        }

        double z = BASE;
        double t = PER_SCORE * r.score;
        z += t;
        r.warFactors.add(new RiskReport.OddsFactor("위험 지수 " + r.score + "점", Math.exp(t)));

        z += addCountries(r, "서울 대사관 철수", seoul, PER_SEOUL_EMBASSY, 3);
        z += addCountries(r, "자국민 철수·여행금지", citizen, PER_CITIZEN, 3);
        z += addCountries(r, "평양 대사관 철수", py, PER_PY_EMBASSY, 2);

        // 최근 24~72시간 전 기록의 평균과 비교해 급상승 여부
        double sum = 0;
        int n = 0;
        for (long[] p : history) {
            double ageH = (now - p[0]) / 3600000.0;
            if (ageH >= 24 && ageH <= 72) {
                sum += p[1];
                n++;
            }
        }
        if (n >= 2) {
            double rise = r.score - sum / n;
            if (rise >= 5) {
                t = PER_RISE * Math.min(40, rise);
                z += t;
                r.warFactors.add(new RiskReport.OddsFactor(
                        String.format(java.util.Locale.KOREA, "1~3일 전보다 %.0f점 급상승", rise), Math.exp(t)));
            }
        }

        double p = 1 / (1 + Math.exp(-z));
        r.warProb = Math.max(MIN_P, Math.min(MAX_P, p));
    }

    static double addCountries(RiskReport r, String name, Map<String, Integer> m, double per, double cap) {
        if (m.isEmpty()) return 0;
        double n = 0;
        for (int articles : m.values()) n += articles >= 2 ? 1 : 0.5;
        double t = per * Math.min(cap, n);
        r.warFactors.add(new RiskReport.OddsFactor(name + " " + m.size() + "개국", Math.exp(t)));
        return t;
    }

    /** "100번 중 약 3번" 같은 직관적 표현. */
    public static String intuitive(double p) {
        if (p >= 0.1) return "10번 중 약 " + Math.round(p * 10) + "번";
        if (p >= 0.01) return "100번 중 약 " + Math.round(p * 100) + "번";
        return "1000번 중 약 " + Math.max(1, Math.round(p * 1000)) + "번";
    }

    public static String percent(double p) {
        if (p < 0.1) return String.format(java.util.Locale.KOREA, "%.1f%%", p * 100);
        return String.format(java.util.Locale.KOREA, "%.0f%%", p * 100);
    }
}
