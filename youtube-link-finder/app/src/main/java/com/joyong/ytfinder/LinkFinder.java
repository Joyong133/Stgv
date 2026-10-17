package com.joyong.ytfinder;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * 키워드 분석 → (번역) → 유튜브 검색 → 언어 검사를 거쳐 요청한 개수만큼 링크를 모은다.
 * 랜덤 모드에서는 요청 개수보다 많은 후보를 모은 뒤 섞어서 고른다.
 * 백그라운드 스레드에서 run()을 호출한다.
 */
class LinkFinder {
    interface Source {
        YouTubeSearcher.Page search(String query, String continuation) throws IOException;
    }

    interface Listener {
        void onAnalysis(String text);

        /** shown은 지금 보여줄 목록(랜덤 모드에서는 다 모을 때까지 비어 있음), collected/goal은 모은 개수/목표. */
        void onProgress(List<VideoItem> shown, int collected, int goal, int checked, int rejected);
    }

    static final class Options {
        String keyword;
        Language language;
        int count;
        boolean translate;
        boolean strict;
        boolean random;
    }

    /** 랜덤 모드에서 모을 후보 수: 요청의 3배, 단 요청보다 최소 20개·최대 100개 더. */
    static int poolSize(int count) {
        return Math.max(count + 20, Math.min(count * 3, count + 100));
    }

    private final Options opt;
    private final Source source;
    private final Translator translator;
    private final Listener listener;
    private final Random rng;
    private volatile boolean cancelled;

    LinkFinder(Options opt, Source source, Translator translator, Listener listener) {
        this(opt, source, translator, listener, new Random());
    }

    LinkFinder(Options opt, Source source, Translator translator, Listener listener, Random rng) {
        this.rng = rng;
        this.opt = opt;
        this.source = source;
        this.translator = translator;
        this.listener = listener;
    }

    void cancel() {
        cancelled = true;
    }

    boolean isCancelled() {
        return cancelled;
    }

    /** 키워드를 분석해 실제로 검색할 검색어를 정한다. */
    String analyze() {
        String keyword = opt.keyword.trim();
        String target = opt.language.base();
        String detected = null;
        String translated = null;
        try {
            Translator.Result r = translator.translate(keyword, opt.language.code);
            detected = r.detected;
            translated = r.text;
        } catch (IOException e) {
            String g = LangDetect.scriptGuess(keyword);
            if (g != null && !LangDetect.LATIN.equals(g)) detected = g;
        }

        String query = keyword;
        StringBuilder sb = new StringBuilder();
        sb.append("키워드 분석: \"").append(keyword).append("\"");
        sb.append(" · 감지된 언어: ").append(detected == null ? "알 수 없음" : Language.labelOf(detected));
        boolean differs = detected != null && !target.equals(LangDetect.base(detected));
        if (opt.translate && differs && translated != null && !translated.isEmpty()) {
            query = translated;
            sb.append("\n→ 번역한 검색어 (").append(opt.language.label).append("): \"").append(query).append("\"");
        } else if (opt.translate && differs) {
            sb.append("\n→ 번역에 실패해 원래 키워드로 검색합니다");
        } else {
            sb.append("\n→ 검색어: \"").append(query).append("\" (").append(opt.language.label).append(")");
        }
        listener.onAnalysis(sb.toString());
        return query;
    }

    /** 결과 목록을 돌려준다. 네트워크 오류는 결과가 하나도 없을 때만 던진다. */
    List<VideoItem> run() throws IOException {
        String query = analyze();
        List<VideoItem> found = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int checked = 0, rejected = 0, pages = 0;
        int goal = opt.random ? poolSize(opt.count) : opt.count;
        int maxPages = Math.min(40, goal / 4 + 6);
        String continuation = null;
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            while (!cancelled && found.size() < goal && pages < maxPages) {
                YouTubeSearcher.Page page;
                try {
                    page = source.search(query, continuation);
                } catch (IOException e) {
                    if (found.isEmpty()) throw e;
                    break;
                }
                pages++;
                List<VideoItem> fresh = new ArrayList<>();
                for (VideoItem v : page.items) {
                    if (seen.add(v.id)) fresh.add(v);
                }
                boolean[] ok = checkLanguages(fresh, pool);
                for (int i = 0; i < fresh.size() && found.size() < goal; i++) {
                    checked++;
                    if (ok[i]) found.add(fresh.get(i));
                    else rejected++;
                }
                List<VideoItem> shown = opt.random ? new ArrayList<VideoItem>() : new ArrayList<>(found);
                listener.onProgress(shown, found.size(), goal, checked, rejected);
                if (page.next == null || page.next.equals(continuation)) break;
                continuation = page.next;
            }
        } finally {
            pool.shutdownNow();
        }
        if (opt.random) {
            Collections.shuffle(found, rng);
            if (found.size() > opt.count) found = new ArrayList<>(found.subList(0, opt.count));
        }
        return found;
    }

    private boolean[] checkLanguages(final List<VideoItem> items, ExecutorService pool) {
        boolean[] ok = new boolean[items.size()];
        if (!opt.strict) {
            for (int i = 0; i < ok.length; i++) ok[i] = true;
            return ok;
        }
        List<Future<Boolean>> futures = new ArrayList<>();
        for (final VideoItem v : items) {
            futures.add(pool.submit(new Callable<Boolean>() {
                @Override
                public Boolean call() {
                    return matchesLanguage(v.title);
                }
            }));
        }
        for (int i = 0; i < futures.size(); i++) {
            try {
                ok[i] = futures.get(i).get();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (ExecutionException e) {
                ok[i] = true;
            }
        }
        return ok;
    }

    boolean matchesLanguage(String title) {
        String target = opt.language.base();
        String guess = LangDetect.scriptGuess(title);
        if (!LangDetect.isLatinLanguage(target)) return target.equals(guess);
        if (!LangDetect.LATIN.equals(guess)) return false;
        String detected = translator.detect(title);
        // 감지에 실패하면 유튜브의 언어·지역 설정을 믿고 통과시킨다
        return detected == null || target.equals(LangDetect.base(detected));
    }
}
