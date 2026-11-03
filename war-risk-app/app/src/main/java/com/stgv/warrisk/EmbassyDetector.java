package com.stgv.warrisk;

import java.util.regex.Pattern;

import static com.stgv.warrisk.RiskEngine.any;
import static com.stgv.warrisk.RiskEngine.compile;

/**
 * 기사 제목에서 '한반도에서 외국 대사관이 철수/대피/폐쇄한다' 또는
 * '자국민에게 한국(북한)을 떠나라고 권고했다'는 소식을 찾고, 어느 나라인지 뽑아낸다.
 *
 * 전쟁 직전에 각국이 대사관 직원과 자국민부터 빼는 경우가 많아, 일반 기사 신호보다 무겁게 본다.
 * 대피 '훈련', 공관 '재개', 다른 나라(이스라엘·우크라이나 등)에서의 철수는 제외한다.
 */
public class EmbassyDetector {

    public static final int TYPE_EMBASSY = 0;  // 대사관·영사관 철수/폐쇄
    public static final int TYPE_CITIZEN = 1;  // 자국민 철수·출국 권고·여행금지
    public static final String[] TYPE_NAMES = {"대사관 철수", "자국민 철수·여행경보"};

    public static final String LOC_SEOUL = "서울(한국)";
    public static final String LOC_PYONGYANG = "평양(북한)";

    public static class Event {
        public int type;
        public String location;
        public String country; // 철수하는 나라 (모르면 "국가 미상")

        public String label() {
            return TYPE_NAMES[type] + " · " + location;
        }
    }

    static final Pattern[] EMBASSY = compile(
            "대사관", "영사관", "공관", "외교관", "대사관 직원", "embass*", "consulate*", "diplomat*",
            "大使館", "領事館", "外交官", "大使馆", "领事馆", "посольств*", "консульств*", "дипломат*",
            "botschaft*", "konsulat*", "ambassade*", "consulat*", "embajada*", "consulado*");

    static final Pattern[] WITHDRAW = compile(
            "철수", "대피", "폐쇄", "소개령", "직원 감축", "인력 감축", "출국", "귀국 명령",
            "withdraw*", "evacuat*", "pull out", "pulls out", "pulled out", "pulling out",
            "ordered departure", "authorized departure", "drawdown", "draw down", "reduce staff",
            "shut*", "closes", "closed", "closure", "close its", "relocat*", "suspend*", "leave", "leaves", "flee*",
            "撤収", "退避", "閉鎖", "撤退", "撤离", "撤侨", "关闭", "撤出",
            "эвакуац*", "эвакуир*", "закры*", "отзыв*", "покин*",
            "evakuier*", "schließ*", "geschlossen", "abzug", "abgezogen", "zieht ab",
            "évacu*", "ferme*", "fermeture", "retir*", "evacu*", "cierr*", "retira*");

    static final Pattern[] CITIZEN_EVAC = compile(
            "자국민 철수", "교민 철수", "국민 철수", "자국민 대피", "교민 대피", "출국 권고", "출국을 권고",
            "철수 권고", "철수를 권고", "여행금지", "여행 금지", "여행경보", "여행 경보", "떠나라",
            "leave south korea", "leave seoul", "leave the country", "leave korea", "leave north korea",
            "citizens to leave", "nationals to leave", "evacuate citizens", "evacuate nationals",
            "evacuation of citizens", "evacuation of nationals", "do not travel", "level 4", "travel ban",
            "travel advisory", "travel warning",
            "退避勧告", "渡航中止", "渡航中止勧告", "邦人退避", "邦人", "撤侨", "撤离侨民", "旅行警告",
            "покинуть", "эвакуац* граждан*", "reisewarnung", "ausreise*", "verlassen",
            "quitter la corée", "évacuation des ressortissants", "ressortissants",
            "abandonar corea", "evacuar a sus ciudadanos", "alerta de viaje");

    /** 실제 철수가 아닌 경우: 훈련, 재개, 복귀, 북한의 해외공관 정리 등. */
    static final Pattern[] NOT_EVENT = compile(
            "훈련", "재개", "복귀", "재가동", "재개관", "해외 공관", "해외공관", "재외공관", "재외 공관", "탈북", "망명", "귀순",
            "defect*", "asylum", "叛逃", "脱北", "亡命",
            "drill*", "exercise*", "rehears*", "reopen*", "re-open*", "return*", "resum*", "abroad", "overseas",
            "訓練", "再開", "演习", "演练", "重开", "返回", "учени*", "возобнов*", "вернул*",
            "übung*", "wiedereröffn*", "rückkehr", "exercice*", "réouverture", "retour",
            "simulacro*", "reapertura", "regres*");

