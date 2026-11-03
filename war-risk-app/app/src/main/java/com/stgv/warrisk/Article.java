package com.stgv.warrisk;

import java.util.ArrayList;
import java.util.List;

/** 수집한 기사 한 건. 안드로이드 API에 의존하지 않아 PC에서도 테스트할 수 있다. */
public class Article {
    public String title;
    public String url;
    public String source;   // 언론사 이름 또는 도메인
    public String region;   // 어느 나라/판에서 수집했는지 (예: "미국", "일본")
    public String lang;     // 언어 표시 (예: "EN", "KO")
    public String via;      // 수집 경로 ("Google 뉴스", "GDELT")
    public long timeMs;     // 발행(또는 수집) 시각, 모르면 0

    // RiskEngine이 채우는 값
    public int score;                       // 이 기사가 담은 위험 신호 가중치 합
    public List<String> tags = new ArrayList<>(); // 잡힌 신호 이름
    public String embassy;                  // 대사관·자국민 철수 소식이면 그 설명, 아니면 null

    // 같은 사건 묶기 결과 (대표 기사에만 채워짐)
    public int dupCount;                    // 같은 내용을 보도한 다른 기사 수
    public String otherOutlets;             // 같은 내용을 보도한 다른 언론사 (최대 4곳 + "외 N곳")
    public long storyStart;                 // 사건 첫 보도 시각

    public Article() {}

    public Article(String title, String url, String source, String region,
                   String lang, String via, long timeMs) {
        this.title = title;
        this.url = url;
        this.source = source;
        this.region = region;
        this.lang = lang;
        this.via = via;
        this.timeMs = timeMs;
    }
}
