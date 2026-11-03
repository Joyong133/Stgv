package com.stgv.warrisk;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 기사 제목에서 위험 신호를 찾아 0~100 위험 지수를 계산한다.
 *
 * 계산 방식
 *  1. 북한/한반도와 관련 없는 기사는 버린다.
 *  2. 같은 내용의 기사(제목이 거의 같은 기사)는 하나로 합친다.
 *  3. 신호(예: "포격")마다 그 신호가 잡힌 기사들의 최신도 가중치를 더해 '보도 강도'를 구한다.
 *     최신도 가중치는 기사 나이가 18시간 지날 때마다 약 1/e로 줄어든다. 72시간 넘은 기사는 버린다.
 *  4. 신호 점수 = 가중치 × (1 − e^(−보도강도/1.5)). 기사 1건이면 절반쯤, 3~4건 이상이면 거의 전부 반영된다.
 *     한두 건의 자극적인 기사보다 여러 언론이 함께 보도하는 사건이 더 크게 반영된다.
 *  5. 위험 신호 합 − 완화 신호(회담·대화) 합 = 원점수, 지수 = 100 × (1 − e^(−원점수/45)).
 *
 * 북한군의 러시아 파병처럼 '다른 전쟁' 기사는 사상자·교전 같은 단어가 많지만 한반도 위험과는 다르므로,
 * 한반도(남한·DMZ 등) 맥락 없이 우크라이나·러시아 전선을 다루는 기사는 강한 신호(가중치 20 이상)를 세지 않는다.
 */
public class RiskEngine {

    static final double RECENCY_HOURS = 18.0;
    static final double MAX_AGE_HOURS = 72.0;
    static final double SATURATION = 1.5;
    static final double SCALE = 45.0;

    /** 여러 언어의 표현을 하나로 묶은 신호. */
    static class Signal {
        final String name;
        final int weight;
        final Pattern[] patterns;

        Signal(String name, int weight, String... terms) {
            this.name = name;
            this.weight = weight;
            this.patterns = compile(terms);
        }

        boolean matches(String text) {
            for (Pattern p : patterns) if (p.matcher(text).find()) return true;
            return false;
        }
    }

