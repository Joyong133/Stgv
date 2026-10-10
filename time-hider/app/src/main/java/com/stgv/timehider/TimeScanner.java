package com.stgv.timehider;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Rect;
import android.os.Handler;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 화면에서 시간 표시의 위치를 찾는다. 모든 메서드는 스캔 전용 스레드에서만 부른다.
 *
 * <p>빠르게 반응하면서도 휴대폰을 느리게 만들지 않도록:
 * <ul>
 *   <li>바뀐 창만 다시 훑고, 나머지 창은 이전 결과를 그대로 쓴다.</li>
 *   <li>글자만 바뀐 경우(시계가 넘어가는 등)는 그 글자 하나만 확인한다.</li>
 *   <li>스크롤 중에는 이미 찾은 상자를 스크롤만큼 바로 옮기고, 다시 훑는 건 가끔만 한다.
 *       다시 훑으면 그 앱의 화면 스레드가 바빠져서 스크롤이 끊기기 때문이다.</li>
 * </ul>
 */
final class TimeScanner {

    interface Listener {
        /** 새로 찾은 상자들(화면 좌표). 스캔 스레드에서 불린다. */
        void onRects(List<Rect> rects);
    }

    private static final long MIN_GAP_MS = 40;
    private static final long SCROLL_RESCAN_GAP_MS = 150;
    private static final long SCROLL_SETTLE_MS = 250;
    private static final int MAX_NODES_PER_WINDOW = 3000;
    private static final int UNKNOWN_WINDOW = -1;
    private static final float PAD_DP = 3;

    private final AccessibilityService service;
    private final Handler handler;
    private final Listener listener;

    private final Map<Integer, List<Rect>> rectsByWindow = new HashMap<>();
    private final Set<Integer> dirty = new HashSet<>();
    private final Map<Integer, Scroll> scrolls = new HashMap<>();
    private boolean allDirty = true;
    private boolean scanQueued;
    private boolean scrollScanQueued;
    private long lastScan;

    /** 스크롤 중인 창의 상태. */
    private static final class Scroll {
        final Rect area = new Rect();
        int dx;
        int dy;
        long lastEvent;
    }

    private final Runnable scanRunnable = () -> {
        scanQueued = false;
        scan();
    };

    private final Runnable scrollScanRunnable = this::onScrollTick;

    TimeScanner(AccessibilityService service, Handler scanHandler, Listener listener) {
        this.service = service;
        this.handler = scanHandler;
        this.listener = listener;
    }

    /** 모든 창을 처음부터 다시 훑는다. */
    void rescanAll() {
        allDirty = true;
        requestScan();
    }

    /** 결과를 모두 버린다(숨기기를 끌 때). */
    void reset() {
        handler.removeCallbacks(scanRunnable);
        handler.removeCallbacks(scrollScanRunnable);
        scanQueued = false;
        scrollScanQueued = false;
        rectsByWindow.clear();
        dirty.clear();
        scrolls.clear();
        allDirty = true;
    }

    boolean isScrolling() {
        return !scrolls.isEmpty();
    }

    /** 창이 새로 뜨거나 내용이 크게 바뀌었을 때. */
    void onWindowChanged(int windowId) {
        if (windowId == UNKNOWN_WINDOW) {
            allDirty = true;
        } else if (scrolls.containsKey(windowId)) {
            // 스크롤 중인 창은 가끔만 다시 훑는다.
            scheduleScrollTick();
            return;
        } else {
            dirty.add(windowId);
        }
        requestScan();
    }

    /** 글자만 바뀌었을 때: 그 요소 하나만 확인한다. */
    void onTextChanged(int windowId, AccessibilityNodeInfo node) {
        List<Rect> list = rectsByWindow.get(windowId);
        if (list == null || allDirty || dirty.contains(windowId)) {
            onWindowChanged(windowId);
            return;
        }
        Rect hit = node.isVisibleToUser() ? match(node) : null;
        if (hit != null) {
            if (!list.contains(hit)) {
                list.add(hit);
                publish();
            }
            return;
        }
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        int pad = pad();
        bounds.inset(-pad, -pad);
        if (list.remove(bounds)) publish();
    }

