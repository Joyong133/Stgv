package com.joyong.ytfinder;

final class VideoItem {
    final String id;
    final String title;
    final String channel;
    final String duration;
    final String views;
    final String published;

    VideoItem(String id, String title, String channel, String duration, String views, String published) {
        this.id = id;
        this.title = title;
        this.channel = channel;
        this.duration = duration;
        this.views = views;
        this.published = published;
    }

    String url() {
        return "https://www.youtube.com/watch?v=" + id;
    }

    String meta() {
        StringBuilder sb = new StringBuilder();
        for (String s : new String[] {channel, duration, views, published}) {
            if (s == null || s.isEmpty()) continue;
            if (sb.length() > 0) sb.append(" · ");
            sb.append(s);
        }
        return sb.toString();
    }
}