    /**
     * 표현 하나를 정규식으로 바꾼다.
     * - 한글·한자·가나가 들어간 표현은 조사가 붙어도 잡히도록 부분 일치.
     * - 라틴/키릴 문자 표현은 단어 경계로 감싼다 ("war"가 "warning"에 잡히지 않게).
     *   끝에 '*'를 붙이면 접두어 일치 (예: "missile*" → missiles, "ракет*" → ракеты).
     */
    static Pattern[] compile(String... terms) {
        Pattern[] out = new Pattern[terms.length];
        for (int i = 0; i < terms.length; i++) {
            String t = terms[i].toLowerCase(Locale.ROOT);
            boolean prefix = t.endsWith("*");
            if (prefix) t = t.substring(0, t.length() - 1);
            String body = Pattern.quote(t).replace(" ", "\\E\\s*\\Q");
            String re;
            if (hasCjk(t)) {
                re = body;
            } else {
                re = "(?<![\\p{L}\\p{N}])" + body + (prefix ? "" : "(?![\\p{L}\\p{N}])");
            }
            out[i] = Pattern.compile(re, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        }
        return out;
    }

    static boolean hasCjk(String s) {
        for (int i = 0; i < s.length(); i++) {
            Character.UnicodeScript sc = Character.UnicodeScript.of(s.charAt(i));
            if (sc == Character.UnicodeScript.HANGUL || sc == Character.UnicodeScript.HAN
                    || sc == Character.UnicodeScript.HIRAGANA || sc == Character.UnicodeScript.KATAKANA) {
                return true;
            }
        }
        return false;
    }

    /** 북한·남북 관계와 관련된 기사인지 판단하는 표현. */
    static final Pattern[] RELEVANT = compile(
            "북한", "북측", "북한군", "인민군", "김정은", "평양", "남북", "한반도", "휴전선", "군사분계선", "비무장지대",
            "조선중앙", "연평도", "백령도", "접경지", "합참", "nll", "north korea*", "n. korea*", "n.korea*", "dprk", "pyongyang", "kim jong un", "kim jong-un",
            "inter-korean", "korean peninsula", "dmz", "北朝鮮", "朝鲜", "金正恩", "平壌", "平壤", "朝鮮半島", "朝鲜半岛",
            "кндр", "северн* коре*", "пхеньян*", "ким чен ын", "nordkorea*", "corée du nord", "nord-coré*",
            "corea del norte", "norcorean*", "pyongyang");

    /** 남한·접경 지역 맥락 (한반도에서 벌어지는 일인지). */
    static final Pattern[] PENINSULA = compile(
            "한국", "남한", "대한민국", "서울", "한반도", "남북", "휴전선", "군사분계선", "비무장지대", "연평", "백령",
            "접경", "국군", "합참", "south korea*", "s. korea*", "seoul", "rok", "inter-korean", "korean peninsula",
            "dmz", "mdl", "nll", "韓国", "韩国", "首尔", "ソウル", "朝鮮半島", "朝鲜半岛", "南北", "южн* коре*", "сеул*",
            "südkorea*", "corée du sud", "sud-coré*", "corea del sur", "surcorean*");

    /** 다른 전쟁(러시아-우크라이나) 맥락. */
    static final Pattern[] FOREIGN_WAR = compile(
            "우크라이나", "쿠르스크", "러시아 파병", "ukrain*", "kursk", "ウクライナ", "クルスク", "乌克兰", "库尔斯克",
            "украин*", "курск*", "ukraine", "ucrania*");

    static final List<Signal> SIGNALS = new ArrayList<>();

    static {
        // ── 매우 심각 ────────────────────────────────────────────
        SIGNALS.add(new Signal("전쟁·침공", 40,
                "전면전", "선전포고", "전쟁 발발", "전쟁이 일어", "개전", "남침", "북침", "침공",
                "declaration of war", "declares war", "declared war", "all-out war", "full-scale war",
                "war breaks out", "war broke out", "outbreak of war", "invasion", "invade*",
                "宣戦布告", "侵攻", "全面戦争", "宣战", "开战", "全面战争", "入侵",
                "объявил* войну", "вторжени*", "kriegserklärung", "invasion", "déclaration de guerre",
                "declaración de guerra", "invasión"));
        SIGNALS.add(new Signal("교전·무력충돌", 40,
                "교전", "포격전", "총격전", "무력충돌", "무력 충돌", "군사충돌", "군사 충돌", "국지전", "해전",
                "exchange of fire", "exchanged fire", "exchange fire", "firefight*", "armed clash*",
                "military clash*", "border clash*", "skirmish*", "gunfight*", "naval battle",
                "交戦", "砲撃戦", "武力衝突", "交火", "武装冲突", "军事冲突",
                "перестрелк*", "вооружённ* столкновени*", "боестолкновени*", "gefecht*", "schusswechsel",
                "échange de tirs", "affrontement* armé*", "enfrentamiento*", "intercambio de disparos"));
        SIGNALS.add(new Signal("사상자 발생", 35,
                "전사자", "전사했", "장병 사망", "군인 사망", "병사 사망", "민간인 사망", "사상자", "부상자 발생",
                "soldiers killed", "troops killed", "soldier killed", "civilians killed", "killed in attack",
                "casualties", "were killed", "was killed", "死傷", "死者", "戦死", "伤亡", "死亡", "阵亡",
                "погиб*", "убит*", "getötet", "tote soldaten", "soldats tués", "morts", "soldados muertos",
                "muertos"));
        SIGNALS.add(new Signal("핵 공격", 30,
                "핵공격", "핵 공격", "핵무기 사용", "핵 선제", "핵타격", "핵 타격",
                "nuclear strike*", "nuclear attack*", "use of nuclear weapons", "used a nuclear",
                "核攻撃", "核打击", "核攻击", "ядерн* удар*", "atomangriff*", "atomschlag", "frappe* nucléaire*",
                "ataque* nuclear*"));

        // ── 심각 ─────────────────────────────────────────────────
        SIGNALS.add(new Signal("핵실험", 25,
                "핵실험", "핵 실험", "풍계리", "nuclear test*", "nuclear detonation", "punggye-ri",
                "核実験", "核试验", "核试", "ядерн* испытани*", "atomtest*", "kernwaffentest*",
                "essai* nucléaire*", "prueba* nuclear*", "ensayo* nuclear*"));
        SIGNALS.add(new Signal("비상경계·동원", 22,
                "데프콘", "진돗개 하나", "진돗개", "전투준비태세", "동원령", "비상계엄", "전시 체제", "준전시",
                "최고 경계", "최고경계", "defcon", "combat readiness", "highest alert", "high alert",
                "mobiliz*", "mobilis*", "martial law", "state of war", "war footing",
                "戒厳", "戒严", "臨戦態勢", "战备", "мобилизац*", "боев* готовност*", "mobilmachung",
                "kriegszustand", "état de guerre", "movilización", "estado de guerra"));
        SIGNALS.add(new Signal("포격·사격", 20,
                "포격", "포탄", "해안포", "방사포", "포사격", "사격 도발",
                "artillery", "shelling", "shelled", "rocket launcher*", "multiple rocket",
                "砲撃", "多連装", "炮击", "火箭炮", "артиллер*", "обстрел*", "artillerie*", "beschuss",
                "artillería", "bombardeo*"));
        SIGNALS.add(new Signal("침범·침투", 20,
                "침범", "침투", "월선", "무인기", "드론 침투", "영공 침범", "nll 침범", "귀순",
                "incursion*", "intrusion*", "intrud*", "crossed the border", "crossed the mdl",
                "crossed into", "drone incursion*", "airspace violation*", "violated airspace",
                "領空侵犯", "越境", "侵犯", "越界", "无人机", "нарушени* границ*", "grenzverletzung*",
                "luftraumverletzung*", "violation* de l'espace aérien", "incursión*"));
        SIGNALS.add(new Signal("경고사격", 20,
                "경고사격", "경고 사격", "warning shot*", "警告射撃", "警告射击", "предупредительн* выстрел*",
                "warnschüsse", "tirs de sommation", "disparos de advertencia"));
        SIGNALS.add(new Signal("대피령", 22,
                "대피령", "대피 명령", "주민 대피", "대피소", "evacuation order*", "evacuate*", "evacuation",
                "shelter in place", "避難指示", "避難", "疏散", "эвакуац*", "evakuierung*", "évacuation*",
                "evacuación"));
        SIGNALS.add(new Signal("ICBM·신형 미사일", 20,
                "icbm", "slbm", "irbm", "대륙간탄도", "극초음속", "화성-1*", "화성포", "hwasong*",
                "hypersonic", "intercontinental ballistic", "大陸間弾道", "极超音速", "極超音速",
                "洲际导弹", "洲际弹道", "мбр", "межконтинентальн*", "hyperschall*", "interkontinental*",
                "hypersonique*", "intercontinental", "hipersónic*"));

        // ── 보통 ─────────────────────────────────────────────────
        SIGNALS.add(new Signal("미사일 발사", 12,
                "미사일", "탄도미사일", "순항미사일", "발사체",
                "missile*", "ballistic", "projectile*", "ミサイル", "弾道", "飛翔体", "导弹", "弹道",
                "ракет*", "баллистическ*", "rakete*", "raketen*", "misil*", "missile"));
        SIGNALS.add(new Signal("핵무기 위협", 10,
                "핵위협", "핵 위협", "핵무력", "핵무기", "전술핵", "핵탄두", "핵 사용", "핵물질", "우라늄 농축",
                "nuclear threat*", "nuclear weapon*", "nuclear arsenal", "tactical nuclear", "nuclear warhead*",
                "enrichment", "核兵器", "核武器", "核弾頭", "核弹头", "ядерн* оруж*", "atomwaffe*",
                "kernwaffe*", "arme* nucléaire*", "arma* nuclear*"));
        SIGNALS.add(new Signal("도발", 8,
                "도발", "provocation*", "provocative", "provoke*", "挑発", "挑衅", "провокац*",
                "provokation*", "provocación*"));
        SIGNALS.add(new Signal("정찰위성", 8,
                "정찰위성", "군사정찰위성", "위성 발사", "spy satellite*", "reconnaissance satellite*",
                "satellite launch*", "military satellite*", "偵察衛星", "侦察卫星", "спутник* шпион*",
                "aufklärungssatellit*", "satellite espion*", "satélite espía"));
        SIGNALS.add(new Signal("보복·전쟁 위협", 8,
                "불바다", "보복", "응징", "전쟁 위협", "선제타격", "선제 타격", "초토화",
                "retaliat*", "threatens war", "threatened war", "war threat*", "pre-emptive strike*",
                "preemptive strike*", "sea of fire", "報復", "报复", "先制攻撃", "先发制人",
                "возмезди*", "ответн* удар*", "vergeltung*", "représailles", "represalia*"));
        SIGNALS.add(new Signal("군사훈련", 6,
                "군사훈련", "연합훈련", "사격훈련", "기동훈련", "실사격", "합동훈련",
                "military drill*", "military exercise*", "joint drill*", "joint exercise*", "live-fire",
                "war games", "wargame*", "軍事演習", "合同演習", "军演", "军事演习", "联合演习",
                "военн* учени*", "manöver*", "militärübung*", "exercice* militaire*", "manœuvre*",
                "maniobra*", "ejercicio* militar*"));
        SIGNALS.add(new Signal("접경 긴장", 6,
                "오물풍선", "쓰레기 풍선", "대북전단", "확성기", "gps 교란", "gps 전파",
                "trash balloon*", "garbage balloon*", "leaflet*", "loudspeaker*", "gps jamming",
                "汚物風船", "ゴミ風船", "垃圾气球", "拡声器", "扩音器"));
        SIGNALS.add(new Signal("긴장 고조", 3,
                "긴장", "위협", "경고", "tension*", "escalat*", "threat*", "warn*", "緊張", "紧张", "威胁",
                "напряжённост*", "напряженност*", "эскалац*", "spannung*", "eskalation*", "escalade",
                "tensión", "escalada"));

        // ── 완화 신호 (음수) ─────────────────────────────────────
        SIGNALS.add(new Signal("대화·회담", -8,
                "회담", "대화 재개", "대화 제의", "협상", "평화", "화해", "합의",
                "talks", "summit", "dialogue", "peace", "negotiat*", "diplomacy", "détente",
                "会談", "対話", "首脳会談", "会谈", "对话", "和平", "переговор*", "диалог*",
                "gespräch*", "verhandlung*", "frieden*", "pourparlers", "négociation*", "paix",
                "diálogo", "negociacion*", "paz"));
        SIGNALS.add(new Signal("교류·인도적 지원", -4,
                "이산가족", "인도적 지원", "남북 교류", "남북협력", "humanitarian aid", "family reunion*",
                "人道支援", "人道援助", "离散家属"));
    }

    static boolean any(Pattern[] ps, String text) {
        for (Pattern p : ps) if (p.matcher(text).find()) return true;
        return false;
    }

    /** 같은 사건의 중복 기사를 합치기 위한 제목 정규화. */
    static String titleKey(String title) {
        String t = title.toLowerCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t.length() && sb.length() < 40; i++) {
            char c = t.charAt(i);
            if (Character.isLetterOrDigit(c)) sb.append(c);
        }
        return sb.toString();
    }