    /**
     * 스크롤했을 때: 이미 찾은 상자를 스크롤한 만큼 바로 옮기고, 다음 움직임까지 덮도록 늘려서 그린다.
     *
     * @param dx 가로로 스크롤한 양(px). 모르면 0.
     * @param dy 세로로 스크롤한 양(px). 아래로 스크롤하면 양수(내용은 위로 움직임). 모르면 0.
     */
    void onScrolled(int windowId, AccessibilityNodeInfo source, int dx, int dy) {
        Scroll scroll = scrolls.get(windowId);
        if (scroll == null) {
            scroll = new Scroll();
            scrolls.put(windowId, scroll);
        }
        Rect area = new Rect();
        if (source != null) source.getBoundsInScreen(area);
        if (area.isEmpty()) area.set(screenBounds());
        scroll.area.set(area);
        scroll.dx = dx;
        scroll.dy = dy;
        scroll.lastEvent = SystemClock.uptimeMillis();

        List<Rect> list = rectsByWindow.get(windowId);
        if (list != null && (dx != 0 || dy != 0)) {
            for (Iterator<Rect> it = list.iterator(); it.hasNext(); ) {
                Rect r = it.next();
                if (!Rect.intersects(r, area)) continue;
                r.offset(-dx, -dy);
                if (!r.intersect(area)) it.remove();
            }
        }
        publish();
        scheduleScrollTick();
    }

    private void scheduleScrollTick() {
        if (scrollScanQueued) return;
        scrollScanQueued = true;
        handler.postDelayed(scrollScanRunnable, SCROLL_RESCAN_GAP_MS);
    }

    /** 스크롤 중에는 가끔씩, 멈추면 마지막으로 한 번 정확히 다시 훑는다. */
    private void onScrollTick() {
        scrollScanQueued = false;
        long now = SystemClock.uptimeMillis();
        boolean stillScrolling = false;
        for (Iterator<Map.Entry<Integer, Scroll>> it = scrolls.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<Integer, Scroll> e = it.next();
            dirty.add(e.getKey());
            if (now - e.getValue().lastEvent >= SCROLL_SETTLE_MS) {
                it.remove();
            } else {
                stillScrolling = true;
            }
        }
        requestScan();
        if (stillScrolling) scheduleScrollTick();
    }

    private void requestScan() {
        if (scanQueued) return;
        scanQueued = true;
        long wait = lastScan + MIN_GAP_MS - SystemClock.uptimeMillis();
        // 바로 처리하되, 이미 줄 서 있는 이벤트들이 먼저 반영되도록 큐 끝에 넣는다.
        if (wait <= 0) {
            handler.post(scanRunnable);
        } else {
            handler.postDelayed(scanRunnable, wait);
        }
    }