    /** 철수 장소가 한반도가 아닌 경우 (예: 한국 정부가 이스라엘 교민을 철수). */
    static final Pattern[] FOREIGN_LOC = compile(
            "이스라엘", "레바논", "우크라이나", "수단", "가자", "대만", "미얀마", "시리아", "예멘", "리비아",
            "아프간", "아이티", "니제르", "이란 ", "이란에서", "이란 내",
            "israel*", "lebanon", "ukrain*", "sudan", "gaza", "taiwan", "myanmar", "syria*", "yemen", "libya*",
            "afghanistan", "haiti", "niger", "iran", "venezuela", "kyiv",
            "以色列", "イスラエル", "黎巴嫩", "レバノン", "乌克兰", "ウクライナ", "伊朗", "イラン", "台湾",
            "израил*", "ливан*", "украин*", "иран*", "israël", "liban", "ukraine", "irán");

    static final Pattern[] SEOUL_CITY = compile("서울", "주한", "seoul", "ソウル", "首尔", "сеул*", "séoul", "seúl");
    static final Pattern[] PY_CITY = compile("평양", "주북", "pyongyang", "平壌", "平壤", "пхеньян*");
    static final Pattern[] SK_COUNTRY = compile(
            "남한", "한국 내", "한국에서", "한국 체류", "한국 여행", "한국행", "한국 주재", "방한", "한국 출국",
            "한국을 떠", "south korea*", "s. korea*", "s.korea*", "韓国", "韩国", "южн* коре*", "südkorea*",
            "corée du sud", "corea del sur", "korea");
    static final Pattern[] NK_COUNTRY = compile(
            "북한", "north korea*", "n. korea*", "dprk", "北朝鮮", "朝鲜", "кндр", "северн* коре*",
            "nordkorea*", "corée du nord", "corea del norte");

    /** 나라 이름 → 그 나라를 가리키는 여러 언어 표현. 한국은 철수 '대상지'이므로 넣지 않는다. */
    static final String[][] COUNTRIES = {
            {"미국", "미국", "주한미", "美,", "美 정부", "美 국무부", "美대사관", "美国", "美驻", "u.s.", "us embassy", "us citizens", "us nationals",
                    "us state department", "us orders", "united states", "american*", "washington",
                    "米国", "米大使館", "美国", "美驻", "сша", "американ*", "usa", "amerikan*",
                    "états-unis", "américain*", "estados unidos", "estadounidense*", "ee.uu"},
            {"일본", "일본", "日,", "日 정부", "日 외무성", "japan*", "tokyo", "日本", "邦人", "япон*", "japon*"},
            {"중국", "중국", "中,", "中 정부", "中 외교부", "china", "chinese", "beijing", "中国", "中國", "китай*", "chinesisch*",
                    "chine", "chinois*"},
            {"러시아", "러시아", "russia*", "moscow", "俄罗斯", "ロシア", "росси*", "russisch*", "russie", "rusia",
                    "ruso*"},
            {"영국", "영국", "britain", "british", "uk", "u.k.", "英国", "イギリス", "британ*", "britisch*",
                    "großbritannien", "royaume-uni", "britannique*", "reino unido", "británic*"},
            {"프랑스", "프랑스", "france", "french", "法国", "フランス", "франц*", "frankreich", "französisch*",
                    "français*", "francia", "francés*"},
            {"독일", "독일", "germany", "german*", "德国", "ドイツ", "герман*", "deutschland", "deutsche*",
                    "allemagne", "allemand*", "alemania", "alemán*"},
            {"캐나다", "캐나다", "canada*", "加拿大", "カナダ", "канад*", "kanada*"},
            {"호주", "호주", "australia*", "澳大利亚", "澳洲", "オーストラリア", "австрал*", "australien*"},
            {"이탈리아", "이탈리아", "italy", "italian*", "意大利", "イタリア", "итал*", "italien*", "italie"},
            {"스페인", "스페인", "spain", "spanish", "西班牙", "スペイン", "испан*", "spanien", "espagne", "españa"},
            {"스웨덴", "스웨덴", "sweden", "swedish", "瑞典", "スウェーデン", "швец*", "schweden"},
            {"스위스", "스위스", "switzerland", "swiss", "瑞士", "スイス", "швейцар*", "schweiz*", "suisse"},
            {"폴란드", "폴란드", "poland", "polish", "波兰", "ポーランド", "польш*", "polen"},
            {"인도", "인도 대사관", "인도 정부", "주한인도", "india", "indian", "印度", "インド", "инди*", "indien"},
            {"인도네시아", "인도네시아", "indonesia*", "印尼", "インドネシア", "индонез*"},
            {"베트남", "베트남", "vietnam*", "越南", "ベトナム", "вьетнам*"},
            {"필리핀", "필리핀", "philippine*", "filipino*", "菲律宾", "フィリピン", "филиппин*"},
            {"태국", "태국", "thailand", "thai", "泰国", "таиланд*"},
            {"몽골", "몽골", "mongolia*", "蒙古", "モンゴル", "монгол*"},
            {"싱가포르", "싱가포르", "singapore*", "新加坡", "シンガポール", "сингапур*"},
            {"대만", "대만", "taiwanese", "台湾人"},
            {"뉴질랜드", "뉴질랜드", "new zealand*", "新西兰", "ニュージーランド"},
            {"튀르키예", "튀르키예", "터키", "turkey", "turkish", "türkiye", "土耳其", "トルコ"},
            {"이스라엘", "이스라엘 대사관", "israeli embassy"},
            {"네덜란드", "네덜란드", "netherlands", "dutch", "荷兰", "オランダ", "нидерланд*"},
            {"노르웨이", "노르웨이", "norway", "norwegian", "挪威", "ノルウェー"},
            {"체코", "체코", "czech*", "捷克", "チェコ"},
            {"쿠바", "쿠바", "cuba*", "古巴", "キューバ", "куб*"},
            {"이집트", "이집트", "egypt*", "埃及", "エジプト", "египет*"},
            {"EU", "유럽연합", "eu", "european union", "欧盟", "欧州連合", "евросоюз*"},
    };