    public static RiskReport analyze(List<Article> raw, long now) {
        RiskReport rep = new RiskReport();
        rep.checkedAt = now;

        // 1~2. 관련성 필터 + 중복 제거 (더 최신 기사를 남김)
        Map<String, Article> unique = new LinkedHashMap<>();
        for (Article a : raw) {
            if (a.title == null || a.title.trim().isEmpty()) continue;
            if (a.timeMs > 0 && (now - a.timeMs) / 3600000.0 > MAX_AGE_HOURS) continue;
            if (!any(RELEVANT, a.title)) continue;
            String key = titleKey(a.title);
            if (key.isEmpty()) continue;
            Article prev = unique.get(key);
            if (prev == null || a.timeMs > prev.timeMs) unique.put(key, a);
        }

        double[] support = new double[SIGNALS.size()];
        int[] count = new int[SIGNALS.size()];
        Set<String> sources = new HashSet<>();
        Set<String> regions = new HashSet<>();

        for (Article a : unique.values()) {
            double ageH = a.timeMs > 0 ? Math.max(0, (now - a.timeMs) / 3600000.0) : 12.0;
            double w = Math.exp(-ageH / RECENCY_HOURS);
            boolean foreignOnly = any(FOREIGN_WAR, a.title) && !any(PENINSULA, a.title);

            a.score = 0;
            a.tags = new ArrayList<>();
            for (int i = 0; i < SIGNALS.size(); i++) {
                Signal s = SIGNALS.get(i);
                if (foreignOnly && s.weight >= 20) continue;
                if (!s.matches(a.title)) continue;
                support[i] += w;
                count[i]++;
                a.tags.add(s.name);
                a.score += s.weight;
            }
            if (a.score > 0) rep.riskyArticles++;
            if (a.source != null && !a.source.isEmpty()) sources.add(a.source.toLowerCase(Locale.ROOT));
            if (a.region != null && !a.region.isEmpty()) regions.add(a.region);
            rep.articles.add(a);
        }

        double positive = 0, negative = 0;
        for (int i = 0; i < SIGNALS.size(); i++) {
            if (count[i] == 0) continue;
            Signal s = SIGNALS.get(i);
            double c = s.weight * (1 - Math.exp(-support[i] / SATURATION));
            if (c > 0) positive += c; else negative -= c;
            rep.signals.add(new RiskReport.SignalHit(s.name, s.weight, count[i], c));
        }
        // 완화 신호는 위험 신호를 최대 절반까지만 깎는다 (회담 기사 하나로 교전 보도가 묻히지 않게).
        double rawScore = positive - Math.min(negative, positive * 0.5);
        rep.score = (int) Math.round(100 * (1 - Math.exp(-Math.max(0, rawScore) / SCALE)));
        rep.level = RiskReport.levelFor(rep.score);
        rep.totalArticles = rep.articles.size();
        rep.sourceCount = sources.size();
        rep.regionCount = regions.size();

        Collections.sort(rep.signals, (x, y) -> Double.compare(Math.abs(y.contribution), Math.abs(x.contribution)));
        Collections.sort(rep.articles, (x, y) -> Long.compare(y.timeMs, x.timeMs));
        return rep;
    }

    /** 테스트/디버그용: 신호 이름 → 가중치. */
    static Map<String, Integer> weights() {
        Map<String, Integer> m = new HashMap<>();
        for (Signal s : SIGNALS) m.put(s.name, s.weight);
        return m;
    }
}
