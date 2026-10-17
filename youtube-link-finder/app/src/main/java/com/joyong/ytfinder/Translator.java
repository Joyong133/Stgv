package com.joyong.ytfinder;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Map;

/** Google 번역 공개 엔드포인트로 번역과 언어 감지를 한다 (API 키 불필요). */
class Translator {
    static final class Result {
        final String text;
        final String detected;

        Result(String text, String detected) {
            this.text = text;
            this.detected = detected;
        }
    }

    private final Map<String, String> detectCache = new HashMap<>();

    Result translate(String text, String target) throws IOException {
        String url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl="
                + URLEncoder.encode(target, "UTF-8") + "&dt=t&q=" + URLEncoder.encode(text, "UTF-8");
        try {
            return parse(Http.get(url, null));
        } catch (JSONException e) {
            throw new IOException("번역 응답을 읽지 못했습니다", e);
        }
    }

    /** 텍스트의 언어 코드. 실패하면 null. */
    String detect(String text) {
        synchronized (detectCache) {
            if (detectCache.containsKey(text)) return detectCache.get(text);
        }
        String code;
        try {
            code = translate(text, "en").detected;
        } catch (IOException e) {
            code = null;
        }
        synchronized (detectCache) {
            detectCache.put(text, code);
        }
        return code;
    }

    static Result parse(String body) throws JSONException {
        JSONArray root = new JSONArray(body);
        StringBuilder sb = new StringBuilder();
        JSONArray segs = root.optJSONArray(0);
        if (segs != null) {
            for (int i = 0; i < segs.length(); i++) {
                JSONArray seg = segs.optJSONArray(i);
                if (seg != null && !seg.isNull(0)) sb.append(seg.optString(0));
            }
        }
        String detected = root.length() > 2 && !root.isNull(2) ? root.optString(2, null) : null;
        return new Result(sb.toString().trim(), detected);
    }
}