    private void scan() {
        lastScan = SystemClock.uptimeMillis();
        List<AccessibilityWindowInfo> windows;
        try {
            windows = service.getWindows();
        } catch (RuntimeException e) {
            windows = Collections.emptyList();
        }
        Set<Integer> alive = new HashSet<>();
        for (AccessibilityWindowInfo window : windows) {
            if (window.getType() == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue;
            int id = window.getId();
            alive.add(id);
            if (!allDirty && !dirty.contains(id) && rectsByWindow.containsKey(id)) continue;
            rectsByWindow.put(id, collect(safeRoot(window)));
        }
        if (alive.isEmpty()) {
            alive.add(UNKNOWN_WINDOW);
            AccessibilityNodeInfo root = null;
            try {
                root = service.getRootInActiveWindow();
            } catch (RuntimeException ignored) {
            }
            rectsByWindow.put(UNKNOWN_WINDOW, collect(root));
        }
        rectsByWindow.keySet().retainAll(alive);
        scrolls.keySet().retainAll(alive);
        allDirty = false;
        dirty.clear();
        publish();
    }

    private static AccessibilityNodeInfo safeRoot(AccessibilityWindowInfo window) {
        try {
            return window.getRoot();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void publish() {
        List<Rect> merged = new ArrayList<>();
        for (Map.Entry<Integer, List<Rect>> e : rectsByWindow.entrySet()) {
            Scroll scroll = scrolls.get(e.getKey());
            for (Rect r : e.getValue()) {
                Rect out = new Rect(r);
                if (scroll != null && Rect.intersects(r, scroll.area)) {
                    // 다음 스크롤 이벤트가 올 때까지 움직일 길(약 1.5배)과, 위치가 조금 어긋났을 때를 대비해
                    // 직전 위치까지 함께 덮는다.
                    Rect ahead = new Rect(r);
                    ahead.offset(-scroll.dx * 3 / 2, -scroll.dy * 3 / 2);
                    Rect behind = new Rect(r);
                    behind.offset(scroll.dx, scroll.dy);
                    out.union(ahead);
                    out.union(behind);
                    if (!out.intersect(scroll.area)) continue;
                }
                merged.add(out);
            }
        }
        listener.onRects(merged);
    }

    private List<Rect> collect(AccessibilityNodeInfo root) {
        List<Rect> out = new ArrayList<>();
        if (root == null || isOwnApp(root)) return out;
        ArrayDeque<AccessibilityNodeInfo> stack = new ArrayDeque<>();
        stack.push(root);
        int visited = 0;
        try {
            while (!stack.isEmpty() && visited++ < MAX_NODES_PER_WINDOW) {
                AccessibilityNodeInfo node = stack.pop();
                if (!node.isVisibleToUser()) continue;
                Rect hit = match(node);
                if (hit != null) {
                    out.add(hit);
                    continue;
                }
                for (int i = node.getChildCount() - 1; i >= 0; i--) {
                    AccessibilityNodeInfo child = node.getChild(i);
                    if (child != null) stack.push(child);
                }
            }
        } catch (RuntimeException ignored) {
            // 훑는 도중에 창이 사라진 경우 등: 찾은 데까지만 쓴다.
        }
        return out;
    }

    /** 가려야 할 요소면 가릴 상자를, 아니면 null. 너무 큰 묶음이면 null을 돌려 안쪽을 계속 찾게 한다. */
    private Rect match(AccessibilityNodeInfo node) {
        boolean textHit = TimePatterns.containsTime(node.getText());
        // 설명(contentDescription)은 여러 내용을 묶어 둔 큰 묶음에도 붙기 때문에 맨 끝 요소에서만 본다.
        boolean descHit = !textHit && node.getChildCount() == 0
                && TimePatterns.containsTime(node.getContentDescription());
        // 이름이 clock·time인 요소: 그림으로 그린 시계, 시계 위젯, 알림의 "5분" 칸 등
        boolean idHit = !textHit && !descHit
                && TimePatterns.isTimeViewId(node.getViewIdResourceName());
        if (!textHit && !descHit && !idHit) return null;

        Rect r = new Rect();
        node.getBoundsInScreen(r);
        if (r.isEmpty()) return null;
        DisplayMetrics dm = service.getResources().getDisplayMetrics();
        boolean sizeOk = textHit
                || (descHit && r.height() < dm.heightPixels / 2)
                || (idHit && (long) r.width() * r.height() <= (long) dm.widthPixels * dm.heightPixels / 2);
        if (!sizeOk) return null;
        int pad = pad();
        r.inset(-pad, -pad);
        return r;
    }

    /** 이 앱 화면의 설정 글자("시간 글자 가리기" 등)는 가리지 않는다. */
    private boolean isOwnApp(AccessibilityNodeInfo root) {
        CharSequence pkg = root.getPackageName();
        return pkg != null && service.getPackageName().contentEquals(pkg);
    }

    private int pad() {
        return Math.round(PAD_DP * service.getResources().getDisplayMetrics().density);
    }

    private Rect screenBounds() {
        DisplayMetrics dm = service.getResources().getDisplayMetrics();
        return new Rect(0, 0, dm.widthPixels, dm.heightPixels);
    }
}