    static final Pattern[][] COUNTRY_PATTERNS = new Pattern[COUNTRIES.length][];
    static {
        for (int i = 0; i < COUNTRIES.length; i++) {
            String[] terms = new String[COUNTRIES[i].length - 1];
            System.arraycopy(COUNTRIES[i], 1, terms, 0, terms.length);
            COUNTRY_PATTERNS[i] = compile(terms);
        }
    }

    static final Pattern[] STRONG_CITIZEN = compile("level 4", "여행금지", "여행 금지", "do not travel",
            "travel ban", "渡航中止", "退避勧告", "떠나라", "leave*", "покинуть", "verlassen", "quitter");

    static boolean startsWithNk(String title) {
        String head = title.length() > 16 ? title.substring(0, 16) : title;
        return any(NK_COUNTRY, head);
    }

    /** 철수 소식이면 Event, 아니면 null. */
    public static Event detect(String title) {
        if (title == null) return null;
        // 'u.s.'의 점, '美 ' 뒤 공백 같은 표현이 붙어 있어도 잡히도록 끝에 공백을 하나 붙인다.
        String t = title + " ";
        boolean embassy = any(EMBASSY, t) && any(WITHDRAW, t);
        boolean citizen = any(CITIZEN_EVAC, t);
        if (!embassy && !citizen) return null;
        if (any(NOT_EVENT, t)) return null;

        boolean seoul = any(SEOUL_CITY, t), py = any(PY_CITY, t);
        if (!seoul && !py && any(FOREIGN_LOC, t)) return null;

        String loc;
        if (seoul) loc = LOC_SEOUL;
        else if (py) loc = LOC_PYONGYANG;
        else if (any(SK_COUNTRY, t) && !any(NK_COUNTRY, t)) loc = LOC_SEOUL;
        else if (any(NK_COUNTRY, t)) loc = LOC_PYONGYANG;
        else if (any(SK_COUNTRY, t)) loc = LOC_SEOUL;
        else return null; // 한반도와 무관

        // 여행경보 단어만 있고 철수·출국 의미가 약한 경우("여행경보 유지") 제외
        if (!embassy && !any(WITHDRAW, t) && !any(STRONG_CITIZEN, t)) return null;

        // "북한, 스페인 대사관 폐쇄"처럼 북한이 해외 공관을 정리하는 소식은 한반도 위험과 무관
        if (embassy && !citizen && !seoul && !py && startsWithNk(title)) return null;

        Event e = new Event();
        e.type = embassy ? TYPE_EMBASSY : TYPE_CITIZEN;
        e.location = loc;
        e.country = "국가 미상";
        for (int i = 0; i < COUNTRIES.length; i++) {
            if (any(COUNTRY_PATTERNS[i], t)) {
                e.country = COUNTRIES[i][0];
                break;
            }
        }
        return e;
    }
}
